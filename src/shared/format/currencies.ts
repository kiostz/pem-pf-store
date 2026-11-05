// The currencies the shop can use and the site's own symbol for each, so the shop, the admin and the order email print money the same way (Intl symbols are not used: they print SGD and USD alike as "$").

export const CURRENCIES = ['MYR', 'SGD', 'CNY'] as const // The fixed list, all with 2 decimals; another currency is a code change.

export const CURRENCY_SYMBOLS: Record<(typeof CURRENCIES)[number], string> = {
  MYR: 'RM', // Malaysian ringgit
  SGD: '$', // Singapore dollar
  CNY: '¥', // Chinese yuan, written as the yen sign
} // The symbol written before an amount.

/**
 * Names a currency by its symbol.
 * @param currency the ISO code, e.g. "MYR"
 * @return the symbol such as "RM", or the code itself when it is not in the list
 */
export function symbolOf(currency: string): string {
  return Object.hasOwn(CURRENCY_SYMBOLS, currency) ? CURRENCY_SYMBOLS[currency as keyof typeof CURRENCY_SYMBOLS] : currency // A stored code outside the list stays readable.
}
