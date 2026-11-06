// Tests for categoryMark: the patch colour, icon colour and icon each category shows when it has no picture.

import { describe, expect, it } from 'vitest' // test API
import { categoryMark } from './category-mark.ts' // code under test

const known = {
  Accessories: ['neckerchief', '#2f4858', '#ffffff'], // slate with a white neckerchief
  Honors: ['award', '#1f5f3a', '#ffffff'], // forest green with a white award
  Shirts: ['shirt', '#c3b091', '#171717'], // khaki with a near-black shirt
} // each category's icon, background and icon colour

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
  it('gives each category its icon, colour and icon colour', () => { // exact pairs
    for (const [name, [icon, background, foreground]] of Object.entries(known)) { // each known category
      expect(categoryMark(name)).toEqual({ icon, background, foreground }) // catches a typo in a hex, a wrong icon, or a leftover strongHalo key
    }
  })

  it('gives the three categories three different icons and backgrounds, none the grey default', () => { // distinct marks
    const marks = Object.keys(known).map(categoryMark)
    expect(new Set(marks.map((m) => m.background)).size).toBe(3) // catches two categories sharing a colour
    expect(new Set(marks.map((m) => m.icon)).size).toBe(3) // catches two categories sharing an icon
    expect(marks.map((m) => m.background)).not.toContain('#525252') // catches a category falling back to the grey default
  })

  it.each(['Shirt', 'Nature', '', 'constructor'])( // unknown names
    'gives the grey award for "%s"', // the case title
    (name) => {
      expect(categoryMark(name)).toEqual({
        icon: 'award',
        background: '#525252',
        foreground: '#ffffff',
      }) // catches the old singular Shirt or an area name still matching, or a crash on a prototype key
    },
  )

  it('keeps every icon at 3:1 or more against its square', () => {
    for (const name of [...Object.keys(known), 'Pioneering']) {
      const { background, foreground } = categoryMark(name)
      expect(contrast(background, foreground)).toBeGreaterThanOrEqual(3) // catches an unreadable icon
    }
  })

  it('keeps the white names on Accessories and Honors at 4.5:1', () => { // tile name contrast
    for (const name of ['Accessories', 'Honors']) { // the two dark tiles
      expect(contrast(categoryMark(name).background, '#ffffff')).toBeGreaterThanOrEqual(4.5) // catches a tile name too faint to read
    }
  })
})
