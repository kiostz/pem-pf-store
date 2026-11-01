// Tests parseHonorChanges: what a save may contain, and that anything else is refused whole.

import { describe, expect, it } from 'vitest'
import { parseHonorChanges } from '../src/validate-changes'

// One valid change to build variants from.
const good = { id: 'knot-tying', stock: { from: 3, to: 4 } }

/**
 * Parses a body holding the given changes.
 * @param changes The `changes` array.
 * @return The parsed changes, or null.
 */
const parse = (changes: unknown) => parseHonorChanges({ changes })

describe('parseHonorChanges', () => {
  it('accepts a status change, a stock change and both together', () => {
    // Catches a parser that rejects the valid shapes the page sends.
    const both = { id: 'a-1', status: { from: 'active', to: 'hidden' }, stock: { from: 0, to: 9999 } }
    expect(parse([good, both])).toEqual([good, both])
  })

  it('refuses ids with padding, tabs, newlines, capitals, odd characters or over 100 characters', () => {
    // Catches S4: a trailing newline slipping through a `$` regex or a trim-only check.
    for (const id of [' knot', 'knot ', 'knot\t', 'knot\n', 'Knot', 'knot_tying', '-knot', 'knot-', 'a--b', '', 'a'.repeat(101)]) {
      expect(parse([{ ...good, id }]), JSON.stringify(id)).toBeNull()
    }
    expect(parse([{ ...good, id: 'a'.repeat(100) }])).not.toBeNull() // The limit itself passes.
  })

  it('refuses a stock that is text, fractional, negative or above 9,999, and accepts 9,999', () => {
    // Catches "3" coerced to 3, 1.5 reaching a STRICT integer column, and an unbounded stock.
    for (const to of ['3', 1.5, -1, 10000, null, NaN]) {
      expect(parse([{ id: 'a', stock: { from: 0, to } }]), String(to)).toBeNull()
    }
    expect(parse([{ id: 'a', stock: { from: '0', to: 1 } }])).toBeNull() // Text `from`.
    expect(parse([{ id: 'a', stock: { from: 0, to: 9999 } }])).not.toBeNull()
  })

  it('caps only the new stock: a stored 10,000 can go to 9,999, but not stay or rise', () => {
    // Catches a cap on the seen value (locking out a big stored stock) or a missing cap on the new one.
    expect(parse([{ id: 'a', stock: { from: 10000, to: 9999 } }])).not.toBeNull()
    expect(parse([{ id: 'a', stock: { from: 10000, to: 10000 } }])).toBeNull() // A no-op.
    expect(parse([{ id: 'a', stock: { from: 9999, to: 10000 } }])).toBeNull()
  })

  it('refuses a status outside active and hidden', () => {
    // Catches a status the CHECK would reject surfacing as a 500.
    expect(parse([{ id: 'a', status: { from: 'active', to: 'gone' } }])).toBeNull()
    expect(parse([{ id: 'a', status: { from: 'Active', to: 'hidden' } }])).toBeNull()
  })

  it('accepts 500 honors and refuses 501', () => {
    // Catches a missing or off-by-one cap on one save.
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `h-${i}`, stock: { from: 0, to: 1 } }))
    expect(parse(many(500))).toHaveLength(500)
    expect(parse(many(501))).toBeNull()
  })

  it('refuses repeated ids, from equal to to, extra keys and empty changes', () => {
    // Catches two changes on one row, no-op saves, smuggled fields (price) and empty saves.
    expect(parse([good, good])).toBeNull() // Repeated id.
    expect(parse([{ id: 'a', stock: { from: 5, to: 5 } }])).toBeNull() // No change.
    expect(parse([{ id: 'a', status: { from: 'active', to: 'active' } }])).toBeNull() // No change.
    expect(parse([{ ...good, price: 1 }])).toBeNull() // Extra key on the change.
    expect(parse([{ id: 'a', stock: { from: 1, to: 2, extra: 1 } }])).toBeNull() // Extra key on the field.
    expect(parseHonorChanges({ changes: [good], extra: 1 })).toBeNull() // Extra key on the body.
    expect(parse([])).toBeNull() // Empty.
    expect(parse([{ id: 'a' }])).toBeNull() // Neither status nor stock.
    expect(parseHonorChanges(null)).toBeNull() // Not an object.
    expect(parseHonorChanges({})).toBeNull() // No changes key.
    expect(parseHonorChanges({ changes: 'x' })).toBeNull() // Not an array.
    expect(parseHonorChanges([good])).toBeNull() // An array, not an object.
  })
})
