// The stored sent order: the Worker's saved order plus the buyer's details from the form, kept for the confirmation page; the order email itself is written by the API Worker.

import { clubText, oneLine, type OrderFormValues } from './order-form.ts' // the club's names and the one-line folding
import type { SavedOrder } from './send-order.ts' // what the Worker answers

// An order as sent: lines in cents with the buyer's details, kept for the confirmation.
export type SentOrder = {
  number: string // PF-YYYYMMDD-XXXX
  sentAt: string // ISO time the Worker saved it
  currency: string // ISO code from settings
  lines: Array<{
    honorId: string // which honor
    name: string // as saved
    quantity: number // how many
    priceCents: number // one honor's price in cents, as saved
  }> // one per honor, at the saved price
  totalCents: number // the saved total
  name: string // the buyer's name
  email: string // the buyer's email
  phone: string // the buyer's phone
  club: { subject: string; email: string } // the club's name, and the body text ("Other: " first when typed)
}

/**
 * Builds the stored order from the Worker's answer and the form.
 * @param saved the Worker's saved order: number, time, lines and total
 * @param values the form
 * @return the order, with the Worker's prices and the buyer's fields on one line
 */
export function toSentOrder(saved: SavedOrder, values: OrderFormValues): SentOrder {
  const club = clubText({ ...values, otherClub: oneLine(values.otherClub) }) // the club's names
  return {
    number: saved.number, // the Worker's number
    sentAt: saved.createdAt, // when the Worker saved it
    currency: saved.currency, // as saved
    lines: saved.lines.map((line) => ({ ...line })), // the saved names and prices
    totalCents: saved.totalCents, // the saved total
    name: oneLine(values.name), // one line
    email: oneLine(values.email), // one line
    phone: oneLine(values.phone), // one line
    club: { subject: club.subject, email: club.email }, // names only, never the club's four detail fields
  }
}
