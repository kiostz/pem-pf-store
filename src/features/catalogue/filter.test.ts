// Tests for the catalogue's search, category filter and category list over plain item arrays.

import { describe, expect, it } from 'vitest' // test API
import type { Item } from '@/shared/data/types.ts' // the item shape
import { item as makeItem } from '@/test/shop-fetch.ts' // the item builder
import { categoryNames, filterItems } from './filter.ts' // code under test

/**
 * Builds an item with defaults.
 * @param name display name
 * @param category category name
 * @return a complete item
 */
function item(name: string, category = 'Nature'): Item { // builds an item with defaults
  return makeItem(name.toLowerCase().replace(/\W+/g, '-'), name, { category }) // id from the name, fixed values for the rest
}

const all = { query: '', category: null } // no search, All categories

describe('filterItems', () => { // the filter tests, by item
  it('lists every loaded item, whatever its stock', () => { // every loaded item is listed, stock 0 included
    const list = [item('Knot Tying'), { ...item('Ants'), stock: 0 }] // two test items the shop lists
    expect(filterItems(list, all).map((listed) => listed.name)).toEqual(['Knot Tying', 'Ants']) // catches a leftover filter hiding a loaded item
  })

  it('matches case-insensitively', () => {
    expect(
      filterItems([item('Knot Tying')], { ...all, query: 'KNOT' }), // one test item the shop lists
    ).toHaveLength(1) // catches a case-sensitive search
  })

  it('matches every word in any order', () => {
    const list = [item('Braiding - Advanced'), item('Braiding')] // two test items the shop lists
    expect(
      filterItems(list, { ...all, query: 'advanced braiding' }).map( // the filter applied to the items
        (listed) => listed.name, // the name of each listed item
      ),
    ).toEqual(['Braiding - Advanced']) // catches whole-phrase matching
  })

  it('treats blank input as no search', () => {
    const list = [item('A'), item('B')] // two test items the shop lists
    expect(filterItems(list, { ...all, query: '  ' })).toHaveLength(2) // catches whitespace matching nothing
    expect(filterItems(list, all)).toHaveLength(2) // catches an empty query matching nothing
  })

  it('matches punctuation literally', () => {
    const list = [
      item('Christian Citizenship (Antigua & Barbuda)'), // one test item the shop lists
      item('Knot Tying'), // one test item the shop lists
    ]
    expect(filterItems(list, { ...all, query: '&' })).toHaveLength(1) // catches a regex build that chokes on symbols
  })

  it('returns nothing when no name matches', () => {
    expect(
      filterItems([item('Knot Tying')], { ...all, query: 'zzz' }), // one test item the shop lists
    ).toEqual([]) // catches a loose match
  })

  it('filters by category alone', () => {
    const list = [item('A', 'Nature'), item('B', 'Outreach')] // two test items the shop lists
    expect(
      filterItems(list, { query: '', category: 'Outreach' }).map( // the filter applied to the items
        (listed) => listed.name, // the name of each listed item
      ),
    ).toEqual(['B']) // catches an ignored category
  })

  it('combines category and query', () => {
    const list = [
      item('Knot A', 'Nature'), // one test item the shop lists
      item('Knot B', 'Outreach'), // one test item the shop lists
      item('Other', 'Outreach'), // one test item the shop lists
    ]
    expect(
      filterItems(list, { query: 'knot', category: 'Outreach' }).map( // the filter applied to the items
        (listed) => listed.name, // the name of each listed item
      ),
    ).toEqual(['Knot B']) // catches OR instead of AND
  })

  it('returns nothing for a category without a match', () => {
    expect(
      filterItems([item('Knot', 'Nature')], { // one test item the shop lists
        query: 'knot',
        category: 'Outreach',
      }),
    ).toEqual([]) // catches a query that ignores the category
  })
})

describe('categoryNames', () => {
  it('lists each category of a loaded item once, A to Z', () => { // categories come out once each and sorted
    const list = [
      item('A', 'Recreation'), // one test item the shop lists
      item('B', 'Nature'), // one test item the shop lists
      item('C', 'Nature'), // one test item the shop lists
    ]
    expect(categoryNames(list)).toEqual(['Nature', 'Recreation']) // catches duplicates or file order
  })

  it('lists the category of a stock 0 item', () => { // a stock 0 item still adds its category
    const list = [{ ...item('A', 'Nature'), stock: 0 }] // one test item the shop lists
    expect(categoryNames(list)).toEqual(['Nature']) // catches a Sold out item's category vanishing from the filter
  })
})
