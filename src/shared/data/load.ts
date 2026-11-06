// Reads the shop's one API answer (/shop) at run time and checks it where it enters, so the data stays out of the JS bundle and every screen shares one fetch-and-check path.

import type { Club, ClubList, Item, ShopSettings } from './types.ts' // the shapes of one item, the clubs and the settings

// Why a load failed: the API's rate limit asked the buyer to wait, or anything else.
export type ShopLoadFailure = 'busy' | 'failed'

// Thrown by loadShop for every failure, so the screens only deal with one class.
export class ShopLoadError extends Error {
  readonly kind: ShopLoadFailure // busy for a 429, failed for the rest

  /**
   * Builds the error.
   * @param kind busy or failed
   * @param message what went wrong, with no buyer data
   */
  constructor(kind: ShopLoadFailure, message: string) {
    super(message) // the readable text
    this.name = 'ShopLoadError' // shows in the console
    this.kind = kind // which copy the screens show
  }
}

const CLUB_KEYS = ['name', 'area', 'language', 'location', 'churchName'] // the five keys every club has

/**
 * Tells whether a value is a well-formed club: the five keys, a non-empty name, the other four a non-empty string or null.
 * @param entry one item of the parsed file
 * @return true when it is a club
 */
function isClub(entry: unknown): entry is Club {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
    return false // an old string entry, null or a list
  const keys = Object.keys(entry) // what the file has
  if (
    keys.length !== CLUB_KEYS.length || // an extra key
    !CLUB_KEYS.every((key) => keys.includes(key)) // a missing key
  )
    return false // a missing or extra key
  const club = entry as Record<string, unknown> // read key by key
  if (typeof club.name !== 'string' || club.name === '') return false // the name is required
  return CLUB_KEYS.slice(1).every(
    (key) =>
      club[key] === null || // no value
      (typeof club[key] === 'string' && club[key] !== ''), // or a non-empty string
  ) // "" must be null
}

/**
 * Tells whether a value is a plain object.
 * @param value anything parsed from JSON
 * @return true for an object that is not null or a list
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) // JSON null and lists are not objects here
}

/**
 * Tells whether a value is a whole number of 0 or more.
 * @param value anything parsed from JSON
 * @return true for 0, 1, 2 and so on
 */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 // no fractions, no negatives, no strings
}

// The shape of an R2 picture key; the Admin Worker uses the same pattern.
const PICTURE_KEY = /^items\/[a-z0-9]+(-[a-z0-9]+)*\.(webp|png)$/

/**
 * Validates one entry of the parsed answer and builds the item from it.
 * @param entry one item of the parsed answer
 * @return the item, with the price in main units
 * @throws ShopLoadError (failed) when a field is missing or has the wrong type; extra keys are ignored
 */
function toItem(entry: unknown): Item { // checks one entry and returns an item
  if (
    !isRecord(entry) || // not an object
    typeof entry.id !== 'string' || entry.id === '' || // id is required
    typeof entry.name !== 'string' || entry.name === '' || // name is required
    typeof entry.category !== 'string' || entry.category === '' || // category is required
    !(entry.subcategory === undefined || entry.subcategory === null || (typeof entry.subcategory === 'string' && entry.subcategory !== '')) || // a name, null, or a missing key (an older Worker)
    !isCount(entry.priceCents) || // whole cents
    !isCount(entry.stock) || // whole units
    !(entry.image === null || (typeof entry.image === 'string' && entry.image !== '')) // a path or null
  )
    throw new ShopLoadError('failed', 'Could not load the shop: a shop row is not valid') // the first bad row blanks the shop
  return {
    id: entry.id, // checked above
    name: entry.name, // checked above
    category: entry.category, // checked above
    subcategory: entry.subcategory ?? null, // a missing key counts as none
    price: entry.priceCents / 100, // major units, as the cart and the order email expect until they move to cents
    stock: entry.stock, // checked above
    image: entry.image !== null && PICTURE_KEY.test(entry.image) ? entry.image : null, // a bad key shows the category mark; it never blanks the shop
  }
}

/**
 * Fetches the shop's items, clubs and settings in one request.
 * @param fetchFn the fetch to use; tests pass a fake
 * @param signal aborts the request, for the 30 second cap
 * @return the items, the clubs and the settings
 * @throws ShopLoadError busy on a 429; failed on a network error, an abort, any other status, a body that is not JSON or any invalid field
 */
export async function loadShop(
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<{ items: Item[]; clubs: ClubList; settings: ShopSettings }> { // the items, clubs and settings
  let response: Response // the API's answer
  try {
    response = await fetchFn(`${import.meta.env.VITE_API_URL}/shop`, { signal }) // one GET, same origin in dev through the proxy
  } catch (error) {
    throw new ShopLoadError('failed', `Could not load the shop: ${error instanceof Error ? error.name : 'request failed'}`) // offline or aborted; the class name only
  }
  if (response.status === 429) throw new ShopLoadError('busy', 'Could not load the shop: HTTP 429') // the rate limit
  if (!response.ok) throw new ShopLoadError('failed', `Could not load the shop: HTTP ${response.status}`) // 404, 500 and so on
  let body: unknown // the parsed answer, not yet checked
  try {
    body = await response.json() // parse the JSON
  } catch {
    throw new ShopLoadError('failed', 'Could not load the shop: the answer is not valid JSON') // an HTML error page
  }
  if (
    !isRecord(body) || // not an object
    !Array.isArray(body.items) || // no item list
    !Array.isArray(body.clubs) || // no club list
    !isRecord(body.settings) || // no settings
    typeof body.settings.currency !== 'string' || // no currency
    !/^[A-Z]{3}$/.test(body.settings.currency) // not three capitals
  )
    throw new ShopLoadError('failed', 'Could not load the shop: the answer is not valid') // wrong format
  if (
    !body.clubs.every(isClub) || // a bad club
    new Set(body.clubs.map((club) => club.name)).size !== body.clubs.length // or a repeated name
  )
    throw new ShopLoadError('failed', 'Could not load the shop: the club list is not valid') // a bad entry or a repeated name
  return {
    items: body.items.map(toItem), // each item checked
    clubs: body.clubs, // checked above
    settings: { currency: body.settings.currency }, // only the field the shop uses
  }
}
