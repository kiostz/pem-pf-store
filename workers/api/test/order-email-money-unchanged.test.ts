// Order email money text: for MYR the email prints exactly what the old Intl formatter printed, so no existing amount changes in a buyer's or the club's inbox after the shared formatter took over.

import { describe, expect, it } from 'vitest'
import { orderEmail } from '../src/order-email'

/**
 * The money text the email used before the shared formatter (the independent oracle).
 * @param cents The amount in cents.
 * @return For example "RM 1,200.00" with a plain space.
 */
const oldMoney = (cents: number): string => new Intl.NumberFormat('en', { style: 'currency', currency: 'MYR', currencyDisplay: 'narrowSymbol' }).format(cents / 100).replace(/\u00a0/g, ' ') // Intl 'en' MYR, plain space.

describe('orderEmail MYR money against the old Intl text', () => {
  it.each([0, 1, 5, 99, 100, 450, 999, 1000, 12345, 99999, 100000, 1234567, 99999 * 500, 123456789])('prints %i cents as the old formatter did, in a line and in the total', (cents) => {
    // Catches a rounding, grouping, symbol or spacing change for an amount that exists today.
    const order = { number: 'PF-20261102-ABCD', createdAt: '2026-11-01T17:00:00.000Z', currency: 'MYR', totalCents: cents, lines: [{ itemId: 'knots', name: 'Knot Tying', quantity: 1, priceCents: cents }] } // One line at that price.
    const text = orderEmail(order, { name: 'Ana', email: 'a@b.co', phone: '1234567', club: { name: 'Gilead', typed: false } }, 'https://admin.example.test').text // The email text.
    expect(text).toContain(`1 × Knot Tying @ ${oldMoney(cents)} = ${oldMoney(cents)}`) // The line.
    expect(text).toContain(`Estimated total: ${oldMoney(cents)}`) // The total.
    expect(text).not.toMatch(/\u00a0/) // Plain spaces only.
  })
})
