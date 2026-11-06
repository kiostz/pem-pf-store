// Every hash route of the site, and the admin's address, so each screen's address lives in one file and no feature imports another's.

export const HOME_HASH = '#/' // Home's address
export const CATALOGUE_HASH = '#/shop' // the shop's address
export const CART_HASH = '#/cart' // the cart screen's address
export const DETAILS_HASH = '#/details' // the details page's address
export const ORDER_SENT_HASH = '#/order-sent' // the confirmation page's address
export const ADMIN_URL = 'https://pem-pathfinder-store-admin.pempathfinder.workers.dev/' // the live Admin Worker, the same in dev: Home's Admin link goes there

/**
 * Builds the shop's address, with a category and a subcategory when picked.
 * @param category the category name, or null for All categories
 * @param subcategory the subcategory name, or null for All; dropped when there is no category
 * @return #/shop, #/shop?category=<name> or #/shop?category=<name>&subcategory=<name>, each name encoded
 */
export function shopHash(category: string | null, subcategory: string | null = null): string { // the category and subcategory picks
  if (category === null) return CATALOGUE_HASH // a subcategory needs its category
  const base = `${CATALOGUE_HASH}?category=${encodeURIComponent(category)}` // a name with & ? # or + stays one value
  return subcategory === null ? base : `${base}&subcategory=${encodeURIComponent(subcategory)}` // the subcategory follows the category
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

/**
 * Reads the subcategory out of an address.
 * @param hash the address hash, such as #/shop?category=Honors&subcategory=Nature
 * @return the subcategory name, or null when the address has none or a blank one
 */
export function readShopSubcategory(hash: string): string | null { // reads the query
  const at = hash.indexOf('?') // where the query starts
  if (at < 0) return null // no query
  const value = new URLSearchParams(hash.slice(at + 1)).get('subcategory') // decodes %20 and +
  return value === null || value.trim() === '' ? null : value // blank is no subcategory
}
