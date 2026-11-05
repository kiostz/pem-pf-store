// Edge tests for cancelling and stepping orders: cancels from every open step, shared items, no stock cap, a deleted order, an Items save after a cancel without restock, and quiet logs.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from 'cloudflare:workers'
import { BUYER, call, insertHonors, postChanges, postTo, rowOf, seedHonors, seedOrders, stepOf } from './helpers'

const A = 'PF-20261105-AAAA' // First seeded order.
const B = 'PF-20261105-BBBB' // Second seeded order.
const EDITED = '2026-11-03T00:00:00.000Z' // The item's modified_at.

beforeEach(async () => {
  await seedHonors([]) // Empty shop.
  await insertHonors([{ id: 'knot-tying', name: 'Knot Tying', stock: 3, modifiedAt: EDITED }]) // One item.
})

afterEach(() => {
  vi.restoreAllMocks() // Spies off.
})

/**
 * Sends a step change.
 * @param number The order number.
 * @param from The step the admin saw.
 * @param to The step wanted.
 * @param restock Whether to put stock back.
 * @return The response.
 */
const move = (number: string, from: string, to: string, restock: boolean) => postTo('/api/orders/step', { number, from, to, restock })

describe('cancelling from any open step', () => {
  for (const from of ['paid', 'handed_out'] as const) { // Both open steps past New.
    it(`restocks once when a ${from} order is cancelled`, async () => {
      // Catches a restock or guard that only works from New.
      await seedOrders([{ number: A, step: from, lines: [{ itemId: 'knot-tying', quantity: 2 }] }])
      expect((await move(A, from, 'cancelled', true)).status).toBe(200)
      expect((await move(A, from, 'cancelled', true)).status).toBe(409) // A retry.
      expect((await rowOf('knot-tying')).stock).toBe(5) // Raised once.
    })
  }
})

describe('restock arithmetic', () => {
  it('adds on top of a large stock with no cap', async () => {
    // Catches a clamp on the restocked stock.
    await insertHonors([{ id: 'big', name: 'Big', stock: 5000 }])
    await seedOrders([{ number: A, lines: [{ itemId: 'big', quantity: 7 }] }])
    await move(A, 'new', 'cancelled', true)
    expect((await rowOf('big')).stock).toBe(5007)
  })

  it('puts back only the cancelled order\'s lines when another order holds the same item', async () => {
    // Catches a restock summed over every order's lines for the item, or one that touches the other order.
    await seedOrders([
      { number: A, lines: [{ itemId: 'knot-tying', quantity: 2 }] },
      { number: B, lines: [{ itemId: 'knot-tying', quantity: 5 }] },
    ])
    const res = await move(A, 'new', 'cancelled', true)
    expect(await res.json()).toMatchObject({ restocked: 2 }) // Only A's quantity.
    expect((await rowOf('knot-tying')).stock).toBe(5)
    expect(await stepOf(B)).toBe('new') // B untouched.
    await move(B, 'new', 'cancelled', true)
    expect((await rowOf('knot-tying')).stock).toBe(10) // Each order once.
  })
})

describe('an order that no longer exists', () => {
  it('answers 404 for a cancel with restock and for a step change, and changes no stock', async () => {
    // Catches a restock that runs for an order the nightly removal deleted while the admin had it open.
    await seedOrders([{ number: A, lines: [{ itemId: 'knot-tying', quantity: 2 }] }])
    await env.DB.exec('DELETE FROM orders') // The old-order job took it.
    expect((await move(A, 'new', 'cancelled', true)).status).toBe(404)
    expect((await move(A, 'new', 'paid', false)).status).toBe(404)
    expect((await rowOf('knot-tying')).stock).toBe(3) // Nothing restocked.
  })
})

describe('a cancel without restock beside an Items save', () => {
  it('leaves the stock the admin saw valid, so the save goes through', async () => {
    // Catches an unticked cancel that bumps stock or modified_at and gives a false stale-stock 409.
    await seedOrders([{ number: A, lines: [{ itemId: 'knot-tying', quantity: 2 }] }])
    await move(A, 'new', 'cancelled', false)
    const save = await postChanges({ changes: [{ id: 'knot-tying', stock: { from: 3, to: 9 } }] })
    expect(save.status).toBe(200)
    expect((await rowOf('knot-tying')).stock).toBe(9)
  })
})

describe('logs on the success, conflict and not-found paths', () => {
  it('print nothing that holds a buyer name, email, phone, club or order number', async () => {
    // Catches a debug log of the order on a cancel, a conflict or a lookup.
    await seedOrders([{ number: A, lines: [{ itemId: 'knot-tying', quantity: 2 }] }])
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'info')] // Every console method.
    await move(A, 'new', 'cancelled', true) // Success.
    await move(A, 'new', 'cancelled', true) // Conflict.
    await move('PF-20261105-ZZZZ', 'new', 'paid', false) // Not found.
    await call(`/api/orders?number=${A}`) // A lookup.
    const logged = JSON.stringify(spies.map((s) => s.mock.calls)) // Everything printed.
    for (const value of [...Object.values(BUYER), 'Gilead', 'PF-2026']) expect(logged).not.toContain(value)
  })

  it('keep personal data out of the page cursor', async () => {
    // Catches a cursor that carries the buyer instead of time and id.
    await seedOrders(Array.from({ length: 51 }, (_, i) => ({ number: `PF-20261105-${String(i).padStart(4, '0').replace(/0/g, 'A').replace(/1/g, 'B')}`, createdAt: `2026-11-05T01:${String(i).padStart(2, '0')}:00.000Z` })))
    const body = await (await call('/api/orders')).json<{ nextCursor: string | null }>()
    expect(body.nextCursor).not.toBeNull() // A second page exists.
    const decoded = atob(body.nextCursor!.replace(/-/g, '+').replace(/_/g, '/')) // The cursor's content.
    for (const value of [...Object.values(BUYER), 'Gilead']) expect(decoded).not.toContain(value)
  })
})
