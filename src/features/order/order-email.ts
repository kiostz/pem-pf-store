// The stored sent order: the Worker's saved order plus the buyer's details from the form, kept for the confirmation page; the order email itself is written by the API Worker.

import type { OrderLine } from '@/features/cart/cart.ts' // the lines being ordered
import { clubText, oneLine, type OrderFormValues } from './order-form.ts' // the club's names and the one-line folding
import type { SavedOrder } from './send-order.ts' // what the Worker answers

// A buyer's contact details as one send carried them, one line each.
export type Contact = { name: string; email: string; phone: string }

// An order as sent: lines in cents with the buyer's details, kept for the confirmation.
export type SentOrder = {
  number: string // PF-YYYYMMDD-XXXX
  sentAt: string // ISO time the Worker saved it
  currency: string // ISO code from settings
  lines: Array<{
    itemId: string // which item
    name: string // as saved
    quantity: number // how many
    priceCents: number // one item's price in cents, as saved
  }> // one per item, at the saved price
  totalCents: number // the saved total
  contact: Contact | null // the buyer's contact; null when the sends behind this order carried different ones
  club: { subject: string; email: string } // the club's name, and the body text ("Other: " first when typed)
  changesNotSent: boolean // true when the order differs from what the buyer has now (lines, club or contact)
}

/**
 * Names a club from the Worker's stored text.
 * @param stored the stored club text, "Other: <name>" when typed
 * @return the name and the body text, the same shape clubText gives
 */
function clubFromStored(stored: string): SentOrder['club'] {
  const typed = stored.startsWith('Other: ') // flagged as typed by hand
  return { subject: typed ? stored.slice('Other: '.length) : stored, email: stored } // the name, and the whole text
}

/**
 * Builds the stored order from the Worker's answer and the form.
 * @param saved the Worker's saved order: number, time, lines and total
 * @param values the form
 * @return the order, with the Worker's prices and the buyer's fields on one line
 */
export function toSentOrder(saved: SavedOrder, values: OrderFormValues): SentOrder {
  const formClub = clubText({ ...values, otherClub: oneLine(values.otherClub) }) // the form's club names
  const club = saved.club === undefined ? { subject: formClub.subject, email: formClub.email } : clubFromStored(saved.club) // the Worker's club when it sent one
  return {
    number: saved.number, // the Worker's number
    sentAt: saved.createdAt, // when the Worker saved it
    currency: saved.currency, // as saved
    lines: saved.lines.map((line) => ({ ...line })), // the saved names and prices
    totalCents: saved.totalCents, // the saved total
    contact: formContact(values), // the buyer's fields on one line
    club, // names only, never the club's four detail fields
    changesNotSent: false, // this send is what the buyer has
  }
}

/**
 * Reads the contact from the form.
 * @param values the form
 * @return name, email and phone, each on one line
 */
export function formContact(values: OrderFormValues): Contact {
  return { name: oneLine(values.name), email: oneLine(values.email), phone: oneLine(values.phone) } // one line each
}

/**
 * Builds the stored order for an order an earlier send saved, which holds the Worker's lines and club, never this send's.
 * @param saved the Worker's saved order
 * @param contacts every distinct contact sent under the request id, in send order
 * @param values the form now
 * @param lines the cart lines this send would have ordered
 * @return the order; its contact is set only when every send carried the same one
 */
export function toEarlierSentOrder(saved: SavedOrder, contacts: Contact[], values: OrderFormValues, lines: OrderLine[]): SentOrder {
  const order = toSentOrder(saved, values) // the Worker's lines, total and club
  const contact = contacts.length === 1 ? contacts[0] : null // a contact the order may not hold is never shown
  const now = formContact(values) // what the buyer has typed now
  const sameLines =
    saved.lines.length === lines.length &&
    saved.lines.every((line) => lines.some((cartLine) => cartLine.honor.id === line.itemId && cartLine.quantity === line.quantity)) // the same items and quantities
  const formClub = clubText({ ...values, otherClub: oneLine(values.otherClub) }) // the club the form holds
  const sameClub = saved.club === undefined || saved.club === formClub.email // an absent club counts as the form's
  const sameContact = contact !== null && contact.name === now.name && contact.email === now.email && contact.phone === now.phone // the shown contact is the typed one
  return { ...order, contact, changesNotSent: !(sameLines && sameClub && sameContact) } // flagged when anything differs
}
