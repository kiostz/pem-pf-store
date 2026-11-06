// Tests for formatPrice: the price text shown on every item row, in the currency set in settings.

import { describe, expect, it } from 'vitest' // test API
import { formatPrice } from './price.ts' // code under test

describe('formatPrice', () => {
  it('writes MYR as "RM 4.00"', () => {
    expect(formatPrice(4, 'MYR')).toMatch(/^RM\s?4\.00$/) // catches a missing symbol or decimals
  })

  it('keeps two decimals for 3.5', () => {
    expect(formatPrice(3.5, 'MYR')).toMatch(/^RM\s?3\.50$/) // catches "3.5"
  })

  it('shows zero as a price', () => {
    expect(formatPrice(0, 'MYR')).toMatch(/^RM\s?0\.00$/) // catches a falsy check hiding zero
  })

  it('keeps the no-break space after RM', () => {
    expect(formatPrice(4, 'MYR')).toBe('RM\u00a04.00') // catches a changed MYR spacing
  })

  it('writes SGD with a dollar sign', () => {
    expect(formatPrice(4, 'SGD')).toBe('$4.00') // catches a hard-coded RM
  })

  it('writes CNY with the yen sign U+00A5', () => {
    expect(formatPrice(4, 'CNY')).toBe('\u00a54.00') // catches a missing or wrong symbol
  })

  it('no longer knows BND or USD and writes the code', () => {
    expect([formatPrice(4, 'BND'), formatPrice(4, 'USD')]).toEqual(['BND 4.00', 'USD 4.00']) // catches a removed currency still printing a symbol
  })

  it('writes a malformed code before the amount', () => {
    expect(formatPrice(4, 'RM')).toBe('RM 4.00') // catches a RangeError from Intl reaching the screen
  })

  it('writes the amount alone for an empty code', () => {
    expect(formatPrice(4, '')).toBe('4.00') // catches a leading space or "undefined"
  })

  it('keeps the thousands separator for MYR', () => {
    expect([formatPrice(1200, 'MYR'), formatPrice(1234567.89, 'MYR')]).toEqual(['RM\u00a01,200.00', 'RM\u00a01,234,567.89']) // catches a toFixed that drops the comma
  })

  it('keeps the thousands separator for SGD and CNY', () => {
    expect([formatPrice(1200, 'SGD'), formatPrice(1200, 'CNY')]).toEqual(['$1,200.00', '\u00a51,200.00']) // catches a symbol path that skips grouping
  })

  it('groups the amount after an unlisted code', () => {
    expect(formatPrice(1200, 'BND')).toBe('BND 1,200.00') // catches the unknown-code path skipping grouping
  })
})
