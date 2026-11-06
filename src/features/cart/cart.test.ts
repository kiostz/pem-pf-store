// Tests for the cart maths: quantity rules, A to Z lines, exact money in cents and the item count.

import { describe, expect, it } from 'vitest' // test API
import { item as makeItem } from '@/test/shop-fetch.ts' // the item builder
import {
  cartCount,
  clampQuantity,
  estimatedTotalCents,
  exceedsStock,
  lineTotalCents,
  quantityCap,
  resolveCart,
  setQuantity,
} from './cart.ts' // code under test

/**
 * Builds one item for the tests.
 * @param id item id
 * @param name display name
 * @param price price in the currency's main unit
 * @return an item as the shop lists it
 */
const item = (id: string, name: string, price = 4) => makeItem(id, name, { price }) // only the price varies here

describe('clampQuantity', () => {
  it.each([
    [-1, 0],
    [0, 0],
    [1.5, 1],
    [99, 99],
    [100, 99],
    [NaN, 0],
  ])('turns %s into %s', (value, expected) => {
    // catches: a negative, fractional, over-99 or NaN quantity reaching the cart
    expect(clampQuantity(value)).toBe(expected)
  })
})

describe('setQuantity', () => {
  it('deletes the key at 0 and leaves the input untouched', () => {
    // catches: zero lines kept in the cart, or the old object mutated so React misses the change
    const before = { 'knot-tying': 2, ants: 1 }
    const after = setQuantity(before, 'ants', 0)
    expect(after).toEqual({ 'knot-tying': 2 })
    expect(before).toEqual({ 'knot-tying': 2, ants: 1 })
  })

  it('sets and clamps a quantity in a new object', () => {
    // catches: 100 or more kept, or the same object returned
    const before = {}
    const after = setQuantity(before, 'ants', 150)
    expect(after).toEqual({ ants: 99 })
    expect(after).not.toBe(before)
  })
})

describe('resolveCart', () => {
  it('sorts lines A to Z by name and skips ids with no item', () => { // sorting and skipping ids with no item
    // catches: lines in insertion order, or a crash on an id the data does not know
    const items = [ // the shop list of test items
      item('leaves', 'Leaves'), // a test item in the shop list
      item('ants', 'Ants'), // a test item in the shop list
      item('knot-tying', 'Knot Tying'), // a test item in the shop list
    ]
    const { lines } = resolveCart(
      { leaves: 1, 'no-such-item': 5, ants: 2 }, // a cart with one gone item id
      items, // the items the shop lists
    )
    expect(lines.map((line) => [line.item.name, line.quantity])).toEqual([ // the item name and quantity of each line
      ['Ants', 2],
      ['Leaves', 1],
    ])
  })
})

describe('money and count', () => {
  it('adds 3 lines of RM 1.15 x 3 to exactly 345 each and 1035 in all', () => {
    // catches: floating-point drift such as 3.4499999999999997 in a shown total
    const lines = ['a', 'b', 'c'].map((id) => ({
      item: item(id, id, 1.15), // the order line's test item
      quantity: 3,
    }))
    expect(lines.map(lineTotalCents)).toEqual([345, 345, 345])
    expect(estimatedTotalCents(lines)).toBe(1035)
  })

  it('counts the sum of all quantities', () => {
    // catches: counting order lines instead of the quantities
    const lines = [
      { item: item('a', 'A'), quantity: 2 }, // the order line's test item
      { item: item('b', 'B'), quantity: 3 }, // the order line's test item
    ]
    expect(cartCount(lines)).toBe(5)
    expect(cartCount([])).toBe(0)
  })
})

describe('resolveCart unavailable items', () => { // the cases where an id is gone from the data
  it('reports an id the shop no longer lists out of lines, count and total', () => { // a gone item leaves lines, count and total
    // catches: a missing id (a Hidden item, which /shop never lists) still priced into the total or dropped without a trace
    const { lines, unavailable } = resolveCart(
      { ants: 2, 'africa-lore': 1 },
      [item('ants', 'Ants')], // a test item in the shop list
    )
    expect(lines.map((line) => line.item.name)).toEqual(['Ants']) // the item name of each line
    expect(unavailable).toEqual([{ itemId: 'africa-lore' }]) // the gone item id comes back as unavailable
    expect(cartCount(lines)).toBe(2)
    expect(estimatedTotalCents(lines)).toBe(800)
  })

  it('prices a repriced item at the new price', () => { // a price change shows in the line
    // catches: a stored price surviving a price change
    const { lines } = resolveCart({ ants: 2 }, [item('ants', 'Ants', 5)]) // resolve one id against one listed item
    expect(estimatedTotalCents(lines)).toBe(1000)
  })
})

describe('quantityCap', () => {
  it.each([
    [3, 3],
    [150, 99],
    [0, 0],
    [99, 99],
  ])('caps stock %s at %s, the lower of 99 and the stock', (stock, expected) => {
    // catches: a stepper that lets a buyer pick more than is left, or more than 99
    expect(quantityCap(makeItem('a', 'A', { stock }))).toBe(expected) // cap of an item with this stock
  })
})

describe('clampQuantity with a max', () => {
  it.each([
    [50, 12, 12],
    [5, 12, 5],
    [5, 0, 0],
  ])('turns %s into %s under a max of %s', (value, max, expected) => {
    // catches: a typed number above the stock being kept
    expect(clampQuantity(value, max)).toBe(expected)
  })
})

describe('exceedsStock', () => {
  it.each([
    [2, 3, false],
    [3, 3, false],
    [4, 3, true],
    [1, 0, true],
  ])('says a line of %s with stock %s is over: %s', (quantity, stock, expected) => {
    // catches: an exact-stock line blocked, or a Sold out line let through
    expect(exceedsStock({ item: makeItem('a', 'A', { stock }), quantity })).toBe(expected) // is the order line over its item's stock
  })
})
