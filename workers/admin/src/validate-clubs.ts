// Validates the bodies of the club writes where they enter: strict shape and clean text, so nothing messy reaches the clubs table.

import type { ClubEdit, ClubFields, ClubOrder, ClubRemove } from './admin-types' // The shapes.
import { hasExactKeys } from './validate-orders' // The exact-keys check.
import { hasControlCharacter, isCleanText } from './validate-text' // The text rules.

// The optional detail fields, in body order.
const DETAILS = ['area', 'language', 'location', 'churchName'] as const
// The most ids one reorder may carry.
const MAX_ORDER_IDS = 500

/**
 * Parses one optional detail: null, or 1-100 clean characters with no padding.
 * @param value The raw value.
 * @return The text or null, or undefined when invalid.
 */
function parseDetail(value: unknown): string | null | undefined {
  if (value === null) return null // Blank.
  return isCleanText(value, 1, 100) && value === value.trim() ? value : undefined // Padding is refused, never trimmed silently.
}

/**
 * Parses a club name: 1-100 UTF-16 units (as the order request counts), clean and unpadded.
 * @param value The raw name.
 * @return The name, or null when invalid.
 */
function parseClubName(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 1 || value.length > 100 || hasControlCharacter(value)) return null // Units, not code points.
  return value === value.trim() ? value : null // Padding is refused, never trimmed silently.
}

/**
 * Parses club fields that will be written: strict rules (a clean, unpadded name never "other", counted in UTF-16 units).
 * @param body The parsed JSON.
 * @return The fields, or null when invalid.
 */
export function parseClubFields(body: unknown): ClubFields | null {
  if (!hasExactKeys(body, ['name', ...DETAILS])) return null // Exact shape.
  const name = parseClubName(body.name) // 1-100 units, clean, unpadded.
  const [area, language, location, churchName] = DETAILS.map((key) => parseDetail(body[key])) // Each detail.
  if (name === null || name.toLowerCase() === 'other') return null // "Other" is kept for unlisted clubs.
  if (area === undefined || language === undefined || location === undefined || churchName === undefined) return null // A bad detail.
  return { name, area, language, location, churchName } // All checked.
}

/**
 * Parses club fields the admin saw: lenient on content so a stored row with messy text can still be edited, strict on shape.
 * @param body The parsed JSON.
 * @return The fields, or null when invalid.
 */
function parseSeenFields(body: unknown): ClubFields | null {
  if (!hasExactKeys(body, ['name', ...DETAILS])) return null // Exact shape.
  const seen = [body.name, ...DETAILS.map((key) => body[key])] // Name then details.
  const [name, area, language, location, churchName] = seen // Unpacked.
  const textOk = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 1000 // Non-empty, bounded text.
  if (!textOk(name) || ![area, language, location, churchName].every((value) => value === null || textOk(value))) return null // Each field checked.
  return { name, area, language, location, churchName } as ClubFields // Verified above.
}

/**
 * Tells whether two sets of club fields are equal.
 * @param a One set.
 * @param b The other.
 * @return True when every field matches.
 */
function sameFields(a: ClubFields, b: ClubFields): boolean {
  return a.name === b.name && DETAILS.every((key) => a[key] === b[key]) // Field by field.
}

/**
 * Parses a club id.
 * @param value Anything.
 * @return The id, or null when not a positive safe integer.
 */
function parseId(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null // Whole and positive.
}

/**
 * Parses the body of `POST /api/clubs/edit`.
 * @param body The parsed JSON.
 * @return The edit, or null when invalid (a no-op included).
 */
export function parseClubEdit(body: unknown): ClubEdit | null {
  if (!hasExactKeys(body, ['id', 'from', 'to'])) return null // Exact shape.
  const id = parseId(body.id) // The club.
  const from = parseSeenFields(body.from) // What was seen.
  const to = parseClubFields(body.to) // What is wanted, strictly.
  if (id === null || from === null || to === null || sameFields(from, to)) return null // A no-op is refused.
  return { id, from, to } // All checked.
}

/**
 * Parses the body of `POST /api/clubs/remove`.
 * @param body The parsed JSON.
 * @return The removal, or null when invalid.
 */
export function parseClubRemove(body: unknown): ClubRemove | null {
  if (!hasExactKeys(body, ['id', 'seen'])) return null // Exact shape.
  const id = parseId(body.id) // The club.
  const seen = parseSeenFields(body.seen) // What was seen.
  return id === null || seen === null ? null : { id, seen } // Both checked.
}

/**
 * Parses a list of 1-500 distinct club ids.
 * @param value Anything.
 * @return The ids, or null when invalid.
 */
function parseIds(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ORDER_IDS) return null // A bounded array.
  const ids = value.map(parseId) // Each id.
  if (ids.some((id) => id === null) || new Set(ids).size !== ids.length) return null // Whole, positive, distinct.
  return ids as number[] // Verified above.
}

/**
 * Parses the body of `POST /api/clubs/order`.
 * @param body The parsed JSON.
 * @return The reorder, or null when invalid (not a permutation, or a no-op).
 */
export function parseClubOrder(body: unknown): ClubOrder | null {
  if (!hasExactKeys(body, ['from', 'to'])) return null // Exact shape.
  const from = parseIds(body.from) // The seen order.
  const to = parseIds(body.to) // The wanted order.
  if (from === null || to === null || from.length !== to.length) return null // Same length.
  const seen = new Set(from) // The ids seen.
  if (!to.every((id) => seen.has(id)) || to.every((id, index) => id === from[index])) return null // Same ids, and a real move.
  return { from, to } // All checked.
}
