// Reads and writes the cart in localStorage, so a reload keeps it and a bad stored value costs one cart, never an error screen.

import { clampQuantity, type CartQuantities } from './cart.ts' // the quantity rules

export const CART_STORAGE_KEY = 'pem-pf-store:cart' // repo name in the key: the site origin is shared by the account's other sites
const CART_VERSION = 1 // the stored format

/**
 * Reads the stored cart.
 * @param storage where to read; the browser's localStorage by default
 * @return the quantities; empty when nothing is stored, or when the stored value is unusable (one warning then)
 */
export function readCart(storage?: Storage): CartQuantities {
  let text: string | null // the stored text
  try {
    text = (storage ?? window.localStorage).getItem(CART_STORAGE_KEY) // blocked storage throws here
  } catch {
    console.warn('Cart storage cannot be read; starting with an empty cart.') // never the error text: it may hold stored content
    return {} // work in memory
  }
  if (text === null) return {} // a first visit, nothing to warn about
  let parsed: unknown // whatever the text holds
  try {
    parsed = JSON.parse(text) // bad JSON throws
  } catch {
    console.warn('Stored cart is not valid JSON; starting with an empty cart.') // one warning, no content
    return {} // one cart lost, no error screen
  }
  const quantities = (
    parsed as { version?: unknown; quantities?: unknown } | null
  )?.quantities // the map, if the shape is right
  if (
    typeof parsed !== 'object' || // not an object
    parsed === null || // JSON null
    (parsed as { version?: unknown }).version !== CART_VERSION || // another format
    typeof quantities !== 'object' || // no map
    quantities === null || // a null map
    Array.isArray(quantities) // a list, not a map
  ) {
    // wrong version or shape
    console.warn(
      'Stored cart has an unknown format; starting with an empty cart.', // no stored content in it
    ) // one warning
    return {} // one cart lost
  }
  const kept: CartQuantities = {} // only the usable values
  for (const [itemId, value] of Object.entries(quantities)) { // each item id in the cart with its quantity
    // check each stored value
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)
      continue // zero, negative, fractional and non-numbers are dropped
    kept[itemId] = clampQuantity(value) // over 99 becomes 99
  }
  return kept // the cleaned cart
}

/**
 * Stores the cart.
 * @param quantities item id to quantity
 * @param storage where to write; the browser's localStorage by default
 * @return nothing; a failing storage gives a warning and the cart stays in memory
 */
export function writeCart(quantities: CartQuantities, storage?: Storage): void {
  try {
    ;(storage ?? window.localStorage).setItem(
      CART_STORAGE_KEY, // the repo-scoped key
      JSON.stringify({ version: CART_VERSION, quantities }), // the versioned format
    ) // blocked or full storage throws
  } catch {
    console.warn(
      `Cart storage cannot be written; ${Object.keys(quantities).length} order lines stay in memory only.`, // a count, no names
    ) // one warning
  }
}
