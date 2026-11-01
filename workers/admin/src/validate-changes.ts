// Validates the body of a save where it enters: strict shape, bounded values, no surprises reach the database.

import type { HonorChange, HonorStatus } from './admin-types' // The change shapes.

// The most honors one save may hold.
export const MAX_CHANGES = 500
// The highest stock the admin may set.
export const MAX_STOCK = 9999
// Lower-case slug parts joined by single hyphens; without the `m` flag `$` matches only at the very end, so a trailing newline fails.
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
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
function validStatus(side: unknown): side is HonorStatus {
  return STATUSES.includes(side) // Exact, case-sensitive.
}

/**
 * Parses one honor's change.
 * @param value The raw change.
 * @return The change, or null when invalid.
 */
function parseChange(value: unknown): HonorChange | null {
  if (!isRecord(value) || !onlyKeys(value, ['id', 'status', 'stock'])) return null // No extra keys.
  const { id } = value // The honor id.
  if (typeof id !== 'string' || id.length > 100 || !ID_PATTERN.test(id)) return null // Slug only.
  const change: HonorChange = { id } // Starts with the id only.
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
  return change.status === undefined && change.stock === undefined ? null : change // Something must change.
}

/**
 * Parses the body of a save.
 * @param body The JSON-parsed request body.
 * @return The changes, or null when anything is invalid (the whole save is refused).
 */
export function parseHonorChanges(body: unknown): HonorChange[] | null {
  if (!isRecord(body) || !onlyKeys(body, ['changes'])) return null // Only `changes`.
  const { changes } = body // The raw list.
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > MAX_CHANGES) return null // 1 to 500.
  const parsed: HonorChange[] = [] // The valid changes.
  for (const raw of changes) { // Each raw change.
    const change = parseChange(raw) // Null when invalid.
    if (change === null) return null // One bad entry refuses all.
    parsed.push(change) // Keep it.
  }
  return new Set(parsed.map((change) => change.id)).size === parsed.length ? parsed : null // No repeated ids.
}
