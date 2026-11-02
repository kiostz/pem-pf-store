// Tests for the stored sent order: built from the Worker's saved order plus the form, with the Worker's prices and one-line buyer fields.

import { describe, expect, it } from 'vitest' // test API
import { toSentOrder } from './order-email.ts' // code under test
import { EMPTY_ORDER_FORM, type OrderFormValues } from './order-form.ts' // the form values
import type { SavedOrder } from './send-order.ts' // what the Worker answers

const saved: SavedOrder = {
  number: 'PF-20261102-4K7Q',
  createdAt: '2026-11-01T17:00:00.000Z',
  currency: 'MYR',
  totalCents: 1200,
  lines: [
    { honorId: 'knot-tying', name: 'Knot Tying', quantity: 3, priceCents: 300 },
    { honorId: 'birds', name: 'Birds', quantity: 1, priceCents: 300 },
  ],
} // the Worker's answer, RM 12.00

const values: OrderFormValues = {
  ...EMPTY_ORDER_FORM,
  name: 'J. Cruz',
  email: 'jc@mail.com',
  phone: '+60 12-345 6789',
  club: 'Eagles',
} // a listed club

describe('toSentOrder', () => {
  it('takes the number, time, lines and total from the Worker and the buyer from the form', () => {
    // catches: the shop's own prices or number winning over the saved ones, or the club fields leaking in
    expect(toSentOrder(saved, values)).toEqual({
      number: 'PF-20261102-4K7Q',
      sentAt: '2026-11-01T17:00:00.000Z',
      currency: 'MYR',
      lines: saved.lines,
      totalCents: 1200,
      name: 'J. Cruz',
      email: 'jc@mail.com',
      phone: '+60 12-345 6789',
      club: { subject: 'Eagles', email: 'Eagles' },
    })
  })

  it('shows the Worker prices even when they differ from what the shop had', () => {
    // catches: a confirmation recomputed from the shop's catalogue after a price edit
    const edited: SavedOrder = { ...saved, totalCents: 450, lines: [{ ...saved.lines[0], quantity: 1, priceCents: 450 }] }
    const order = toSentOrder(edited, values)
    expect(order.lines).toEqual(edited.lines)
    expect(order.totalCents).toBe(450)
  })

  it('collapses line breaks and control characters in typed text to spaces', () => {
    // catches: a name with a newline breaking the one-line fields the confirmation prints
    const order = toSentOrder(saved, { ...values, name: 'J.\r\nCruz', phone: '+60\t12', club: 'other', otherClub: 'Hill\ntop' })
    expect(order.name).toBe('J. Cruz')
    expect(order.phone).toBe('+60 12')
    expect(order.club).toEqual({ subject: 'Hill top', email: 'Other: Hill top' })
  })

  it('collapses the Unicode line and paragraph separators to spaces', () => {
    // catches: a name with U+2028 or U+2029 drawn as a forged extra line
    expect(toSentOrder(saved, { ...values, name: 'Jo Phone: 000 x' }).name).toBe('Jo Phone: 000 x')
  })
})
