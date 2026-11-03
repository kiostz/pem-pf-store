// Tests parseItemQuery and the cursor codec: what the item list's query string may hold, and that anything else is refused.

import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor, ITEM_SORTS, parseItemQuery } from '../src/item-query'

// A valid time to build cursors from.
const TIME = '2026-11-01T00:00:00.000Z'

/**
 * Encodes any JSON value as the page would send a cursor, bypassing the Worker's own encoder.
 * @param value The value to wrap.
 * @return base64url text.
 */
const raw = (value: unknown): string => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')

/**
 * Parses a query string.
 * @param query The text after `?`.
 * @return The parsed query, or null.
 */
const parse = (query: string) => parseItemQuery(new URL(`https://admin.test/api/items?${query}`))

describe('parseItemQuery', () => {
  it('defaults to Recently changed, no search, no category, no cursor', () => {
    // Catches a default sort other than `changed`, or a missing default that breaks the first page.
    expect(parse('')).toEqual({ sort: 'changed', words: [], category: null, cursor: null })
    expect(ITEM_SORTS).toEqual(['changed', 'newest', 'name'])
  })

  it('accepts each sort, a category, and a search split into words', () => {
    // Catches a sort or category that is dropped, or a search kept as one string.
    expect(parse('sort=newest&category=Arts%20and%20Crafts&q=Knot%20Tying')).toEqual({ sort: 'newest', words: ['knot', 'tying'], category: 'Arts and Crafts', cursor: null })
    expect(parse('sort=name')?.sort).toBe('name')
  })

  it('folds only ASCII capitals, as SQLite lower() does', () => {
    // Catches a JS toLowerCase that turns "É" into "é", which SQLite never matches against stored "É".
    expect(parse('q=%C3%89COLE%20ABC')?.words).toEqual(['École', 'abc'])
  })

  it('refuses an unknown sort and an unknown or wrong-case category', () => {
    // Catches a free-text sort reaching the SQL, and a category that matches nothing silently.
    expect(parse('sort=size')).toBeNull()
    expect(parse('sort=')).toBeNull()
    expect(parse('category=nature')).toBeNull()
    expect(parse('category=Gardening')).toBeNull()
    expect(parse('category=')).toBeNull()
  })

  it('refuses a search of 6 words, 101 characters, or with a control character', () => {
    // Catches an unbounded search, which would scan with unlimited instr() terms.
    expect(parse('q=a%20b%20c%20d%20e')?.words).toHaveLength(5)
    expect(parse('q=a%20b%20c%20d%20e%20f')).toBeNull()
    expect(parse(`q=${'a'.repeat(100)}`)).not.toBeNull()
    expect(parse(`q=${'a'.repeat(101)}`)).toBeNull()
    expect(parse('q=knot%09tying')).toBeNull()
  })

  it('treats an empty or blank search as no search', () => {
    // Catches an empty box sending instr(...) = 0 for every row.
    expect(parse('q=')?.words).toEqual([])
    expect(parse('q=%20%20')?.words).toEqual([])
  })

  it('reads a cursor for the same sort, and refuses one for another sort', () => {
    // Catches a cursor from one sort silently reused under another, which skips or repeats rows.
    const changed = encodeCursor('changed', { time: TIME, name: 'Knot Tying', id: 'knot-tying' })
    expect(parse(`sort=changed&cursor=${changed}`)?.cursor).toEqual({ time: TIME, name: 'Knot Tying', id: 'knot-tying' })
    expect(parse(`sort=name&cursor=${changed}`)).toBeNull()
    expect(parse(`sort=newest&cursor=${changed}`)).toBeNull()
    const byName = encodeCursor('name', { name: 'Knot Tying', id: 'knot-tying' })
    expect(parse(`sort=name&cursor=${byName}`)?.cursor).toEqual({ name: 'Knot Tying', id: 'knot-tying' })
  })

  it('round-trips a name with non-ASCII letters', () => {
    // Catches btoa throwing on, or mangling, a name like "Café Mocha".
    const text = encodeCursor('name', { name: 'Café Mocha 🍵', id: 'cafe-mocha' })
    expect(decodeCursor('name', text)).toEqual({ name: 'Café Mocha 🍵', id: 'cafe-mocha' })
  })

  it('accepts the longest cursors the Worker makes: 100 four-byte characters, or 100 quotes, with a 100-character id', () => {
    // Catches a cap the Worker's own nextCursor can exceed, which makes Load more fail for good.
    const id = `a${'-b'.repeat(49)}` // 99 characters.
    for (const name of ['\u{1F375}'.repeat(100), '"'.repeat(100), '\\'.repeat(100)]) {
      for (const sort of ['changed', 'name'] as const) {
        const text = encodeCursor(sort, sort === 'name' ? { name, id } : { time: TIME, name, id })
        expect(text.length).toBeLessThanOrEqual(1024)
        expect(decodeCursor(sort, text)).toEqual(sort === 'name' ? { name, id } : { time: TIME, name, id })
      }
    }
  })

  it('refuses malformed cursors', () => {
    // Catches a cursor field that reaches the SQL unchecked.
    const bad = [
      '!!!not-base64!!!',
      raw('just a string'),
      raw(['name', 'Knot Tying', 'knot-tying', 'extra']), // 4 items for the name sort.
      raw(['changed', TIME, 'Knot Tying']), // 3 items for changed.
      raw(['changed', '2026-11-01T00:00:00Z', 'Knot Tying', 'knot-tying']), // No milliseconds.
      raw(['changed', '2026-02-30T00:00:00.000Z', 'Knot Tying', 'knot-tying']), // Not a real date.
      raw(['changed', TIME, 'Knot Tying', 'knot-tying ']), // Padded id.
      raw(['changed', TIME, 'Knot Tying', 'Knot-Tying']), // Not a slug.
      raw(['name', '', 'knot-tying']), // Empty name.
      raw(['name', 'a'.repeat(201), 'knot-tying']), // Name too long.
      raw(['name', 'tab\there', 'knot-tying']), // Control character.
      raw(['name', 5, 'knot-tying']), // Not text.
      raw(['unknown', 'Knot', 'knot-tying']), // Unknown sort.
    ]
    for (const cursor of bad) {
      for (const sort of ITEM_SORTS) expect(parse(`sort=${sort}&cursor=${encodeURIComponent(cursor)}`), `${sort} ${cursor}`).toBeNull() // No sort accepts any of them.
    }
    expect(parse(`cursor=${raw(['name', 'Knot', 'knot-tying'])}`)).toBeNull() // A name cursor under the default sort.
  })

  it('refuses a cursor of 1025 characters', () => {
    // Catches an unbounded cursor.
    const long = 'A'.repeat(1025)
    expect(parse(`cursor=${long}`)).toBeNull()
    expect(decodeCursor('changed', long)).toBeNull()
  })
})
