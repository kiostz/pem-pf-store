// Sends an order to the API Worker and says how it failed: the Worker checks the captcha and stock, saves the order and answers with its number, names and prices.

import type { OrderLine } from '@/features/cart/cart.ts' // the lines being ordered
import { OTHER_CLUB, oneLine, type OrderFormValues } from './order-form.ts' // the form's values and the one-line folding

const TIMEOUT_MS = 20_000 // a send that takes longer counts as failed
const LOOKUP_TIMEOUT_MS = 10_000 // a lookup that takes longer counts as failed

// What the shop sends: ids and quantities only, since the Worker sets names and prices.
export type OrderRequest = {
  requestId: string // a UUID kept for retries of the same cart and form
  turnstileToken: string // the solved captcha's token, single use
  name: string // the buyer's name, one line
  email: string // the buyer's email, one line
  phone: string // the buyer's phone, one line
  club: { name: string; typed: boolean } // the club's name, and whether the buyer typed it by hand
  lines: Array<{ honorId: string; quantity: number }> // which items and how many
}

// The saved order the Worker answers with: no buyer fields, prices as saved.
export type SavedOrder = {
  number: string // PF-YYYYMMDD-XXXX, from the Worker
  createdAt: string // ISO time the Worker saved it
  currency: string // ISO code
  totalCents: number // the saved total
  club?: string // the stored club text, "Other: <name>" when typed; absent from an older Worker's answer
  lines: Array<{ honorId: string; name: string; quantity: number; priceCents: number }> // names and prices as saved
}

// Whose body the saved order holds: the one just sent, or an earlier send under the same request id.
export type Kept = 'this-send' | 'earlier-send'

// How a send failed: no connection, too slow, too many orders, a failed captcha, or refused for another reason.
export type OrderSendKind = 'network' | 'timeout' | 'rate-limited' | 'captcha' | 'rejected'

// The error a failed send throws; its message carries no buyer data.
export class OrderSendError extends Error {
  readonly kind: OrderSendKind // what went wrong

  /**
   * @param kind what went wrong
   */
  constructor(kind: OrderSendKind) {
    super(`Order send failed: ${kind}`) // kind only
    this.name = 'OrderSendError' // for logs and tests
    this.kind = kind // what the form words its message from
  }
}

// The error thrown when the Worker refuses the order because lines are short of stock or not for sale.
export class OrderStockError extends Error {
  readonly lines: Array<{ honorId: string; stock: number | null }> // every line the Worker could not fill; null stock means not for sale

  /**
   * @param lines every line the Worker could not fill
   */
  constructor(lines: Array<{ honorId: string; stock: number | null }>) {
    super(`Order refused: ${lines.length} line(s) short of stock`) // a count only
    this.name = 'OrderStockError' // for logs and tests
    this.lines = lines // what the cart marks
  }
}

/**
 * Names why a fetch threw.
 * @param error what fetch threw
 * @return timeout when the timeout signal fired, network otherwise
 */
function failureKind(error: unknown): OrderSendKind {
  const timedOut = // the timeout signal fired
    error instanceof DOMException && // an abort is a DOMException
    (error.name === 'TimeoutError' || error.name === 'AbortError') // by either name
  return timedOut ? 'timeout' : 'network' // no connection, or too slow
}

/**
 * Builds the request body from the cart's lines and the form.
 * @param requestId the UUID for this cart and form
 * @param turnstileToken the solved captcha's token
 * @param lines the order lines
 * @param values the form
 * @return the request, with the buyer's fields folded to one line
 */
export function toOrderRequest(
  requestId: string,
  turnstileToken: string,
  lines: OrderLine[],
  values: OrderFormValues,
): OrderRequest {
  const typed = values.club === OTHER_CLUB // the club was typed by hand
  return {
    requestId, // for repeat protection
    turnstileToken, // for the Worker's captcha check
    name: oneLine(values.name), // one line
    email: oneLine(values.email), // one line
    phone: oneLine(values.phone), // one line
    club: { name: typed ? oneLine(values.otherClub) : values.club, typed }, // the name, and how it was chosen
    lines: lines.map((line) => ({ honorId: line.honor.id, quantity: line.quantity })), // ids and quantities only
  }
}

/**
 * Checks a value is a whole number of at least a minimum.
 * @param value the value
 * @param min the smallest allowed
 * @return true for such a number
 */
const isWhole = (value: unknown, min: number): value is number => Number.isInteger(value) && (value as number) >= min

/**
 * Checks the Worker's saved order has the shape the confirmation needs.
 * @param body the parsed JSON
 * @param clubRequired whether a missing club makes the order malformed
 * @return the saved order, or null when it is malformed
 */
function parseSavedOrder(body: unknown, clubRequired: boolean): SavedOrder | null {
  if (typeof body !== 'object' || body === null) return null // not an object
  const order = body as Record<string, unknown> // its fields, unchecked
  if (typeof order.number !== 'string' || order.number === '') return null // the number
  if (typeof order.createdAt !== 'string' || typeof order.currency !== 'string') return null // time and currency
  if (!isWhole(order.totalCents, 0) || !Array.isArray(order.lines)) return null // total and lines
  if (order.club !== undefined && typeof order.club !== 'string') return null // a club that is not text
  if (clubRequired && order.club === undefined) return null // the lookup always carries it
  const lines: SavedOrder['lines'] = [] // the checked lines
  for (const raw of order.lines as unknown[]) {
    const line = raw as Record<string, unknown> | null // one line, unchecked
    if (typeof line !== 'object' || line === null) return null // not an object
    if (typeof line.honorId !== 'string' || typeof line.name !== 'string') return null // which item
    if (!isWhole(line.quantity, 1) || !isWhole(line.priceCents, 0)) return null // how many, at what price
    lines.push({ honorId: line.honorId, name: line.name, quantity: line.quantity, priceCents: line.priceCents }) // kept
  }
  const saved: SavedOrder = { number: order.number, createdAt: order.createdAt, currency: order.currency, totalCents: order.totalCents, lines } // the order
  if (typeof order.club === 'string') saved.club = order.club // kept only when sent
  return saved // the order
}

/**
 * Checks the Worker's stock refusal has the shape the cart needs.
 * @param body the parsed JSON
 * @return the short lines, or null when it is malformed
 */
function parseStockLines(body: unknown): OrderStockError['lines'] | null {
  const lines = (body as { error?: unknown; lines?: unknown } | null)?.lines // the short lines, unchecked
  if ((body as { error?: unknown } | null)?.error !== 'stock' || !Array.isArray(lines)) return null // not a stock refusal
  const checked: OrderStockError['lines'] = [] // the checked lines
  for (const raw of lines as unknown[]) {
    const line = raw as Record<string, unknown> | null // one line, unchecked
    if (typeof line !== 'object' || line === null || typeof line.honorId !== 'string') return null // which item
    if (line.stock !== null && !isWhole(line.stock, 0)) return null // units left, or null
    checked.push({ honorId: line.honorId, stock: line.stock as number | null }) // kept
  }
  return checked // every short line
}

/**
 * Sends the order to the Worker.
 * @param input the request
 * @param fetchFn the fetch to use; the browser's by default
 * @return the saved order, and whether it holds this send (201) or an earlier send of the same request id (200)
 * @throws OrderStockError when the Worker refuses lines for stock
 * @throws OrderSendError for every other failure
 */
export async function sendOrder(input: OrderRequest, fetchFn: typeof fetch = fetch): Promise<{ order: SavedOrder; kept: Kept }> {
  const signal = AbortSignal.timeout(TIMEOUT_MS) // never wait forever
  let response: Response // the Worker's answer
  try {
    response = await fetchFn(`${import.meta.env.VITE_API_URL}/orders`, {
      method: 'POST', // a submission
      headers: {
        'Content-Type': 'application/json', // the body is JSON
        Accept: 'application/json', // and so is the answer
      }, // JSON in and out
      body: JSON.stringify(input), // the request
      signal, // the timeout
    })
  } catch (error) {
    throw new OrderSendError(failureKind(error)) // no connection, or too slow
  }
  if (response.status === 429) throw new OrderSendError('rate-limited') // the Worker asks to wait
  let body: unknown // the JSON answer, if it is JSON
  try {
    body = await response.json() // a 500 page may not be JSON
  } catch {
    throw new OrderSendError('rejected') // not an answer we can trust
  }
  if (response.status === 201 || response.status === 200) {
    const saved = parseSavedOrder(body, false) // the order, if well formed
    if (saved === null) throw new OrderSendError('rejected') // a body the confirmation cannot use
    const byStatus: Kept = response.status === 201 ? 'this-send' : 'earlier-send' // what the status says
    const sent = (body as { kept?: unknown }).kept // what the Worker says, if it says
    if (sent !== undefined && sent !== byStatus) throw new OrderSendError('rejected') // unknown, or contradicting the status
    return { order: saved, kept: byStatus } // saved or repeated
  }
  if (response.status === 409) {
    const lines = parseStockLines(body) // the short lines, if well formed
    if (lines === null) throw new OrderSendError('rejected') // a refusal the cart cannot use
    throw new OrderStockError(lines) // the cart marks them
  }
  if (response.status === 403 && (body as { error?: unknown } | null)?.error === 'captcha')
    throw new OrderSendError('captcha') // the check did not pass
  throw new OrderSendError('rejected') // 400, 500, 503 and the rest
}

/**
 * Asks the Worker whether an order was saved under a request id; needs no captcha and returns no buyer fields.
 * @param requestId the kept request id
 * @param fetchFn the fetch to use; the browser's by default
 * @return the saved order, or null when none was saved under that id
 * @throws OrderSendError of kind network, timeout or rejected
 */
export async function lookupOrder(requestId: string, fetchFn: typeof fetch = fetch): Promise<SavedOrder | null> {
  let response: Response // the Worker's answer
  try {
    response = await fetchFn(`${import.meta.env.VITE_API_URL}/orders/status/${requestId}`, {
      headers: { Accept: 'application/json' }, // a plain read, no body
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS), // never wait forever
    })
  } catch (error) {
    throw new OrderSendError(failureKind(error)) // no connection, or too slow
  }
  if (response.status !== 200) throw new OrderSendError('rejected') // a missing route, an error or a limit
  let body: unknown // the JSON answer
  try {
    body = await response.json() // may not be JSON
  } catch {
    throw new OrderSendError('rejected') // not an answer we can trust
  }
  const found = (body as { found?: unknown } | null)?.found // whether an order exists
  if (found === false) return null // nothing saved under this id
  if (found !== true) throw new OrderSendError('rejected') // not the shape we know
  const order = parseSavedOrder((body as { order?: unknown }).order, true) // the order, with its club
  if (order === null) throw new OrderSendError('rejected') // a body the confirmation cannot use
  return order // the saved order
}
