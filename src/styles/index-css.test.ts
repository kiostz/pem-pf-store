// Tests for the stylesheet's theme rules: dark values must never reach paper, whatever the theme pick or the system setting.

import { readFileSync } from 'node:fs' // reads index.css
import { resolve } from 'node:path' // the path to index.css
import { describe, expect, it } from 'vitest' // test API

const css = readFileSync(
  resolve(process.cwd(), 'src/styles/index.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '') // the stylesheet without comments as shipped; vitest runs from the project root

/**
 * Lists, for every place a declaration appears, the at-rules it sits inside.
 * @param source the CSS text
 * @param declaration the declaration text to find, e.g. '--color-bg-app: #000000'
 * @return one list of enclosing at-rule headers per match, outermost first
 */
function enclosingAtRules(source: string, declaration: string): string[][] {
  const stack: string[] = [] // header text of each open block; '' for a plain rule
  const found: string[][] = [] // result
  let header = '' // text since the last brace or semicolon
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') {
      stack.push(header.trim()) // enter a block
      header = ''
    } else if (char === '}') {
      stack.pop() // leave a block
      header = ''
    } else if (char === ';') {
      header = ''
    } else {
      header += char
    }
    if (source.startsWith(declaration, index) && char === declaration[0])
      found.push(stack.filter((text) => text.startsWith('@'))) // the at-rules around this declaration
  }
  return found
}

describe('index.css dark values', () => {
  it('are written both for the Dark pick and for System-dark, each only for screens', () => {
    // catches: dark tokens applying in print, which gave a dark-OS buyer near-white text on paper
    const matches = enclosingAtRules(css, '--color-bg-app: #000000')
    expect(matches).toHaveLength(2) // the Dark pick and the System-dark block
    for (const atRules of matches)
      expect(atRules.some((rule) => /^@media\s+screen\b/.test(rule))).toBe(true)
  })
})

describe('index.css print block', () => {
  it('sets the light page and ink colours for every page and for a picked theme', () => {
    // catches: a picked Dark theme outranking the print values, so paper gets dark-on-dark
    const print = css.slice(css.indexOf('@media print')) // the print block runs to the end of the file
    expect(print).toMatch(/:root\s*,\s*:root\[data-theme\]\s*\{/)
    expect(print).toContain('--color-bg-app: #ffffff')
    expect(print).toContain('--color-text-default: #1d1d1f')
  })
})

describe('index.css emblem trace', () => {
  /**
   * Reads a block's text, from its header to the block's own closing brace.
   * @param header the text before the opening brace
   * @return the text inside the braces
   */
  function block(header: string): string {
    const start = css.indexOf(`${header} {`) // block start
    if (start < 0) throw new Error(`index.css has no block "${header}"`) // the test's own precondition
    let depth = 0 // open braces
    for (let at = css.indexOf('{', start); at < css.length; at += 1) {
      if (css[at] === '{') depth += 1 // opens
      if (css[at] === '}') depth -= 1 // closes
      if (depth === 0) return css.slice(css.indexOf('{', start) + 1, at) // the inside
    }
    throw new Error('unclosed block') // malformed css
  }

  it('leaves none of the stacked SVG trace layers, rider or CSS flicker behind', () => {
    // catches: the three tails, the rider or the flicker returning on top of the canvas
    for (const name of ['trace-tail', 'trace-rider', 'trace-ride', 'trace-rays', 'trace-build', 'trace-flicker']) {
      expect(css).not.toContain(name)
    }
    expect(css).not.toMatch(/offset-path/)
  })

  it('blurs and adds the bloom canvas', () => {
    // catches: a bloom that is sharp, or one that covers the band instead of adding light to it
    const rule = css.match(/\.emblem-bloom\s*\{[^}]*\}/)?.[0] ?? '' // the bloom rule
    expect(rule).toMatch(/filter:\s*blur\(8px\)/)
    expect(rule).toMatch(/mix-blend-mode:\s*plus-lighter/)
  })

  it('hides both canvases under Reduce Motion and keeps the tab pill rules there', () => {
    // catches: motion for people who asked for none, or the tab pill losing its Reduce Motion rules
    const reduced = block('@media (prefers-reduced-motion: reduce)')
    expect(reduced).toContain('.emblem-canvas')
    expect(reduced).toContain('.emblem-bloom')
    expect(reduced).toMatch(/display:\s*none/)
    expect(reduced).toContain('.pill-tab')
    expect(reduced).toContain('.pill-content')
  })

  it('defines the plain tile-name halo and no stronger one', () => { // the halo token
    // catches: a halo class with no token behind it
    expect(css).toMatch(/--text-shadow-halo:/)
    expect(css).not.toContain('--text-shadow-halo-strong') // catches the orphaned strong halo returning
  })

  it('keeps the whole play under 5 seconds, with no repeat, and drops the two CSS-ride tokens', () => {
    // catches: a WCAG 2.2.2 regression, or tokens left that nothing reads
    expect(css).toMatch(/--duration-trace:\s*4800ms/)
    expect(css.match(/\.emblem-[a-z]+\s*\{[^}]*\}/g)?.join('') ?? '').not.toMatch(/animation/) // the canvases are moved by script, never by a CSS loop
    expect(css).not.toContain('--duration-trace-build')
    expect(css).not.toContain('--duration-trace-flicker')
  })
})

describe('index.css theme select', () => {
  it('has no .theme-select rule left, and keeps the category filter and club select base-select rules', () => {
    // catches: dead rules for the removed dropdown, or the shared rules lost with them
    expect(css).not.toContain('.theme-select')
    expect(css).toContain('.category-filter')
    expect(css).toContain('.club-select')
    expect(css).toContain('appearance: base-select')
  })
})

describe('index.css tab pill', () => {
  /**
   * Reads the text of a rule or at-rule block from its header to its own closing brace.
   * @param header the text before the opening brace
   * @return the text inside the braces
   */
  function inside(header: string): string {
    const start = css.indexOf(`${header} {`) // block start
    if (start < 0) throw new Error(`index.css has no block "${header}"`) // the test's own precondition
    let depth = 0 // open braces
    for (let at = css.indexOf('{', start); at < css.length; at += 1) {
      if (css[at] === '{') depth += 1 // opens
      if (css[at] === '}') depth -= 1 // closes
      if (depth === 0) return css.slice(css.indexOf('{', start) + 1, at) // the inside
    }
    throw new Error('unclosed block') // malformed css
  }

  it('defines the pill shadow, the 250 ms toggle duration and the on-screen easing as tokens', () => {
    // catches: a pill whose shadow, duration or easing is a literal in a component
    expect(css).toMatch(/--shadow-pill:\s*0 6px 20px rgb\(74 21 32 \/ 0\.16\)/)
    expect(css).toMatch(/\.pill-edge\s*\{[^}]*box-shadow:\s*var\(--shadow-pill\)/) // read through the variable, so the dark override reaches it
    expect(css).toMatch(/--duration-toggle:\s*250ms/)
    expect(css).toMatch(/--ease-in-out-soft:\s*cubic-bezier\(0\.65,\s*0,\s*0\.35,\s*1\)/)
  })

  it('swaps the pill shadow for a border-subtle hairline in both dark blocks', () => {
    // catches: a shadow that does not read on black, so the pill melts into the page in Dark
    const hairline = /--shadow-pill:\s*0 0 0 1px var\(--color-border-subtle\)/g // a 1 px ring in the hairline colour
    expect(css.match(hairline)).toHaveLength(2) // the Dark pick and the System-dark block
  })

  it('animates the tabs\' flex-grow and flex-basis with the toggle duration and easing', () => {
    // catches: a width change that snaps, or one with a literal duration
    const rule = inside('.pill-tab')
    expect(rule).toMatch(/transition:[^;]*flex-grow var\(--duration-toggle\) var\(--ease-in-out-soft\)/)
    expect(rule).toMatch(/transition:[^;]*flex-basis var\(--duration-toggle\) var\(--ease-in-out-soft\)/)
  })

  it('switches the width transition off under Reduce Motion and fades the content faster instead', () => {
    // catches: a width animation for people who asked for none
    const reduced = inside('@media (prefers-reduced-motion: reduce)')
    expect(reduced).toMatch(/\.pill-tab\s*\{[^}]*transition:\s*none/)
    expect(reduced).toMatch(/\.pill-content\s*\{[^}]*animation-duration:\s*var\(--duration-fast\)/)
    const base = css.slice(0, css.indexOf('@media (prefers-reduced-motion'))
    expect(base).toMatch(/\.pill-tab\s*\{[^}]*transition:/) // the transition itself sits outside the reduced block
  })
})

describe('scroll padding under the floating pill', () => {
  it('keeps a focused field clear of the dock, and clear of the taller failure note', () => {
    // catches: Tab landing on the captcha or a field behind the fixed pill, which scrolls only to the viewport's edge
    const rem = (selector: string) => Number(new RegExp(`${selector}\\s*\\{[^}]*scroll-padding-bottom:\\s*([\\d.]+)rem`).exec(css)?.[1] ?? 0) // the padding in rem, 0 when missing
    expect(rem('html')).toBeGreaterThanOrEqual(9) // the strip, the pill and the gap: 144 px
    expect(rem('html:has\\(\\[data-failure-note\\]\\)')).toBeGreaterThanOrEqual(16) // the note adds about 100 px
  })
})
