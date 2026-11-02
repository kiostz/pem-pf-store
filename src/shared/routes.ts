// Every hash route of the site, and the admin's address, so each screen's address lives in one file and no feature imports another's.

export const HOME_HASH = '#/' // Home's address
export const CATALOGUE_HASH = '#/shop' // the shop's address
export const CART_HASH = '#/cart' // the cart screen's address
export const DETAILS_HASH = '#/details' // the details page's address
export const ORDER_SENT_HASH = '#/order-sent' // the confirmation page's address
export const ADMIN_URL = 'https://pem-pathfinder-store-admin.pempathfinder.workers.dev/' // the live Admin Worker, the same in dev: Home's Admin link goes there

/**
 * Builds the shop's address, with a category when one is picked.
 * @param category the category name, or null for All categories
 * @return #/shop, or #/shop?category=<name> with the name encoded
 */
export function shopHash(category: string | null): string {
  return category === null
    ? CATALOGUE_HASH
    : `${CATALOGUE_HASH}?category=${encodeURIComponent(category)}` // a name with & ? # or + stays one value
}

/**
 * Reads the category out of an address.
 * @param hash the address hash, such as #/shop?category=Nature
 * @return the category name, or null when the address has none or a blank one
 */
export function readShopCategory(hash: string): string | null {
  const at = hash.indexOf('?') // where the query starts
  if (at < 0) return null // no query
  const value = new URLSearchParams(hash.slice(at + 1)).get('category') // decodes %20 and +
  return value === null || value.trim() === '' ? null : value // blank is no category
}
