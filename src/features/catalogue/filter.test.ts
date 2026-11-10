// Tests for the catalogue's search, category filter and category list over plain item arrays.

import { describe, expect, it } from 'vitest' // test API
import type { Item } from '@/shared/data/types.ts' // the item shape
import { item as makeItem } from '@/test/shop-fetch.ts' // the item builder
import { categoryLabel, categoryNames, filterItems, shopOrder, subcategoryNames } from './filter.ts' // code under test

/**
 * Builds an item with defaults.
 * @param name display name
 * @param category category name
 * @return a complete item
 */
function item(name: string, category = 'Nature'): Item { // builds an item with defaults
  return makeItem(name.toLowerCase().replace(/\W+/g, '-'), name, { category }) // id from the name, fixed values for the rest
}

const all = { query: '', category: null, subcategory: null } // no search, All categories, All subcategories

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
      filterItems(list, { ...all, category: 'Outreach' }).map( // the filter applied to the items
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
      filterItems(list, { ...all, query: 'knot', category: 'Outreach' }).map( // the filter applied to the items
        (listed) => listed.name, // the name of each listed item
      ),
    ).toEqual(['Knot B']) // catches OR instead of AND
  })

  it('returns nothing for a category without a match', () => {
    expect(
      filterItems([item('Knot', 'Nature')], { // one test item the shop lists
        ...all, // no subcategory
        query: 'knot',
        category: 'Outreach',
      }),
    ).toEqual([]) // catches a query that ignores the category
  })
})

/**
 * Builds an item with a category and a subcategory.
 * @param name display name
 * @param category category name
 * @param subcategory subcategory name, or null
 * @return a complete item
 */
function sub(name: string, category: string, subcategory: string | null): Item { // builds an item with a subcategory
  return { ...item(name, category), subcategory } // the defaults plus the subcategory
}

describe('filterItems with a subcategory', () => { // the Subcategory filter's narrowing
  it('keeps only that subcategory, inside the category, with the search words', () => { // all three together
    // catches: a subcategory that ignores the category or the search, or matches on the name alone
    const list = [ // four items
      sub('Knot Tying', 'Honors', 'Nature'), // matches all three
      sub('Knot Art', 'Honors', 'Recreation'), // other subcategory
      sub('Ants', 'Honors', 'Nature'), // search misses
      sub('Knot Scarf', 'Accessories', 'Nature'), // other category
    ]
    expect( // the filter applied
      filterItems(list, { query: 'knot', category: 'Honors', subcategory: 'Nature' }).map((listed) => listed.name), // the filter applied
    ).toEqual(['Knot Tying']) // only the one that matches all
  })

  it('drops an item of the category that has no subcategory once a subcategory is picked', () => { // a null subcategory is not a match
    // catches: an honor with no subcategory showing under a chip because null is treated as a wildcard
    const list = [sub('Tied', 'Honors', 'Nature'), sub('Loose', 'Honors', null)] // one with, one without
    expect(filterItems(list, { ...all, category: 'Honors', subcategory: 'Nature' }).map((listed) => listed.name)).toEqual(['Tied']) // only the Nature one
  })

  it('keeps every subcategory, and items with none, when the subcategory is null', () => { // All chip
    // catches: a null subcategory hiding items that have none
    const list = [sub('A', 'Honors', 'Nature'), sub('B', 'Honors', null)] // one each
    expect(filterItems(list, { ...all, category: 'Honors' })).toHaveLength(2) // both stay
  })
})

describe('subcategoryNames', () => { // the chip names
  it('is distinct and A to Z, skips null, and holds only the given category', () => { // the rules in one list
    // catches: duplicates, file order, a null chip, or another category's names
    const list = [ // five items
      sub('A', 'Honors', 'Recreation'), // one
      sub('B', 'Honors', 'Nature'), // two
      sub('C', 'Honors', 'Nature'), // duplicate
      sub('D', 'Honors', null), // no subcategory
      sub('E', 'Shirts', 'Kids'), // other category
    ]
    expect(subcategoryNames(list, 'Honors')).toEqual(['Nature', 'Recreation']) // A to Z, once each
  })

  it('gives [] for a category with none', () => { // Accessories today
    // catches: a chip row for a category with no subcategories
    expect(subcategoryNames([sub('A', 'Accessories', null)], 'Accessories')).toEqual([]) // nothing
    expect(subcategoryNames([], 'Honors')).toEqual([]) // nothing loaded
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

/**
 * Builds an item with a stock level.
 * @param name display name
 * @param stock how many are left
 * @return a complete item
 */
function stocked(name: string, stock: number): Item { // builds an item with a stock level
  return { ...item(name), stock } // the defaults plus the stock
}

/**
 * Lists item names for comparison.
 * @param items the items to name
 * @return the names in order
 */
const names = (items: Item[]): string[] => items.map((listed) => listed.name) // names only

describe('shopOrder', () => { // the Shop's order: stock first, then A to Z
  it('puts in-stock items before Sold out ones, whatever the input order', () => { // stock first
    // catches: Sold out items mixed in among the stocked ones
    const list = [stocked('Ants', 0), stocked('Zebra', 3), stocked('Birds', 0), stocked('Knot', 5)] // a mix in input order
    expect(names(shopOrder(list))).toEqual(['Knot', 'Zebra', 'Ants', 'Birds']) // stock group, then Sold out group
  })

  it('sorts each group A to Z, ignoring case', () => { // each group A to Z
    // catches: a plain code-point sort that puts Zebra before knot
    const list = [stocked('Zebra', 1), stocked('knot', 1), stocked('Birds', 1), stocked('zed', 0), stocked('Ants', 0)] // unsorted
    expect(names(shopOrder(list))).toEqual(['Birds', 'knot', 'Zebra', 'Ants', 'zed']) // both groups sorted
  })

  it('counts stock 1 as in stock and only 0 as Sold out', () => { // the stock boundary
    // catches: an off-by-one at the boundary
    expect(names(shopOrder([stocked('Ants', 0), stocked('Zebra', 1)]))).toEqual(['Zebra', 'Ants']) // 1 first
  })

  it('leaves the input array as it was', () => { // no mutation
    // catches: an in-place sort that reorders the caller's list
    const list = [stocked('Zebra', 0), stocked('Ants', 2)] // input order
    shopOrder(list) // the result is not needed
    expect(names(list)).toEqual(['Zebra', 'Ants']) // unchanged
  })

  it('gives an empty list for an empty list', () => { // the empty edge
    // catches: a crash on no items
    expect(shopOrder([])).toEqual([]) // nothing in, nothing out
  })

  it('keeps the input order for two items with the same name', () => { // stable sort
    // catches: an unstable sort that swaps same-name items the API ordered by id
    const first = { ...stocked('Ants', 1), id: 'a-1' } // first in the input
    const second = { ...stocked('Ants', 1), id: 'a-2' } // second in the input
    expect(shopOrder([first, second]).map((listed) => listed.id)).toEqual(['a-1', 'a-2']) // same order out
  })
})

describe('categoryLabel', () => { // the text on a card's Category label
  it('joins the category and the subcategory with a middle dot', () => { // category and subcategory
    // catches: the subcategory missing from the label
    expect(categoryLabel({ category: 'Honors', subcategory: 'Nature' })).toBe('Honors · Nature') // category then subcategory
  })

  it('gives the category alone when there is no subcategory', () => { // null subcategory
    // catches: a dangling separator or the word null
    expect(categoryLabel({ category: 'Shirts', subcategory: null })).toBe('Shirts') // the category only
  })

  it('separates with exactly U+00B7 and a space either side', () => { // the exact separator
    // catches: a hyphen, a bullet or missing spaces
    expect(categoryLabel({ category: 'A', subcategory: 'B' })).toBe('A \u00B7 B') // a plain space each side of U+00B7
  })
})
