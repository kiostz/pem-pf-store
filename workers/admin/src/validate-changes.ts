// Validates the body of a save where it enters: strict shape, bounded values, no surprises reach the database.

import type { DeleteRequest, ItemChange, ItemStatus, NewItem } from './admin-types' // The change shapes.
import { CATEGORIES } from './categories' // The category list.
import { isItemId } from './item-id' // The item id check.
import { isCleanText, parseItemName } from './validate-text' // Text rules.

// The most items one save may hold.
export const MAX_CHANGES = 500
// The highest stock the admin may set.
export const MAX_STOCK = 9999
// The highest price the admin may set, in cents.
export const MAX_PRICE_CENTS = 99999
// ISO UTC time with milliseconds.
const TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
// The two statuses.
const STATUSES: readonly unknown[] = ['active', 'hidden']

/**
 * Tells whether a value is a plain object.
 * @param value Anything.
 * @return True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) // Arrays and null are not records.
}

/**
 * Tells whether an object has no keys beyond the allowed ones.
 * @param record The object.
 * @param allowed The permitted keys.
 * @return True when every key is allowed.
 */
function onlyKeys(record: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key)) // Extra keys are refused.
}

/**
 * Parses a `{ from, to }` pair with a per-value check.
 * @param value The raw pair.
 * @param valid Tells whether one side is acceptable.
 * @return The pair, or null when malformed or unchanged.
 */
function parsePair<T>(value: unknown, valid: (side: unknown, which: 'from' | 'to') => side is T): { from: T; to: T } | null {
  if (!isRecord(value) || !onlyKeys(value, ['from', 'to'])) return null // Exactly from and to.
  const { from, to } = value // The two sides.
  if (!valid(from, 'from') || !valid(to, 'to')) return null // Each side checked.
  return from === to ? null : { from, to } // A no-op change is refused.
}

/**
 * Checks a stock side: a JSON integer; `to` is also capped at the limit.
 * @param side The raw number.
 * @param which Whether it is the seen value or the wanted one.
 * @return True when acceptable.
 */
function validStock(side: unknown, which: 'from' | 'to'): side is number {
  if (typeof side !== 'number' || !Number.isSafeInteger(side) || side < 0) return false // Text, fractions and negatives fail.
  return which === 'from' || side <= MAX_STOCK // Only the new value is capped.
}

/**
 * Checks a status side.
 * @param side The raw status.
 * @return True for `active` or `hidden`.
 */
function validStatus(side: unknown): side is ItemStatus {
  return STATUSES.includes(side) // Exact, case-sensitive.
}

/**
 * Checks a name side: `to` follows the name rules; `from` is any stored name.
 * @param side The raw name.
 * @param which Whether it is the seen value or the wanted one.
 * @return True when acceptable.
 */
function validName(side: unknown, which: 'from' | 'to'): side is string {
  return which === 'to' ? parseItemName(side) !== null : isCleanText(side, 1, 200) // The seen name is only compared, never stored.
}

/**
 * Checks a category side: `to` is on the fixed list; `from` is any stored text.
 * @param side The raw category.
 * @param which Whether it is the seen value or the wanted one.
 * @return True when acceptable.
 */
function validCategory(side: unknown, which: 'from' | 'to'): side is string {
  return which === 'to' ? typeof side === 'string' && CATEGORIES.includes(side) : isCleanText(side, 1, 100) // Exact, case-sensitive.
}

/**
 * Checks a price side: whole cents; `to` is also capped.
 * @param side The raw number.
 * @param which Whether it is the seen value or the wanted one.
 * @return True when acceptable.
 */
function validPrice(side: unknown, which: 'from' | 'to'): side is number {
  if (typeof side !== 'number' || !Number.isSafeInteger(side) || side < 0) return false // Text, fractions and negatives fail.
  return which === 'from' || side <= MAX_PRICE_CENTS // Only the new value is capped.
}

/**
 * Parses one item's change.
 * @param value The raw change.
 * @return The change, or null when invalid.
 */
function parseChange(value: unknown): ItemChange | null {
  if (!isRecord(value) || !onlyKeys(value, ['id', 'status', 'stock', 'name', 'category', 'priceCents'])) return null // No extra keys.
  const { id } = value // The item id.
  if (!isItemId(id)) return null // Slug only.
  const change: ItemChange = { id } // Starts with the id only.
  if (value.status !== undefined) { // A status change is present.
    const status = parsePair(value.status, validStatus) // Status pair.
    if (status === null) return null // Invalid status.
    change.status = status // Keep the pair.
  }
  if (value.stock !== undefined) { // A stock change is present.
    const stock = parsePair(value.stock, validStock) // Stock pair.
    if (stock === null) return null // Invalid stock.
    change.stock = stock // Keep the pair.
  }
  if (value.name !== undefined) { // A name change is present.
    const name = parsePair(value.name, validName) // Name pair.
    if (name === null) return null // Invalid name.
    change.name = name // Keep the pair.
  }
  if (value.category !== undefined) { // A category change is present.
    const category = parsePair(value.category, validCategory) // Category pair.
    if (category === null) return null // Invalid category.
    change.category = category // Keep the pair.
  }
  if (value.priceCents !== undefined) { // A price change is present.
    const priceCents = parsePair(value.priceCents, validPrice) // Price pair.
    if (priceCents === null) return null // Invalid price.
    change.priceCents = priceCents // Keep the pair.
  }
  return Object.keys(change).length === 1 ? null : change // Something besides the id must change.
}

/**
 * Parses the body of a save.
 * @param body The JSON-parsed request body.
 * @return The changes, or null when anything is invalid (the whole save is refused).
 */
export function parseItemChanges(body: unknown): ItemChange[] | null {
  if (!isRecord(body) || !onlyKeys(body, ['changes'])) return null // Only `changes`.
  const { changes } = body // The raw list.
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > MAX_CHANGES) return null // 1 to 500.
  const parsed: ItemChange[] = [] // The valid changes.
  for (const raw of changes) { // Each raw change.
    const change = parseChange(raw) // Null when invalid.
    if (change === null) return null // One bad entry refuses all.
    parsed.push(change) // Keep it.
  }
  return new Set(parsed.map((change) => change.id)).size === parsed.length ? parsed : null // No repeated ids.
}

/**
 * Parses the body of an Add.
 * @param body The JSON-parsed request body.
 * @return The new item, or null when invalid.
 */
export function parseNewItem(body: unknown): NewItem | null {
  if (!isRecord(body) || !onlyKeys(body, ['name', 'category', 'priceCents'])) return null // Exactly these three.
  const name = parseItemName(body.name) // Name rules.
  if (name === null || !validCategory(body.category, 'to') || !validPrice(body.priceCents, 'to')) return null // Each field checked as a `to`.
  return { name, category: body.category, priceCents: body.priceCents } // Checked above.
}

/**
 * Parses the body of a Delete: the id and the row as the admin saw it.
 * @param body The JSON-parsed request body.
 * @return The request, or null when invalid.
 */
export function parseDeleteRequest(body: unknown): DeleteRequest | null {
  if (!isRecord(body) || !onlyKeys(body, ['id', 'seen'])) return null // Exactly these two.
  const { id, seen } = body // The raw parts.
  if (!isItemId(id)) return null // Slug only.
  if (!isRecord(seen) || !onlyKeys(seen, ['name', 'category', 'priceCents', 'status', 'stock', 'modifiedAt'])) return null // Exactly the guard fields.
  const { name, category, priceCents, status, stock, modifiedAt } = seen // The raw guard.
  if (!validName(name, 'from') || !validCategory(category, 'from') || !validPrice(priceCents, 'from')) return null // Seen values, uncapped.
  if (!validStatus(status) || !validStock(stock, 'from')) return null // Status and stock.
  if (typeof modifiedAt !== 'string' || !TIME_PATTERN.test(modifiedAt)) return null // A time with milliseconds.
  return { id, seen: { name, category, priceCents, status, stock, modifiedAt } } // Checked above.
}
