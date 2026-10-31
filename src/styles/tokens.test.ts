// Tests for the colour tokens: every text pair and every icon or ring pair keeps its contrast in light and dark, and the two dark blocks never drift apart.

import { readFileSync } from 'node:fs' // reads index.css
import { resolve } from 'node:path' // the path to index.css
import { describe, expect, it } from 'vitest' // test API

const css = readFileSync(
  resolve(process.cwd(), 'src/styles/index.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '') // the stylesheet without comments; vitest runs from the project root

/**
 * Reads the colour declarations of the block that follows a header, to the block's own closing brace.
 * @param header the exact text before the block's opening brace
 * @return token name (without the leading dashes) to its hex value
 */
function colours(header: string): Record<string, string> {
  const start = css.indexOf(`${header} {`) // the block's start
  if (start < 0) throw new Error(`index.css has no block "${header}"`) // the test's own precondition
  let depth = 0 // open braces so far
  let end = start // where the block closes
  for (let at = css.indexOf('{', start); at < css.length; at += 1) {
    if (css[at] === '{') depth += 1 // a block opens, nested ones included
    if (css[at] === '}') depth -= 1 // a block closes
    if (depth === 0) {
      end = at // the block's own brace
      break // done
    }
  }
  const found: Record<string, string> = {} // result
  for (const match of css
    .slice(start, end)
    .matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi))
    found[match[1]] = match[2].toLowerCase() // hex colours only
  return found
}

/**
 * Relative luminance of a hex colour (WCAG 2).
 * @param hex a #rrggbb colour
 * @return luminance from 0 to 1
 */
function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255 // 0 to 1
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4 // linearised
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue // the weights
}

/**
 * Contrast ratio of two colours (WCAG 2).
 * @param first a #rrggbb colour
 * @param second a #rrggbb colour
 * @return the ratio, 1 to 21
 */
function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  ) // lighter first
  return (lighter + 0.05) / (darker + 0.05) // the formula
}

const light = colours('@theme') // light values
const darkPick = colours(":root[data-theme='dark']") // dark values picked by the theme control
const darkSystem = colours(":root:not([data-theme='light'])") // dark values while the pick is System
const print = { ...light, ...colours('@media print') } // paper: the light values with the print block's own
const TEXT_PAIRS: [string, string][] = [
  ['text-default', 'bg-app'], // ink on the page
  ['text-default', 'bg-surface'], // ink on a card
  ['text-muted', 'bg-app'], // grey text on the page
  ['text-muted', 'bg-surface'], // grey text on a card
  ['text-muted', 'bg-soft'], // grey text on the soft fill
  ['on-accent', 'accent'], // button lettering
  ['on-accent', 'accent-hover'], // button lettering under a pointer
  ['on-header', 'header'], // header text
  ['on-tag-warning', 'tag-warning'], // the Unavailable tag
  ['on-inverse', 'bg-inverse'], // the Removed note
  ['danger', 'bg-app'], // error text on the page
  ['danger', 'bg-surface'], // error text on a card
  ['accent', 'bg-app'], // links on the page
  ['accent', 'bg-surface'], // links on a card
  ['accent', 'bg-soft'], // stepper symbols
] // text on its fill: 4.5:1
const ICON_PAIRS: [string, string][] = [
  ['trash', 'bg-soft'], // the trash on the stepper pill
  ['trash', 'bg-surface'], // the trash on a card
  ['trash', 'bg-inverse'], // the trash beside "removed" on the Removed note (catches: S9, a note fill that leaves the red icon under 3:1)
  ['focus-ring', 'bg-app'], // the ring on the page
  ['focus-ring', 'bg-surface'], // the ring on a card
  ['focus-ring', 'header'], // the ring on the band
  ['focus-ring-soft', 'bg-soft'], // the cart stepper's ring, whose sides run on the soft fill
  ['focus-ring-soft', 'bg-surface'], // the cart stepper's ring, whose top and bottom run on the card
] // icons and rings on their ground: 3:1

describe.each([
  ['light', light],
  ['dark', darkPick],
  ['print', print],
])('%s colour tokens', (_name, theme) => {
  it.each(TEXT_PAIRS)(
    'keeps %s on %s at 4.5:1 or more',
    (foreground, background) => {
      // catches: a palette swap that leaves a text pair unreadable
      expect(
        contrast(theme[foreground], theme[background]),
      ).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each(ICON_PAIRS)(
    'keeps %s on %s at 3:1 or more',
    (foreground, background) => {
      // catches: a trash icon or focus ring that disappears on its ground
      expect(
        contrast(theme[foreground], theme[background]),
      ).toBeGreaterThanOrEqual(3)
    },
  )
})

describe('Note colours', () => {
  it.each([
    ['light', light],
    ['dark', darkPick],
  ])('keeps the white x readable on the red close circle in %s', (_name, theme) => {
    // catches: a close mark that fades into its circle
    const merged = { ...light, ...theme } // note-close is written once, in @theme
    expect(contrast(merged['on-note-close'], merged['note-close'])).toBeGreaterThanOrEqual(4.5)
  })
})

describe('Home band colours', () => {
  it.each([
    ['light', light],
    ['dark', darkPick],
  ])('keeps Browse the shop readable on its pill and the pill visible on the band in %s', (_name, theme) => {
    // catches: a rose pill that fails text contrast, or one that melts into the band
    const merged = { ...light, ...theme } // band-action is written once, in @theme
    expect(contrast(merged['on-band-action'], merged['band-action'])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(merged['band-action'], merged.header)).toBeGreaterThanOrEqual(3)
  })

  it('keeps the trace rose and the stone band text distinct from the band in both themes', () => {
    // catches: the drawing token vanishing on the band
    for (const theme of [light, darkPick]) {
      const merged = { ...light, ...theme }
      expect(contrast(merged.trace, merged.header)).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('trace spark colours', () => {
  it('has the white-hot core token, plain white', () => {
    // catches: the spark core missing from the tokens, or drifting to a tint that reads as pink
    expect(light['trace-core']).toBe('#ffffff')
  })
})

describe.each([
  ['light', light],
  ['dark', darkPick],
])('tab pill colours in %s', (_name, theme) => {
  it.each([
    ['text-muted', 'bg-surface', 4.5], // an idle tab's icon and label on the pill
    ['accent', 'bg-soft', 4.5], // the current tab on its capsule
    ['on-accent', 'accent', 4.5], // the count and total on the grown Cart tab
    ['accent', 'bg-surface', 3], // the grown Cart tab's fill against the pill, so its edge shows
    ['focus-ring', 'bg-surface', 3], // the ring round a tab, drawn on the pill
  ])('keeps %s on %s at %s:1 or more', (foreground, background, ratio) => {
    // catches: a palette edit that leaves a pill tab unreadable, its Cart fill invisible or its ring lost
    expect(contrast(theme[foreground], theme[background])).toBeGreaterThanOrEqual(ratio)
  })

  it('keeps the current tab\'s capsule different from the pill by more than a rounding error', () => {
    // catches: a capsule that melts into the pill, leaving only bold type to mark the current tab
    expect(contrast(theme['bg-soft'], theme['bg-surface'])).toBeGreaterThan(1.05)
  })
})

describe('palette', () => {
  it('uses oxblood and stone in light', () => {
    // catches: the old navy and gold values surviving the swap
    expect(light).toMatchObject({
      accent: '#4a1520',
      header: '#4a1520',
      'accent-hover': '#33101a',
      'on-accent': '#f3f0ec',
      'on-header': '#f3f0ec',
      'bg-app': '#f3f0ec',
      'bg-surface': '#ffffff',
      'bg-soft': '#ece6e1',
      'text-muted': '#55555a',
    })
  })

  it('uses rose buttons with oxblood text and a darker oxblood header in dark', () => {
    // catches: gold left in dark mode
    expect(darkPick).toMatchObject({
      accent: '#e8b4bc',
      'on-accent': '#4a1520',
      header: '#2a0c12',
      'on-header': '#f3f0ec',
    })
  })

  it('holds the same dark values in the picked block and the System block', () => {
    // catches: one dark block edited and the other forgotten
    expect(darkSystem).toEqual(darkPick)
  })
})
