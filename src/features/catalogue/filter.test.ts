// Tests for the catalogue's search, category filter and category list over plain honor arrays.

import { describe, expect, it } from 'vitest' // test API
import type { Item } from '@/shared/data/types.ts' // the item shape
import { honor as makeHonor } from '@/test/shop-fetch.ts' // the honor builder
import { categoryNames, filterHonors } from './filter.ts' // code under test

/**
 * Builds an honor with defaults.
 * @param name display name
 * @param category category name
 * @return a complete honor
 */
function honor(name: string, category = 'Nature'): Item { // builds an item with defaults
  return makeHonor(name.toLowerCase().replace(/\W+/g, '-'), name, { category }) // id from the name, fixed values for the rest
}

const all = { query: '', category: null } // no search, All categories

describe('filterHonors', () => {
  it('lists every loaded honor, whatever its stock', () => {
    const list = [honor('Knot Tying'), { ...honor('Ants'), stock: 0 }]
    expect(filterHonors(list, all).map((h) => h.name)).toEqual(['Knot Tying', 'Ants']) // catches a leftover filter hiding a loaded honor
  })

  it('matches case-insensitively', () => {
    expect(
      filterHonors([honor('Knot Tying')], { ...all, query: 'KNOT' }),
    ).toHaveLength(1) // catches a case-sensitive search
  })

  it('matches every word in any order', () => {
    const list = [honor('Braiding - Advanced'), honor('Braiding')]
    expect(
      filterHonors(list, { ...all, query: 'advanced braiding' }).map(
        (h) => h.name,
      ),
    ).toEqual(['Braiding - Advanced']) // catches whole-phrase matching
  })

  it('treats blank input as no search', () => {
    const list = [honor('A'), honor('B')]
    expect(filterHonors(list, { ...all, query: '  ' })).toHaveLength(2) // catches whitespace matching nothing
    expect(filterHonors(list, all)).toHaveLength(2) // catches an empty query matching nothing
  })

  it('matches punctuation literally', () => {
    const list = [
      honor('Christian Citizenship (Antigua & Barbuda)'),
      honor('Knot Tying'),
    ]
    expect(filterHonors(list, { ...all, query: '&' })).toHaveLength(1) // catches a regex build that chokes on symbols
  })

  it('returns nothing when no name matches', () => {
    expect(
      filterHonors([honor('Knot Tying')], { ...all, query: 'zzz' }),
    ).toEqual([]) // catches a loose match
  })

  it('filters by category alone', () => {
    const list = [honor('A', 'Nature'), honor('B', 'Outreach')]
    expect(
      filterHonors(list, { query: '', category: 'Outreach' }).map(
        (h) => h.name,
      ),
    ).toEqual(['B']) // catches an ignored category
  })

  it('combines category and query', () => {
    const list = [
      honor('Knot A', 'Nature'),
      honor('Knot B', 'Outreach'),
      honor('Other', 'Outreach'),
    ]
    expect(
      filterHonors(list, { query: 'knot', category: 'Outreach' }).map(
        (h) => h.name,
      ),
    ).toEqual(['Knot B']) // catches OR instead of AND
  })

  it('returns nothing for a category without a match', () => {
    expect(
      filterHonors([honor('Knot', 'Nature')], {
        query: 'knot',
        category: 'Outreach',
      }),
    ).toEqual([]) // catches a query that ignores the category
  })
})

describe('categoryNames', () => {
  it('lists each category of a loaded honor once, A to Z', () => {
    const list = [
      honor('A', 'Recreation'),
      honor('B', 'Nature'),
      honor('C', 'Nature'),
    ]
    expect(categoryNames(list)).toEqual(['Nature', 'Recreation']) // catches duplicates or file order
  })

  it('lists the category of a stock 0 honor', () => {
    const list = [{ ...honor('A', 'Nature'), stock: 0 }]
    expect(categoryNames(list)).toEqual(['Nature']) // catches a Sold out honor's category vanishing from the filter
  })
})
