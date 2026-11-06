// Tests parseItemChanges: what a save may contain, and that anything else is refused whole.

import { describe, expect, it } from 'vitest'
import { parseDeleteRequest, parseItemChanges, parseNewItem } from '../src/validate-changes'
import { parseItemName } from '../src/validate-text'

// One valid change to build variants from.
const good = { id: 'knot-tying', stock: { from: 3, to: 4 } }

/**
 * Parses a body holding the given changes.
 * @param changes The `changes` array.
 * @return The parsed changes, or null.
 */
const parse = (changes: unknown) => parseItemChanges({ changes })

describe('parseItemChanges', () => {
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

  it('accepts 500 items and refuses 501', () => {
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
    expect(parseItemChanges({ changes: [good], extra: 1 })).toBeNull() // Extra key on the body.
    expect(parse([])).toBeNull() // Empty.
    expect(parse([{ id: 'a' }])).toBeNull() // Neither status nor stock.
    expect(parseItemChanges(null)).toBeNull() // Not an object.
    expect(parseItemChanges({})).toBeNull() // No changes key.
    expect(parseItemChanges({ changes: 'x' })).toBeNull() // Not an array.
    expect(parseItemChanges([good])).toBeNull() // An array, not an object.
  })
})

describe('parseItemChanges: name, category and price', () => {
  it('accepts each new field alone and all together', () => {
    // Catches a parser that refuses the fields the Edit sheet sends.
    const all = { id: 'a', name: { from: 'Old', to: 'New' }, category: { from: 'Nature', to: 'Shirt' }, priceCents: { from: 400, to: 99999 } }
    expect(parse([all])).toEqual([all])
    expect(parse([{ id: 'a', priceCents: { from: 0, to: 1 } }])).not.toBeNull()
  })

  it('limits a new name to 1-100 characters with no control characters or outer space', () => {
    // Catches S4 for names: a tab, a line separator or padding stored in the catalogue.
    const to = (name: string) => parse([{ id: 'a', name: { from: 'Old', to: name } }])
    expect(to('a'.repeat(100))).not.toBeNull()
    for (const bad of ['', 'a'.repeat(101), ' padded', 'padded ', 'tab\there', 'line\nbreak', 'sep\u2028arator', 'sep\u2029arator', '\u0007bell', '   ']) expect(to(bad), JSON.stringify(bad)).toBeNull()
  })

  it('counts a name in characters, not UTF-16 units', () => {
    // Catches 100 emoji refused as 200 characters.
    expect(parse([{ id: 'a', name: { from: 'Old', to: '\u{1F375}'.repeat(100) } }])).not.toBeNull()
  })

  it('accepts a category only from the fixed list, spelled exactly', () => {
    // Catches free text or a wrong-case category reaching the table, which the shop would show as a grey mark.
    expect(parse([{ id: 'a', category: { from: 'x', to: 'Shirt' } }])).not.toBeNull()
    for (const to of ['shirt', 'Gardening', '', 'Shirt ']) expect(parse([{ id: 'a', category: { from: 'Nature', to } }]), to).toBeNull()
  })

  it('caps only the new price: 0 to 99,999 cents, whole numbers', () => {
    // Catches a negative, fractional or 1,000 ringgit price, and a cap on the stored price that would lock a row.
    for (const to of [-1, 100000, 4.5, '400', null]) expect(parse([{ id: 'a', priceCents: { from: 400, to } }]), String(to)).toBeNull()
    expect(parse([{ id: 'a', priceCents: { from: 500000, to: 99999 } }])).not.toBeNull()
    expect(parse([{ id: 'a', priceCents: { from: 400, to: 400 } }])).toBeNull() // A no-op.
  })

  it('leaves two renames to one name to the save, which answers 409 name-taken', () => {
    // Catches the validator answering 400 invalid, which gives the page no rows to flag.
    const rename = (id: string, to: string) => ({ id, name: { from: id, to } })
    expect(parse([rename('a', 'Same'), rename('b', 'same')])).not.toBeNull()
  })
})

describe('parseItemName', () => {
  it('returns the name or null', () => {
    // Catches a helper that trims silently instead of refusing.
    expect(parseItemName('Camp Shirt')).toBe('Camp Shirt')
    expect(parseItemName(' Camp Shirt')).toBeNull()
    expect(parseItemName(5)).toBeNull()
  })
})

describe('parseNewItem', () => {
  it('accepts a name, a listed category and a price', () => {
    // Catches a parser that refuses the Add sheet's own request.
    expect(parseNewItem({ name: 'Camp Shirt', category: 'Shirt', priceCents: 1500 })).toEqual({ name: 'Camp Shirt', category: 'Shirt', priceCents: 1500 })
  })

  it('refuses extra keys, a bad name, category or price', () => {
    // Catches Add taking a status or stock from the client, which must always start Hidden with 0.
    const ok = { name: 'Camp Shirt', category: 'Shirt', priceCents: 1500 }
    for (const bad of [{ ...ok, status: 'active' }, { ...ok, name: '' }, { ...ok, category: 'Other' }, { ...ok, priceCents: -1 }, { ...ok, priceCents: 100000 }, { name: 'x', category: 'Shirt' }, null, [ok]]) {
      expect(parseNewItem(bad), JSON.stringify(bad)).toBeNull()
    }
  })
})

describe('parseDeleteRequest', () => {
  // A valid request.
  const seen = { name: 'Camp Shirt', category: 'Shirt', priceCents: 1500, status: 'hidden', stock: 0, modifiedAt: '2026-11-03T01:00:00.000Z' }

  it('accepts an id and the row as seen', () => {
    // Catches a parser that refuses the Delete dialog's own request.
    expect(parseDeleteRequest({ id: 'camp-shirt', seen })).toEqual({ id: 'camp-shirt', seen })
  })

  it('refuses a bad id, a missing or extra field, and a time with no milliseconds', () => {
    // Catches a guard built from unchecked values, which could delete a row the admin never saw.
    const short = { ...seen, stock: undefined } // JSON drops the key: the stock is missing.
    for (const bad of [{ id: 'Camp Shirt', seen }, { id: 'a' }, { id: 'a', seen: short }, { id: 'a', seen: { ...seen, extra: 1 } }, { id: 'a', seen: { ...seen, modifiedAt: '2026-11-03T01:00:00Z' } }, { id: 'a', seen: { ...seen, status: 'gone' } }, { id: 'a', seen, extra: 1 }, null]) {
      expect(parseDeleteRequest(bad), JSON.stringify(bad)).toBeNull()
    }
  })
})
