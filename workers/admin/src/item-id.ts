// The one check every Admin Worker route applies to an item id from a request: a lower-case slug of at most 100 characters.

// Lower-case slug parts joined by single hyphens; without the `m` flag `$` matches only at the very end, so a trailing newline fails.
const ITEM_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/
// Longest item id the routes accept.
const MAX_ITEM_ID_LENGTH = 100

/**
 * Tells whether a value is an item id.
 * @param value Anything.
 * @return True for a slug of up to 100 characters.
 */
export function isItemId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_ITEM_ID_LENGTH && ITEM_ID.test(value) // No padding, no capitals.
}
