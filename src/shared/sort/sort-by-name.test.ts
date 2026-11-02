// Tests for the shared A to Z name sort that both the catalogue and the cart use.

import { describe, expect, it } from 'vitest' // test API
import type { Honor } from '@/shared/data/types.ts' // the honor shape
import { byText, sortByName } from './sort-by-name.ts' // code under test

/**
 * Builds an honor with defaults.
 * @param name display name
 * @param category category name
 * @return a complete honor
 */
function honor(name: string, category = 'Nature'): Honor {
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
  it('puts unsorted honors from several categories A to Z by name', () => {
    const list = [
      honor('Leaves', 'Nature'),
      honor('Ants', 'Nature'),
      honor('Knot Tying', 'Recreation'),
      honor('Braiding - Advanced', 'Arts and Crafts'),
    ] // four honors out of order
    expect(sortByName(list).map((h) => h.name)).toEqual([
      'Ants',
      'Braiding - Advanced',
      'Knot Tying',
      'Leaves',
    ]) // catches file-order output or a sort by category first
  })

  it('puts a short name before the longer name that starts with it', () => {
    const list = [honor('Braiding - Advanced'), honor('Braiding')] // longer first
    expect(sortByName(list).map((h) => h.name)).toEqual([
      'Braiding',
      'Braiding - Advanced',
    ]) // catches a sort that puts the longer name first
  })

  it('leaves the input array as it was', () => {
    const list = [honor('B'), honor('A')] // out of order
    sortByName(list) // the result is not used
    expect(list.map((h) => h.name)).toEqual(['B', 'A']) // catches an in-place sort that reorders the caller's array
  })

  it('returns an empty list for no honors', () => {
    expect(sortByName([])).toEqual([]) // catches a crash on an empty list
  })
})

describe('byText', () => {
  it('orders plain strings A to Z for sort()', () => {
    expect(['b', 'a', 'C'].sort(byText)).toEqual(['a', 'b', 'C']) // catches a case-sensitive compare that puts C first
  })
})
