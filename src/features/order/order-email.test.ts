// Tests for the order's snapshot and its email: the subject, the text per line, Other, collapsed line breaks and money in cents.

import { describe, expect, it } from 'vitest' // test API
import type { OrderLine } from '@/features/cart/cart.ts' // an order line
import type { Honor } from '@/shared/data/types.ts' // the honor shape
import {
  orderEmailSubject,
  orderEmailText,
  toSentOrder,
} from './order-email.ts' // code under test
import { EMPTY_ORDER_FORM, type OrderFormValues } from './order-form.ts' // the form values

/**
 * Builds an order line.
 * @param id the honor id
 * @param name the honor name
 * @param price the honor price
 * @param quantity the quantity
 * @return the order line
 */
function line(
  id: string,
  name: string,
  price: number,
  quantity: number,
): OrderLine {
  const honor: Honor = {
    id,
    name,
    category: 'Nature',
    stock: 10,
    price,
    image: null,
  }
  return { honor, quantity } // one honor and its quantity
}

const values: OrderFormValues = {
  ...EMPTY_ORDER_FORM,
  name: 'J. Cruz',
  email: 'jc@mail.com',
  phone: '+60 12-345 6789',
  club: 'Eagles',
} // a listed club
const now = new Date('2026-10-28T10:00:00Z') // a fixed moment
const twoLines = [
  line('knot-tying', 'Knot Tying', 3, 3),
  line('birds', 'Birds', 3, 1),
] // RM 9.00 and RM 3.00

describe('toSentOrder', () => {
  it('snapshots the lines in cents with the total, the time and the club texts', () => {
    // catches: prices kept as floats, a total that is not the sum of the lines, or the club fields leaking in
    const order = toSentOrder('PF-20261028-4K7Q', twoLines, values, 'MYR', now)
    expect(order).toEqual({
      number: 'PF-20261028-4K7Q',
      sentAt: '2026-10-28T10:00:00.000Z',
      currency: 'MYR',
      lines: [
        {
          honorId: 'knot-tying',
          name: 'Knot Tying',
          quantity: 3,
          priceCents: 300,
        },
        { honorId: 'birds', name: 'Birds', quantity: 1, priceCents: 300 },
      ],
      totalCents: 1200,
      name: 'J. Cruz',
      email: 'jc@mail.com',
      phone: '+60 12-345 6789',
      club: { subject: 'Eagles', email: 'Eagles' },
    })
  })

  it('collapses line breaks and control characters in typed text to spaces', () => {
    // catches: a name with a newline breaking the subject or adding fake lines to the email body
    const order = toSentOrder(
      'PF-20261028-4K7Q',
      twoLines,
      {
        ...values,
        name: 'J.\r\nCruz',
        phone: '+60\t12',
        club: 'other',
        otherClub: 'Hill\ntop',
      },
      'MYR',
      now,
    )
    expect(order.name).toBe('J. Cruz')
    expect(order.phone).toBe('+60 12')
    expect(order.club).toEqual({
      subject: 'Hill top',
      email: 'Other: Hill top',
    })
  })

  it('collapses the Unicode line and paragraph separators to spaces', () => {
    // catches: a name with U+2028 or U+2029 that some mail clients draw as a forged extra line
    const order = toSentOrder(
      'PF-20261028-4K7Q',
      twoLines,
      { ...values, name: 'Jo\u2028Phone: 000\u2029x' },
      'MYR',
      now,
    )
    expect(order.name).toBe('Jo Phone: 000 x')
  })

  it('keeps 3 x RM 1.15 exact in cents', () => {
    // catches: 1.15 * 3 drifting to 3.4499999999999997
    const order = toSentOrder(
      'PF-20261028-4K7Q',
      [line('ants', 'Ants', 1.15, 3)],
      values,
      'MYR',
      now,
    )
    expect(order.lines[0].priceCents).toBe(115)
    expect(order.totalCents).toBe(345)
  })
})

describe('orderEmailSubject', () => {
  it('reads PEM Pathfinder Store order, number, club and name', () => {
    // catches: a subject that differs from the one the order handler's filters expect
    const order = toSentOrder('PF-20261028-4K7Q', twoLines, values, 'MYR', now)
    expect(orderEmailSubject(order)).toBe(
      'PEM Pathfinder Store order PF-20261028-4K7Q — Eagles — J. Cruz',
    )
  })

  it('carries a typed club by its name alone', () => {
    // catches: "Other:" in the subject
    const order = toSentOrder(
      'PF-20261028-4K7Q',
      twoLines,
      { ...values, club: 'other', otherClub: 'Hilltop Club' },
      'MYR',
      now,
    )
    expect(orderEmailSubject(order)).toBe(
      'PEM Pathfinder Store order PF-20261028-4K7Q — Hilltop Club — J. Cruz',
    )
  })
})

describe('orderEmailText', () => {
  it('writes the header, one line per honor and the estimated total', () => {
    // catches: columns instead of one readable line, a wrong sum or a missing currency
    const order = toSentOrder('PF-20261028-4K7Q', twoLines, values, 'MYR', now)
    expect(orderEmailText(order)).toBe(
      [
        'Order: PF-20261028-4K7Q',
        'Name:  J. Cruz',
        'Email: jc@mail.com',
        'Phone: +60 12-345 6789',
        'Club:  Eagles',
        '',
        '3 × Knot Tying @ RM 3.00 = RM 9.00',
        '1 × Birds @ RM 3.00 = RM 3.00',
        '',
        'Estimated total: RM 12.00',
      ].join('\n'),
    )
  })

  it('flags a typed club with Other in the body', () => {
    // catches: the handler not knowing the club was typed by hand
    const order = toSentOrder(
      'PF-20261028-4K7Q',
      twoLines,
      { ...values, club: 'other', otherClub: 'Hilltop Club' },
      'MYR',
      now,
    )
    expect(orderEmailText(order)).toContain('Club:  Other: Hilltop Club')
  })

  it('shows 3 x RM 1.15 as RM 3.45', () => {
    // catches: float rounding showing RM 3.45 as RM 3.44 or RM 3.50
    const order = toSentOrder(
      'PF-20261028-4K7Q',
      [line('ants', 'Ants', 1.15, 3)],
      values,
      'MYR',
      now,
    )
    expect(orderEmailText(order)).toContain('3 × Ants @ RM 1.15 = RM 3.45')
    expect(orderEmailText(order)).toContain('Estimated total: RM 3.45')
  })
})
