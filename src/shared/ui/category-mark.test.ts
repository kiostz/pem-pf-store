// Tests for categoryMark: the patch colour, icon colour and icon each category shows when it has no picture.

import { describe, expect, it } from 'vitest' // test API
import { categoryMark } from './category-mark.ts' // code under test

const known = {
  ADRA: ['#483977', '#ffffff'],
  'Arts and Crafts': ['#4f8db1', '#ffffff'],
  'Health and Science': ['#533868', '#ffffff'],
  'Household Arts': ['#f6a949', '#171717'],
  Nature: ['#f0f2ed', '#171717'],
  'Outdoor Industries': ['#4b3211', '#ffffff'],
  Outreach: ['#2a3578', '#ffffff'],
  Recreation: ['#117155', '#ffffff'],
  Vocational: ['#d0272a', '#ffffff'],
  Shirt: ['#c3b091', '#171717'],
  Accessories: ['#2f4858', '#ffffff'],
} // measured patch backgrounds and the icon colour on each

/**
 * WCAG relative luminance of a hex colour.
 * @param hex colour as #rrggbb
 * @return luminance from 0 to 1
 */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255 // one channel
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 // linearise
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b // weighted sum
}

/**
 * WCAG contrast ratio of two hex colours.
 * @param a first colour
 * @param b second colour
 * @return ratio from 1 to 21
 */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) // lighter first
  return (hi + 0.05) / (lo + 0.05) // the WCAG formula
}

describe('categoryMark', () => {
  it('gives each known category its measured colours', () => {
    for (const [name, [background, foreground]] of Object.entries(known)) {
      const mark = categoryMark(name)
      expect([mark.background, mark.foreground]).toEqual([
        background,
        foreground,
      ]) // catches a typo in a hex or a wrong icon colour
    }
  })

  it('gives the eleven categories eleven different icons and backgrounds', () => {
    const marks = Object.keys(known).map(categoryMark)
    expect(new Set(marks.map((m) => m.icon)).size).toBe(11) // catches two categories sharing an icon
    expect(new Set(marks.map((m) => m.background)).size).toBe(11) // catches two categories sharing a colour
  })

  it('gives Shirt the Tabler shirt and Accessories the neckerchief', () => {
    expect(categoryMark('Shirt').icon).toBe('shirt') // catches Shirt falling back to the grey award mark
    expect(categoryMark('Accessories').icon).toBe('neckerchief') // catches Accessories falling back to the grey award mark
  })

  it.each(['Pioneering', '', 'constructor'])(
    'gives the default mark for "%s"',
    (name) => {
      expect(categoryMark(name)).toEqual({
        icon: 'award',
        background: '#525252',
        foreground: '#ffffff',
      }) // catches a crash or undefined colours for a club-added category
    },
  )

  it('keeps every icon at 3:1 or more against its square', () => {
    for (const name of [...Object.keys(known), 'Pioneering']) {
      const { background, foreground } = categoryMark(name)
      expect(contrast(background, foreground)).toBeGreaterThanOrEqual(3) // catches an unreadable icon
    }
  })
})
