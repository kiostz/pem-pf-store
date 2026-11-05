// Formats a price for the catalogue, cart, admin and order text from the site's own symbol table, so every screen agrees on the symbol.

import { CURRENCIES, symbolOf } from './currencies.ts' // the symbol table

const AMOUNT = new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) // grouped digits with 2 decimals; the symbol is not taken from Intl

/**
 * Formats an amount as money, e.g. "RM 4.00" (a no-break space after letters), "$4.00" or "¥4.00".
 * @param amount the price in the currency's main unit
 * @param currency ISO currency code from settings, e.g. "MYR"
 * @return the price text; a code outside the list is written before the amount, an empty one is left out
 */
export function formatPrice(amount: number, currency: string): string {
  const digits = AMOUNT.format(amount) // grouped digits; all listed currencies use 2 decimals
  if (!CURRENCIES.some((code) => code === currency)) return `${currency} ${digits}`.trim() // unknown code: write it as it is
  const symbol = symbolOf(currency) // the site's symbol
  return `${symbol}${/\p{L}$/u.test(symbol) ? ' ' : ''}${digits}` // letters get a no-break space, signs do not
}
