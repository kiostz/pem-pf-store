// Reads which screen the address hash names, so every screen has an address that back and reload understand, with no router package.

import { useSyncExternalStore } from 'react' // follows the address
import {
  CART_HASH,
  CATALOGUE_HASH,
  DETAILS_HASH,
  ORDER_SENT_HASH,
  readShopCategory,
  readShopSubcategory, // the subcategory reader
} from '@/shared/routes.ts' // the screens' addresses and the category and subcategory readers

/**
 * Tells React when the hash changes.
 * @param onChange called on every hashchange
 * @return the function that stops listening
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange) // back, forward, links and typing all fire it
  return () => window.removeEventListener('hashchange', onChange) // stop on unmount
}

/**
 * Names the screen for the current address.
 * @return 'catalogue' for #/shop with or without a query, 'cart', 'details' and 'order-sent' for exactly their addresses, otherwise 'home'
 */
export function useHashRoute():
  'home' | 'catalogue' | 'cart' | 'details' | 'order-sent' {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash) // the live hash
  if (hash === CART_HASH) return 'cart' // the cart screen
  if (hash === DETAILS_HASH) return 'details' // the details page
  if (hash === ORDER_SENT_HASH) return 'order-sent' // the confirmation
  if (hash === CATALOGUE_HASH || hash.startsWith(`${CATALOGUE_HASH}?`))
    return 'catalogue' // only the shop takes a query
  return 'home' // anything else, unknown addresses included
}

/**
 * Reads the category the address names.
 * @return the category in the address, or null for none
 */
export function useShopCategory(): string | null {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash) // the same subscription as the route
  return readShopCategory(hash) // null when absent or blank
}

/**
 * Reads the subcategory the address names.
 * @return the subcategory in the address, or null for none
 */
export function useShopSubcategory(): string | null { // the address's subcategory
  const hash = useSyncExternalStore(subscribe, () => window.location.hash) // the same subscription as the route
  return readShopSubcategory(hash) // null when absent or blank
}
