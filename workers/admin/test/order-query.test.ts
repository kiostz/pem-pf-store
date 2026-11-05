// Tests the order list's query and cursor validation: a closed set of steps, a strict order number, a bounded cursor.

import { describe, expect, it } from 'vitest'
import { decodeOrderCursor, encodeOrderCursor, parseOrderQuery } from '../src/order-query'

/**
 * Parses a query string.
 * @param search The part after the question mark.
 * @return The parsed query or null.
 */
const parse = (search: string) => parseOrderQuery(new URL(`https://admin.test/api/orders?${search}`))

describe('parseOrderQuery', () => {
  it('gives the first page of all orders for an empty query', () => {
    // Catches a default that filters or demands a parameter.
    expect(parse('')).toEqual({ step: null, number: null, cursor: null })
  })

  it('accepts each step and refuses an unknown or empty one', () => {
    // Catches an open step filter that reaches SQL or a typo that silently shows everything.
    for (const step of ['new', 'paid', 'handed_out', 'cancelled']) expect(parse(`step=${step}`)?.step).toBe(step)
    for (const step of ['shipped', '', 'NEW', 'paid%20']) expect(parse(`step=${step}`), step).toBeNull()
  })

  it('accepts a lower-case number and upper-cases it', () => {
    // Catches a lookup that fails because the admin typed lower case.
    expect(parse('number=pf-20261105-abcd')?.number).toBe('PF-20261105-ABCD')
  })

  it('refuses a 0, O, 1, I or L in the suffix, a bad date, a short or long number', () => {
    // Catches a pattern looser than the order number alphabet.
    for (const bad of ['PF-20261105-ABC0', 'PF-20261105-ABCO', 'PF-20261105-ABC1', 'PF-20261105-ABCI', 'PF-20261105-ABCL', 'PF-20261305-ABCD', 'PF-20260230-ABCD', 'PF-20261105-ABC', 'PF-20261105-ABCDE', 'XX-20261105-ABCD', '', ' PF-20261105-ABCD']) expect(parse(`number=${encodeURIComponent(bad)}`), bad).toBeNull()
  })

  it('refuses a number together with a step or a cursor', () => {
    // Catches a lookup that quietly ignores a filter the admin thinks applies.
    const cursor = encodeOrderCursor({ createdAt: '2026-11-05T01:00:00.000Z', id: 5 })
    expect(parse('number=PF-20261105-ABCD&step=new')).toBeNull()
    expect(parse(`number=PF-20261105-ABCD&cursor=${cursor}`)).toBeNull()
  })
})

describe('order cursor', () => {
  const encodeText = (text: string) => btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '') // Same alphabet as the code.
  const encode = (value: unknown) => encodeText(JSON.stringify(value)) // A value as a cursor.

  it('round-trips a cursor', () => {
    // Catches an encoder and decoder that disagree.
    const cursor = { createdAt: '2026-11-05T01:00:00.000Z', id: 77 }
    expect(decodeOrderCursor(encodeOrderCursor(cursor))).toEqual(cursor)
    expect(parse(`cursor=${encodeOrderCursor(cursor)}`)?.cursor).toEqual(cursor)
  })

  it('refuses a cursor over 200 characters that otherwise decodes, and accepts the same cursor at 200', () => {
    // Catches a removed or raised length bound: the text is a valid cursor padded with JSON spaces, so only the length check can refuse it.
    const json = JSON.stringify(['2026-11-05T01:00:00.000Z', 5]) // The cursor as JSON.
    const at200 = encodeText(json + ' '.repeat(150 - json.length)) // 150 bytes encode to exactly 200 characters.
    const at202 = encodeText(json + ' '.repeat(151 - json.length)) // 151 bytes encode to 202; 201 cannot exist, as base64 lengths are never 1 more than a multiple of 4.
    expect(at200).toHaveLength(200) // The allowed edge.
    expect(at202).toHaveLength(202) // The shortest decodable text over the bound.
    expect(decodeOrderCursor(at200)).toEqual({ createdAt: '2026-11-05T01:00:00.000Z', id: 5 }) // Decodes cleanly.
    expect(decodeOrderCursor(at202)).toBeNull() // Only the bound refuses it.
    expect(parse(`cursor=${at202}`)).toBeNull() // And the query with it.
  })

  it('refuses a bad time, a bad id and text that is not base64url JSON', () => {
    // Catches an unchecked cursor reaching a query.
    expect(decodeOrderCursor(encode(['2026-02-30T00:00:00.000Z', 5]))).toBeNull() // Not a real date.
    expect(decodeOrderCursor(encode(['2026-11-05', 5]))).toBeNull() // No milliseconds.
    expect(decodeOrderCursor(encode(['2026-11-05T01:00:00.000Z', 0]))).toBeNull() // Id below 1.
    expect(decodeOrderCursor(encode(['2026-11-05T01:00:00.000Z', 1.5]))).toBeNull() // Not an integer.
    expect(decodeOrderCursor(encode(['2026-11-05T01:00:00.000Z', '5']))).toBeNull() // Text id.
    expect(decodeOrderCursor(encode(['2026-11-05T01:00:00.000Z', 5, 'x']))).toBeNull() // Extra part.
    expect(decodeOrderCursor('!!!')).toBeNull()
    expect(parse(`cursor=${'A'.repeat(201)}`)).toBeNull() // Too long and not JSON.
  })
})
