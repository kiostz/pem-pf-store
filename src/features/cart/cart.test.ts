// Tests for the cart maths: quantity rules, A to Z lines, exact money in cents and the item count.

import { describe, expect, it } from 'vitest' // test API
import { honor as makeHonor } from '@/test/shop-fetch.ts' // the honor builder
import {
  cartCount,
  clampQuantity,
  estimatedTotalCents,
  lineTotalCents,
  resolveCart,
  setQuantity,
} from './cart.ts' // code under test

/**
 * Builds one honor for the tests.
 * @param id honor id
 * @param name display name
 * @param price price in the currency's main unit
 * @return an honor as the shop lists it
 */
const honor = (id: string, name: string, price = 4) => makeHonor(id, name, { price }) // only the price varies here

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
  it('sorts lines A to Z by name and skips ids with no honor', () => {
    // catches: lines in insertion order, or a crash on an id the data does not know
    const honors = [
      honor('leaves', 'Leaves'),
      honor('ants', 'Ants'),
      honor('knot-tying', 'Knot Tying'),
    ]
    const { lines } = resolveCart(
      { leaves: 1, 'no-such-honor': 5, ants: 2 },
      honors,
    )
    expect(lines.map((line) => [line.honor.name, line.quantity])).toEqual([
      ['Ants', 2],
      ['Leaves', 1],
    ])
  })
})

describe('money and count', () => {
  it('adds 3 lines of RM 1.15 x 3 to exactly 345 each and 1035 in all', () => {
    // catches: floating-point drift such as 3.4499999999999997 in a shown total
    const lines = ['a', 'b', 'c'].map((id) => ({
      honor: honor(id, id, 1.15),
      quantity: 3,
    }))
    expect(lines.map(lineTotalCents)).toEqual([345, 345, 345])
    expect(estimatedTotalCents(lines)).toBe(1035)
  })

  it('counts the sum of all quantities', () => {
    // catches: counting order lines instead of the quantities
    const lines = [
      { honor: honor('a', 'A'), quantity: 2 },
      { honor: honor('b', 'B'), quantity: 3 },
    ]
    expect(cartCount(lines)).toBe(5)
    expect(cartCount([])).toBe(0)
  })
})

describe('resolveCart unavailable honors', () => {
  it('reports an id the shop no longer lists out of lines, count and total', () => {
    // catches: a missing id (a Hidden honor, which /shop never lists) still priced into the total or dropped without a trace
    const { lines, unavailable } = resolveCart(
      { ants: 2, 'africa-lore': 1 },
      [honor('ants', 'Ants')],
    )
    expect(lines.map((line) => line.honor.name)).toEqual(['Ants'])
    expect(unavailable).toEqual([{ honorId: 'africa-lore' }])
    expect(cartCount(lines)).toBe(2)
    expect(estimatedTotalCents(lines)).toBe(800)
  })

  it('prices a repriced honor at the new price', () => {
    // catches: a stored price surviving a price change
    const { lines } = resolveCart({ ants: 2 }, [honor('ants', 'Ants', 5)])
    expect(estimatedTotalCents(lines)).toBe(1000)
  })
})
