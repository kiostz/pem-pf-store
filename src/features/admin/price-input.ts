// The admin price field's rules: text like "4.50" to whole cents with the Worker's limit, so a price the Worker would refuse never leaves the sheet.

import { symbolOf } from '@/shared/format/currencies.ts' // the site's symbols

// The result of reading a typed price: cents, or the line to show.
export type PriceResult =
  { ok: true; cents: number } | { ok: false; error: string }

/**
 * Reads a typed price.
 * @param text what the admin typed, such as "4.50"
 * @return the cents, or the error line (a price like 4.50, or the limit of 999.99)
 */
export function parsePrice(text: string): PriceResult {
  const typed = text.trim() // outer spaces do not matter
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(typed) // whole ringgit and up to two decimals
  if (match === null) return { ok: false, error: 'Enter a price like 4.50.' } // not a price
  if (match[1].length > 3)
    return { ok: false, error: 'Prices go up to 999.99.' } // over three digits is 1,000 or more
  return {
    ok: true,
    cents: Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')),
  } // whole cents without a float multiply
}

/**
 * Writes cents the way the price field shows them.
 * @param cents whole cents
 * @return the amount with two decimals, such as "4.50"
 */
export const formatPriceInput = (cents: number): string =>
  (cents / 100).toFixed(2) // two decimals

/**
 * Names the currency by its symbol, such as "RM".
 * @param currency the ISO code from /api/meta
 * @return the site's symbol, or the code itself when it is not in the list
 */
export const currencySymbol = (currency: string): string => symbolOf(currency) // the shared symbol table
