// Order number tests: the Malaysia date, the alphabet and the unbiased draw, so numbers read the same on paper and never use the buyer's time zone.

import { describe, expect, it } from 'vitest'
import { makeOrderNumber } from '../src/order-number'

/**
 * Makes a random source that fills every byte with one value.
 * @param byte The value.
 * @return The filler.
 */
const fill = (byte: number) => (array: Uint8Array<ArrayBuffer>) => array.fill(byte) // Constant bytes.

describe('makeOrderNumber', () => {
  it('uses the Malaysia date, so 17:00 UTC is already the next day', async () => {
    // Catches a UTC date, which would show 20261101 to a buyer in Kuala Lumpur at 01:00.
    expect(makeOrderNumber(new Date('2026-11-01T17:00:00Z'), fill(0))).toBe('PF-20261102-2222') // 01:00 on the 2nd.
  })

  it('switches day at 16:00:00 UTC exactly', async () => {
    // Catches an off-by-one hour or a date taken from the server's zone.
    expect(makeOrderNumber(new Date('2026-11-01T15:59:59.999Z'), fill(0))).toBe('PF-20261101-2222') // Last millisecond of the 1st.
    expect(makeOrderNumber(new Date('2026-11-01T16:00:00Z'), fill(0))).toBe('PF-20261102-2222') // First of the 2nd.
  })

  it('maps bytes onto the 31-character alphabet and skips biased bytes', async () => {
    // Catches modulo bias (bytes 248-255) and a 0/O/1/I/L in the alphabet.
    let call = 0 // Which draw this is.
    const bytes = [255, 248, 0, 1, 30, 31, 0, 0] // The first two are skipped; the rest give 2, 3, Z, 2.
    const number = makeOrderNumber(new Date('2026-11-02T00:00:00Z'), (array) => { call += 1; array.set(bytes); return array }) // One draw is enough.
    expect(number).toBe('PF-20261102-23Z2') // Skipped 255 and 248.
    expect(call).toBe(1) // No second draw needed.
  })

  it('draws again when a draw has too few usable bytes', async () => {
    // Catches a short suffix when the first draw is all biased.
    let call = 0 // Draw counter.
    const number = makeOrderNumber(new Date('2026-11-02T00:00:00Z'), (array) => { call += 1; return array.fill(call === 1 ? 255 : 2) }) // First draw unusable.
    expect(number).toBe('PF-20261102-4444') // Byte 2 is "4".
  })

  it('only ever uses the safe alphabet', async () => {
    // Catches a confusable character reaching a printed order number.
    for (let i = 0; i < 200; i += 1) expect(makeOrderNumber(new Date('2026-11-02T00:00:00Z'))).toMatch(/^PF-\d{8}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/) // Real randomness.
  })
})
