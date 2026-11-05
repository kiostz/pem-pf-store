// Parses the item list's query string and its cursor where they enter: a closed set of sorts and categories, bounded text, nothing else.

import { CATEGORIES } from './categories' // The category list.
import { isItemId } from './item-id' // The item id check.
import { hasControlCharacter, isCleanText } from './validate-text' // Text rules.

// The three sorts: Recently changed, Newest and Name A-Z.
export const ITEM_SORTS = ['changed', 'newest', 'name'] as const
// One of the sorts.
export type ItemSort = (typeof ITEM_SORTS)[number]

// Where a page continues: the last row's time (not for the name sort), name and id.
export interface ItemCursor {
  time?: string // ISO time of the last row under `changed` or `newest`.
  name: string // Name of the last row.
  id: string // Id of the last row.
}

// A checked item list query.
export interface ItemQuery {
  sort: ItemSort // The order.
  words: string[] // Lower-case search words, all of which must match.
  category: string | null // One of CATEGORIES, or no filter.
  cursor: ItemCursor | null // Where the page starts, or the first page.
}

// Most characters in the search text, most words in it, most characters in a cursor (room for a 100-character name of 4-byte characters or of quotes that JSON doubles).
const MAX_SEARCH_CHARS = 100
const MAX_SEARCH_WORDS = 5
const MAX_CURSOR_CHARS = 1024
// ISO UTC time with milliseconds.
const TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
// base64url alphabet.
const BASE64URL = /^[A-Za-z0-9_-]+$/

/**
 * Tells whether text is an ISO UTC time with milliseconds that is a real date.
 * @param value Anything.
 * @return True for a time such as 2026-11-01T00:00:00.000Z.
 */
function isTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value // Pattern, and no 30 February.
}

/**
 * Encodes a cursor as base64url of a JSON array.
 * @param sort The sort the cursor belongs to.
 * @param cursor The last row of the page.
 * @return Text safe in a URL.
 */
export function encodeCursor(sort: ItemSort, cursor: ItemCursor): string {
  const parts = sort === 'name' ? [sort, cursor.name, cursor.id] : [sort, cursor.time, cursor.name, cursor.id] // Name sort has no time.
  const bytes = new TextEncoder().encode(JSON.stringify(parts)) // UTF-8, so any name survives btoa.
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '') // URL-safe, unpadded.
}

/**
 * Decodes and checks a cursor for one sort.
 * @param sort The request's sort; the cursor must name the same one.
 * @param text The cursor text.
 * @return The cursor, or null when it is not exactly what `encodeCursor` makes.
 */
export function decodeCursor(sort: ItemSort, text: string): ItemCursor | null {
  if (text.length > MAX_CURSOR_CHARS || !BASE64URL.test(text)) return null // Bounded and in the alphabet.
  let parts: unknown // The parsed array.
  try { // Bad base64 or JSON throws.
    const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/')) // Back to bytes.
    parts = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))) // Bytes to value.
  } catch { // Not a cursor.
    return null
  }
  if (!Array.isArray(parts) || parts[0] !== sort) return null // Another sort's cursor.
  const [, ...rest] = parts // Everything after the sort.
  const time = sort === 'name' ? undefined : rest.shift() // Time first, for the two time sorts.
  if (rest.length !== 2) return null // Name and id remain.
  const [name, id] = rest // The last two.
  if (sort !== 'name' && !isTime(time)) return null // A time with milliseconds.
  if (!isCleanText(name, 1, 200) || !isItemId(id)) return null // A clean name and a slug.
  return time === undefined ? { name, id } : { time: time as string, name, id } // Checked above.
}

/**
 * Splits and checks the search text.
 * @param text The `q` value.
 * @return Lower-case words (ASCII folding only, as SQLite's lower()), or null when invalid.
 */
function parseSearch(text: string): string[] | null {
  if (text.length > MAX_SEARCH_CHARS || hasControlCharacter(text)) return null // Bounded and clean.
  const words = text.split(/\s+/).filter((word) => word !== '') // Blank runs vanish.
  if (words.length > MAX_SEARCH_WORDS) return null // At most 5 words.
  return words.map((word) => word.replace(/[A-Z]/g, (letter) => letter.toLowerCase())) // ASCII only: the database folds nothing else.
}

/**
 * Parses the query of `GET /api/items`.
 * @param url The request URL.
 * @return The checked query, or null when anything is invalid (the route answers 400).
 */
export function parseItemQuery(url: URL): ItemQuery | null {
  const params = url.searchParams // The query string.
  const sortText = params.get('sort') ?? 'changed' // Recently changed by default.
  const sort = ITEM_SORTS.find((candidate) => candidate === sortText) // Exact match.
  if (sort === undefined) return null // Unknown sort.
  const words = parseSearch(params.get('q') ?? '') // The search.
  if (words === null) return null // Bad search.
  const categoryText = params.get('category') // Absent means all.
  if (categoryText !== null && !CATEGORIES.includes(categoryText)) return null // Exact, case-sensitive.
  const cursorText = params.get('cursor') // Absent means the first page.
  const cursor = cursorText === null ? null : decodeCursor(sort, cursorText) // Checked for this sort.
  if (cursorText !== null && cursor === null) return null // Bad cursor.
  return { sort, words, category: categoryText, cursor } // All checked.
}
