// Tests for the admin price field: the text it accepts, the cents it gives, and the two error lines.

import { describe, expect, it } from 'vitest' // test API
import { currencySymbol, formatPriceInput, parsePrice } from './price-input.ts' // the code under test

describe('parsePrice', () => {
  it('turns whole ringgit and one or two decimals into cents', () => {
    // Catches a float multiply that turns 4.10 into 409 cents, or a text that loses its decimals.
    expect(parsePrice('4')).toEqual({ ok: true, cents: 400 })
    expect(parsePrice('4.5')).toEqual({ ok: true, cents: 450 })
    expect(parsePrice('4.10')).toEqual({ ok: true, cents: 410 })
    expect(parsePrice('0')).toEqual({ ok: true, cents: 0 })
    expect(parsePrice(' 999.99 ')).toEqual({ ok: true, cents: 99999 })
  })

  it('refuses text that is not a price with "Enter a price like 4.50."', () => {
    // Catches letters, a comma, a minus, three decimals or an empty field passing as a price.
    for (const text of [
      '',
      'abc',
      '4,50',
      '-1',
      '4.',
      '.5',
      '4.123',
      'RM 4',
      '1e3',
    ])
      expect(parsePrice(text)).toEqual({
        ok: false,
        error: 'Enter a price like 4.50.',
      })
  })

  it('refuses a price over 999.99 with "Prices go up to 999.99."', () => {
    // Catches a price the Worker would refuse reaching it, or the wrong line for a too-big number.
    expect(parsePrice('1000')).toEqual({
      ok: false,
      error: 'Prices go up to 999.99.',
    })
    expect(parsePrice('12345.50')).toEqual({
      ok: false,
      error: 'Prices go up to 999.99.',
    })
  })
})

describe('formatPriceInput and currencySymbol', () => {
  it('writes cents as two decimals and names the currency by its symbol', () => {
    // Catches "4.5" in the field for 450 cents, or MYR where the rows say RM.
    expect(formatPriceInput(450)).toBe('4.50')
    expect(formatPriceInput(99999)).toBe('999.99')
    expect(currencySymbol('MYR')).toBe('RM')
    expect(currencySymbol('??')).toBe('??')
  })
})
