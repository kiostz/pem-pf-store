// Orders the admin tests share, shaped like the Admin Worker's answers, with made-up buyers only.

import type { AdminOrder, OrderStep } from '../../../workers/admin/src/admin-types.ts' // the shared shapes

/**
 * Builds one order with sensible defaults.
 * @param fields the fields that differ from the default
 * @return a full order
 */
export const makeOrder = (fields: Partial<AdminOrder> & { number: string }): AdminOrder => ({
  createdAt: '2026-11-05T02:00:00.000Z', // 5 Nov, 10:00 am in Malaysia
  step: 'new', // just ordered
  currency: 'MYR', // Malaysian ringgit
  totalCents: 1200, // RM 12.00
  itemCount: 3, // three items
  club: 'Test Club', // a made-up club
  buyer: { name: 'Test Buyer', email: 'buyer@example.test', phone: '+60 12 000 0000' }, // a made-up buyer
  personalDataRemovedAt: null, // details kept
  lines: [
    { itemId: 'knot-tying', name: 'Knot Tying', quantity: 2, priceCents: 400, inShop: true }, // still sold
    { itemId: 'camp-shirt', name: 'Camp Shirt', quantity: 1, priceCents: 400, inShop: true }, // still sold
  ],
  ...fields, // what the test sets
}) // a full order

/**
 * Builds an order at a step.
 * @param number the order number
 * @param step the step
 * @return the order
 */
export const orderAt = (number: string, step: OrderStep): AdminOrder => makeOrder({ number, step }) // one-liner for lists

// Three orders at three steps, newest first.
export const orders: AdminOrder[] = [
  orderAt('PF-20261105-AAAA', 'new'),
  orderAt('PF-20261104-BBBB', 'paid'),
  orderAt('PF-20261103-CCCC', 'handed_out'),
] // the list
