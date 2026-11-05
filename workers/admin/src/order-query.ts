// Parses the order list's query string and cursor where they enter: a closed set of steps, a strict order number, a bounded cursor.

import type { OrderStep } from './admin-types' // The step type.

export const ORDER_STEPS: readonly OrderStep[] = ['new', 'paid', 'handed_out', 'cancelled'] // The four steps.

// Where a page continues: the last row's time and id.
export interface OrderCursor {
  createdAt: string // ISO time of the last row.
  id: number // Row id of the last row.
}

// A checked order list query.
export interface OrderQuery {
  step: OrderStep | null // One step, or all.
  number: string | null // One upper-case order number, or the list.
  cursor: OrderCursor | null // Where the page starts, or the first page.
}

const MAX_CURSOR_CHARS = 200 // Most characters in a cursor.
const TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/ // ISO UTC time with milliseconds.
const BASE64URL = /^[A-Za-z0-9_-]+$/ // The base64url alphabet.
const NUMBER_PATTERN = /^PF-(\d{4})(\d{2})(\d{2})-[2-9A-HJKMNP-Z]{4}$/ // PF, the date, and four characters of the order number alphabet (no 0, O, 1, I or L).

/**
 * Tells whether text is an ISO UTC time with milliseconds that is a real date.
 * @param value Anything.
 * @return True for a time such as 2026-11-01T00:00:00.000Z.
 */
function isTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value // Pattern, and no 30 February.
}

/**
 * Checks an order number and upper-cases it.
 * @param value Anything.
 * @return The upper-case number, or null when it is not PF-YYYYMMDD-XXXX with a real date.
 */
export function parseOrderNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null // Text only.
  const upper = value.toUpperCase() // Lower case is accepted.
  const match = NUMBER_PATTERN.exec(upper) // Shape and alphabet.
  if (match === null) return null // Not an order number.
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])] // The date parts.
  const date = new Date(Date.UTC(year, month - 1, day)) // Rolls over for a bad day.
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? upper : null // A real date only.
}

/**
 * Encodes a cursor as base64url of a JSON array.
 * @param cursor The last row of the page.
 * @return Text safe in a URL.
 */
export function encodeOrderCursor(cursor: OrderCursor): string {
  return btoa(JSON.stringify([cursor.createdAt, cursor.id])).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '') // ASCII only, so btoa is safe.
}

/**
 * Decodes and checks a cursor.
 * @param text The cursor text.
 * @return The cursor, or null when it is not exactly what `encodeOrderCursor` makes.
 */
export function decodeOrderCursor(text: string): OrderCursor | null {
  if (text.length > MAX_CURSOR_CHARS || !BASE64URL.test(text)) return null // Bounded and in the alphabet.
  let parts: unknown // The parsed array.
  try { // Bad base64 or JSON throws.
    parts = JSON.parse(atob(text.replaceAll('-', '+').replaceAll('_', '/'))) // Text to value.
  } catch { // Not a cursor.
    return null // Refused.
  }
  if (!Array.isArray(parts) || parts.length !== 2) return null // Time and id.
  const [createdAt, id] = parts // The two parts.
  if (!isTime(createdAt) || typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) return null // A real time and a positive integer.
  return { createdAt, id } // Checked above.
}

/**
 * Parses the query of `GET /api/orders`.
 * @param url The request URL.
 * @return The checked query, or null when anything is invalid (the route answers 400).
 */
export function parseOrderQuery(url: URL): OrderQuery | null {
  const params = url.searchParams // The query string.
  const stepText = params.get('step') // Absent means all steps.
  const step = stepText === null ? null : (ORDER_STEPS.find((candidate) => candidate === stepText) ?? null) // Exact match.
  if (stepText !== null && step === null) return null // Unknown step.
  const numberText = params.get('number') // Absent means the list.
  const number = numberText === null ? null : parseOrderNumber(numberText) // Checked and upper-cased.
  if (numberText !== null && number === null) return null // Bad number.
  const cursorText = params.get('cursor') // Absent means the first page.
  const cursor = cursorText === null ? null : decodeOrderCursor(cursorText) // Checked.
  if (cursorText !== null && cursor === null) return null // Bad cursor.
  if (number !== null && (step !== null || cursor !== null)) return null // A lookup stands alone.
  return { step, number, cursor } // All checked.
}
