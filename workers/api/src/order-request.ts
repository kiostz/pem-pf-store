// Validates the body of POST /orders where it enters the Worker, mirroring the shop's order form rules, so bad input is refused and good input is cleaned before it is stored.

import type { OrderRequest } from './api-types'

const NAME_MAX = 100 // Longest name or club name.
const EMAIL_MAX = 254 // Longest email address.
const TOKEN_MAX = 2048 // Longest Turnstile token.
const LINES_MAX = 500 // Most order lines.
const QUANTITY_MAX = 99 // Largest quantity per line.
const HONOR_ID_MAX = 200 // Longest item id.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i // A request id.

/**
 * Folds control characters and line separators to one space, so a field cannot add lines to the email.
 * @param text The typed text.
 * @return The text with each run of control characters as one space, trimmed.
 */
function oneLine(text: string): string {
  return text.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').trim() // Controls include \r and \n.
}

/**
 * Reads one text field and cleans it to one line.
 * @param value Any JSON value.
 * @return The one-line text, or null when it is not a string.
 */
function text(value: unknown): string | null {
  return typeof value === 'string' ? oneLine(value) : null // Only strings.
}

/**
 * Checks and cleans an order request.
 * @param body The parsed JSON body, of unknown shape.
 * @return The request, or null when anything is wrong; extra keys are dropped.
 */
export function parseOrderRequest(body: unknown): OrderRequest | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null // Must be an object.
  const b = body as Record<string, unknown> // Field access.
  const requestId = typeof b.requestId === 'string' ? b.requestId : null // A UUID string.
  if (requestId === null || !UUID.test(requestId)) return null // Not a UUID.
  const token = typeof b.turnstileToken === 'string' ? b.turnstileToken : null // The captcha token.
  if (token === null || token.length < 1 || token.length > TOKEN_MAX) return null // 1-2,048 characters.
  const name = text(b.name) // The buyer.
  if (name === null || name.length < 1 || name.length > NAME_MAX) return null // 1-100.
  const email = text(b.email) // The buyer's address.
  if (email === null || email.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null // Something@something.something.
  const phoneText = text(b.phone) // The buyer's number as typed.
  if (phoneText === null || !/^\d{7,15}$/.test(phoneText.replace(/^\+/, '').replace(/[\s\-()]/g, ''))) return null // 7-15 digits.
  const club = b.club // The club object.
  if (typeof club !== 'object' || club === null) return null // Must be an object.
  const clubName = text((club as Record<string, unknown>).name) // Its name.
  const typed = (club as Record<string, unknown>).typed // Typed by hand?
  if (clubName === null || clubName.length < 1 || clubName.length > NAME_MAX || typeof typed !== 'boolean') return null // 1-100 and a flag.
  if (!Array.isArray(b.lines) || b.lines.length < 1 || b.lines.length > LINES_MAX) return null // 1-500 lines.
  const seen = new Set<string>() // Ids already used.
  const lines: OrderRequest['lines'] = [] // The clean lines.
  for (const line of b.lines as unknown[]) {
    if (typeof line !== 'object' || line === null) return null // Each line an object.
    const { honorId, quantity } = line as Record<string, unknown> // The two fields.
    if (typeof honorId !== 'string' || honorId.length < 1 || honorId.length > HONOR_ID_MAX || seen.has(honorId)) return null // Present and unique.
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > QUANTITY_MAX) return null // Whole 1-99.
    seen.add(honorId) // Remember it.
    lines.push({ honorId, quantity }) // Keep only these two keys.
  }
  return { requestId: requestId.toLowerCase(), turnstileToken: token, name, email, phone: phoneText, club: { name: clubName, typed }, lines } // Clean request.
}
