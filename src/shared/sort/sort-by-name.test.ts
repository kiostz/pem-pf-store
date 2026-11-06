// Tests for the shared A to Z name sort that both the catalogue and the cart use.

import { describe, expect, it } from 'vitest' // test API
import type { Item } from '@/shared/data/types.ts' // the item shape
import { byText, sortByName } from './sort-by-name.ts' // code under test

/**
 * Builds an item with defaults.
 * @param name display name
 * @param category category name
 * @return a complete item
 */
function item(name: string, category = 'Nature'): Item { // builds an item with defaults
  return {
    id: name.toLowerCase().replace(/\W+/g, '-'),
    name,
    category,
    stock: 10,
    price: 4,
    image: null,
  } // fixed values for the fields the sort ignores
}

describe('sortByName', () => {
  it('puts unsorted items from several categories A to Z by name', () => {
    const list = [
      item('Leaves', 'Nature'), // an item in Nature
      item('Ants', 'Nature'), // an item in Nature
      item('Knot Tying', 'Recreation'), // an item in Recreation
      item('Braiding - Advanced', 'Arts and Crafts'), // an item in Arts and Crafts
    ] // four items out of order
    expect(sortByName(list).map((h) => h.name)).toEqual([
      'Ants',
      'Braiding - Advanced',
      'Knot Tying',
      'Leaves',
    ]) // catches file-order output or a sort by category first
  })

  it('puts a short name before the longer name that starts with it', () => {
    const list = [item('Braiding - Advanced'), item('Braiding')] // longer first
    expect(sortByName(list).map((h) => h.name)).toEqual([
      'Braiding',
      'Braiding - Advanced',
    ]) // catches a sort that puts the longer name first
  })

  it('leaves the input array as it was', () => {
    const list = [item('B'), item('A')] // out of order
    sortByName(list) // the result is not used
    expect(list.map((h) => h.name)).toEqual(['B', 'A']) // catches an in-place sort that reorders the caller's array
  })

  it('returns an empty list for no items', () => {
    expect(sortByName([])).toEqual([]) // catches a crash on an empty list
  })
})

describe('byText', () => {
  it('orders plain strings A to Z for sort()', () => {
    expect(['b', 'a', 'C'].sort(byText)).toEqual(['a', 'b', 'C']) // catches a case-sensitive compare that puts C first
  })
})
