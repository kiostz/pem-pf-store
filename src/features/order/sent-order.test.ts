// Tests for the stored sent order: built from the Worker's saved order plus the form, with the Worker's prices and one-line buyer fields.

import { describe, expect, it } from 'vitest' // test API
import type { OrderLine } from '@/features/cart/cart.ts' // an order line
import { toEarlierSentOrder, toSentOrder } from './sent-order.ts' // code under test
import { EMPTY_ORDER_FORM, type OrderFormValues } from './order-form.ts' // the form values
import type { SavedOrder } from './send-order.ts' // what the Worker answers

const saved: SavedOrder = {
  number: 'PF-20261102-4K7Q',
  createdAt: '2026-11-01T17:00:00.000Z',
  currency: 'MYR',
  totalCents: 1200,
  club: 'Eagles',
  lines: [
    { itemId: 'knot-tying', name: 'Knot Tying', quantity: 3, priceCents: 300 },
    { itemId: 'birds', name: 'Birds', quantity: 1, priceCents: 300 },
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
      contact: { name: 'J. Cruz', email: 'jc@mail.com', phone: '+60 12-345 6789' },
      club: { subject: 'Eagles', email: 'Eagles' },
      changesNotSent: false,
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
    const noClub = { ...saved, club: undefined } // an answer without a club, so the form's club is used
    const order = toSentOrder(noClub, { ...values, name: 'J.\r\nCruz', phone: '+60\t12', club: 'other', otherClub: 'Hill\ntop' })
    expect(order.contact?.name).toBe('J. Cruz')
    expect(order.contact?.phone).toBe('+60 12')
    expect(order.club).toEqual({ subject: 'Hill top', email: 'Other: Hill top' })
  })

  it('collapses the Unicode line and paragraph separators to spaces', () => {
    // catches: a name with U+2028 or U+2029 drawn as a forged extra line
    expect(toSentOrder(saved, { ...values, name: 'Jo Phone: 000 x' }).contact?.name).toBe('Jo Phone: 000 x')
  })
})

describe('toSentOrder club', () => {
  it("takes the club from the Worker's answer when it has one", () => {
    // catches: a confirmation showing the form's club when the Worker saved another
    expect(toSentOrder({ ...saved, club: 'Other: Hill top' }, values).club).toEqual({ subject: 'Hill top', email: 'Other: Hill top' })
  })

  it("uses the form's club when the answer has none (an older Worker)", () => {
    // catches: a missing club field breaking the confirmation during a deploy
    const older = { ...saved, club: undefined } // an older Worker's answer
    expect(toSentOrder(older, values).club).toEqual({ subject: 'Eagles', email: 'Eagles' })
  })
})

describe('toEarlierSentOrder', () => {
  const item = { id: 'knot-tying', name: 'Knot Tying', category: 'Nature', stock: 10, price: 3, image: null } as const // one item
  const birds = { ...item, id: 'birds', name: 'Birds' } as const // another
  const cart: OrderLine[] = [
    { item, quantity: 3 }, // an order line of the first item
    { item: birds, quantity: 1 }, // an order line of the second item
  ] // the cart as the saved order has it
  const contact = { name: 'J. Cruz', email: 'jc@mail.com', phone: '+60 12-345 6789' } // what was sent

  it('uses the Worker lines, total and club, and the contact every send carried', () => {
    // catches: the earlier order shown with the changed form's lines or club
    const order = toEarlierSentOrder({ ...saved, club: 'Sunway' }, [contact], { ...values, club: 'Gilead' }, [{ item, quantity: 1 }]) // an earlier order over one line of the first item
    expect(order).toMatchObject({ number: 'PF-20261102-4K7Q', totalCents: 1200, lines: saved.lines, club: { subject: 'Sunway', email: 'Sunway' }, contact })
  })

  it('shows no contact when the sends carried different ones', () => {
    // catches: a phone number printed that the saved order may not hold
    const order = toEarlierSentOrder(saved, [contact, { ...contact, phone: '+60 11 000 0000' }], values, cart)
    expect(order.contact).toBeNull()
  })

  it('shows no contact when none is known', () => {
    // catches: a crash or an empty contact for an empty list
    expect(toEarlierSentOrder(saved, [], values, cart).contact).toBeNull()
  })

  it('says changes were not sent when the club differs', () => {
    // catches: a missing note after the buyer picked another club
    expect(toEarlierSentOrder(saved, [contact], { ...values, club: 'Gilead' }, cart).changesNotSent).toBe(true)
  })

  it('says changes were not sent when the lines differ', () => {
    // catches: a missing note after the cart was changed
    expect(toEarlierSentOrder(saved, [contact], values, [{ item, quantity: 2 }, { item: birds, quantity: 1 }]).changesNotSent).toBe(true) // the lines of the first item and the second item
  })

  it('says changes were not sent when the form holds a contact other than the shown one', () => {
    // catches: the page showing the earlier phone as if it were the buyer's current one, without the note
    expect(toEarlierSentOrder(saved, [contact], { ...values, ...contact, phone: '+60 11 000 0000' }, cart).changesNotSent).toBe(true)
  })

  it('says changes were not sent when no contact can be shown', () => {
    // catches: a contact-free page without the note
    expect(toEarlierSentOrder(saved, [contact, { ...contact, phone: '1' }], { ...values, ...contact }, cart).changesNotSent).toBe(true)
  })

  it('says nothing was lost when lines, club and contact are all equal', () => {
    // catches: the note shown for an order that is exactly what the buyer has
    expect(toEarlierSentOrder(saved, [contact], { ...values, ...contact }, cart).changesNotSent).toBe(false)
  })

  it("uses the form's club when the answer has none and does not count it as a change", () => {
    // catches: an older Worker's answer always flagged as changed
    const older = { ...saved, club: undefined } // an older Worker's answer
    const order = toEarlierSentOrder(older, [contact], { ...values, ...contact }, cart)
    expect(order.club).toEqual({ subject: 'Eagles', email: 'Eagles' })
    expect(order.changesNotSent).toBe(false)
  })
})
