// Keeps the sent order in sessionStorage so the confirmation survives a reload in the same tab, and goes when the tab closes.

import type { SentOrder } from './sent-order.ts' // the stored shape

export const SENT_ORDER_STORAGE_KEY = 'pem-pf-store:sent-order' // repo name in the key: the site origin is shared by the account's other sites
const SENT_ORDER_VERSION = 3 // the stored format; versions 1 and 2 are still read

let heldOrder: SentOrder | null = null // the order of this tab when sessionStorage could not take it

/**
 * Tells whether a stored value is a whole contact or null.
 * @param value whatever the storage held under the contact
 * @return true for null, or for a name, email and phone that are all text
 */
function isContactOrNull(value: unknown): boolean {
  if (value === null) return true // the contact-free order
  if (typeof value !== 'object') return false // not a contact
  const contact = value as Record<string, unknown> // for reading parts
  return typeof contact.name === 'string' && typeof contact.email === 'string' && typeof contact.phone === 'string' // every part is text
}

/**
 * Tells whether a stored value is a whole order, so the confirmation page never reads a missing part.
 * @param value whatever the storage held under the order
 * @return true when every part of a SentOrder is there with the right kind of value
 */
function isSentOrder(value: unknown): value is SentOrder {
  if (typeof value !== 'object' || value === null) return false // not an order
  const order = value as Record<string, unknown> // for reading parts
  const club = order.club as Record<string, unknown> | null | undefined // the club part
  return (
    typeof order.number === 'string' && // the order number
    typeof order.sentAt === 'string' && // the send time
    !Number.isNaN(Date.parse(order.sentAt)) && // a time that can be shown
    typeof order.currency === 'string' && // the currency code
    typeof order.totalCents === 'number' && // the total
    Number.isFinite(order.totalCents) && // not NaN or infinite
    isContactOrNull(order.contact) && // the buyer's contact, or none
    typeof order.changesNotSent === 'boolean' && // whether the note shows
    typeof club === 'object' && // the club part exists
    club !== null && // and is not null
    typeof club.subject === 'string' && // the club's name
    typeof club.email === 'string' && // the club's text for the body
    Array.isArray(order.lines) && // the order lines
    order.lines.every((line: unknown) => {
      if (typeof line !== 'object' || line === null) return false // not an order line
      const orderLine = line as Record<string, unknown> // for reading parts
      return (
        typeof orderLine.itemId === 'string' && // which item
        typeof orderLine.name === 'string' && // its name
        typeof orderLine.quantity === 'number' && // how many
        Number.isFinite(orderLine.quantity) && // a real number
        typeof orderLine.priceCents === 'number' && // one item's price
        Number.isFinite(orderLine.priceCents) // a real number
      )
    }) // every order line whole
  )
}

/**
 * Lifts a version 1 order to version 2: its three flat fields become the contact, and no note shows.
 * @param value whatever a version 1 value held under the order
 * @return the lifted value, or the input when it is not an object
 */
function fromVersionOne(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value // left for the check to refuse
  const { name, email, phone, ...rest } = value as Record<string, unknown> // the flat contact fields
  return { ...rest, contact: { name, email, phone }, changesNotSent: false } // version 2 shape; a bad part fails the check
}

/**
 * Lifts a version 2 order to version 3: each line's honorId becomes itemId.
 * @param value whatever a version 2 value held under the order
 * @return the lifted value, or the input when it is not an order with a list of lines; a line holding neither field is left for the check to refuse
 */
function fromVersionTwo(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value // left for the check to refuse
  const order = value as Record<string, unknown> // for reading parts
  if (!Array.isArray(order.lines)) return value // left for the check to refuse
  return {
    ...order,
    lines: order.lines.map((line: unknown) => {
      if (typeof line !== 'object' || line === null || !('honorId' in line)) return line // left for the check to refuse
      const { honorId, ...rest } = line as Record<string, unknown> // the old field name
      return { ...rest, itemId: honorId } // version 3 shape; a bad id fails the check
    }), // every line lifted
  } // version 3 shape
}

/**
 * Reads the stored order.
 * @param storage where to read; the browser's sessionStorage by default
 * @return the order held in memory when a write was refused (it is the newest); else the stored one; null when there is none, or when the stored value is unusable (one warning then)
 */
export function readSentOrder(storage?: Storage): SentOrder | null {
  if (heldOrder !== null) return heldOrder // a refused write: this is the newest order, and anything stored is older
  let text: string | null // the stored text
  try {
    text = (storage ?? window.sessionStorage).getItem(SENT_ORDER_STORAGE_KEY) // blocked storage throws here
  } catch {
    console.warn('Sent order storage cannot be read.') // never the error text: it may hold stored content
    return null // nothing in memory either (checked first), so there is no order to show
  }
  if (text === null) return null // nothing stored and nothing in memory
  let parsed: unknown // whatever the text holds
  try {
    parsed = JSON.parse(text) // bad JSON throws
  } catch {
    console.warn('Stored sent order is not valid JSON.') // no content in the warning
    return null
  }
  const stored = parsed as { version?: unknown; order?: unknown } | null // the wrapper, its parts checked below
  const order =
    stored?.version === 1
      ? fromVersionTwo(fromVersionOne(stored.order)) // version 1 lifts through version 2
      : stored?.version === 2
        ? fromVersionTwo(stored.order) // a version 2 value is lifted to version 3
        : stored?.order // version 3 is read as written
  if (
    typeof parsed !== 'object' || // not an object
    stored === null || // JSON null
    (stored.version !== SENT_ORDER_VERSION && stored.version !== 2 && stored.version !== 1) || // another format
    !isSentOrder(order) // not a whole order
  ) {
    console.warn('Stored sent order has an unknown format.') // no content in the warning
    return null
  }
  return order // the order as written, now known to be whole
}

/**
 * Stores the order.
 * @param order the sent order
 * @param storage where to write; the browser's sessionStorage by default
 * @return nothing; a failing storage gives a warning, drops any older stored order, and the order stays in memory for this tab, because it was already sent and must not look failed
 */
export function writeSentOrder(order: SentOrder, storage?: Storage): void {
  try {
    ;(storage ?? window.sessionStorage).setItem(
      SENT_ORDER_STORAGE_KEY,
      JSON.stringify({ version: SENT_ORDER_VERSION, order }), // the versioned format
    ) // blocked or full storage throws
    heldOrder = null // storage has it now
  } catch {
    heldOrder = order // this tab still shows it
    try {
      ;(storage ?? window.sessionStorage).removeItem(SENT_ORDER_STORAGE_KEY) // an older stored order must not come back after a reload
    } catch {
      // the warning below already reports that storage is failing; if the removal fails too, a reload can still show the older stored order
    }
    console.warn(
      `Sent order ${order.number} cannot be kept for the confirmation page.`,
    ) // the number only
  }
}
