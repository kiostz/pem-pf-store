// Tests cancelling an order: the restock in the same transaction as the step, one winner in a race, and no touch of modified_at or status.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { fullRowOf, insertItems, postTo, rowOf, seedItems, seedOrders, stepOf } from './helpers'

const NUMBER = 'PF-20261105-ABCD' // The seeded order.
const EDITED = '2026-11-03T00:00:00.000Z' // The items' modified_at.

beforeEach(async () => {
  await seedItems([])
  await insertItems([
    { id: 'knot-tying', name: 'Knot Tying', stock: 3, modifiedAt: EDITED },
    { id: 'camp-shirt', name: 'Camp Shirt', stock: 1, status: 'hidden', modifiedAt: EDITED },
  ])
  await seedOrders([{ number: NUMBER, step: 'new', lines: [{ itemId: 'knot-tying', quantity: 2 }, { itemId: 'camp-shirt', quantity: 4 }, { itemId: 'gone', quantity: 3 }] }])
})

/**
 * Sends a cancel.
 * @param restock Whether to put stock back.
 * @param from The step the admin saw.
 * @return The response.
 */
const cancel = (restock: boolean, from = 'new') => postTo('/api/orders/step', { number: NUMBER, from, to: 'cancelled', restock })

describe('cancelling with a restock', () => {
  it('puts each line back, including on a Hidden item, skips a deleted item and counts only what went back', async () => {
    // Catches a restock that skips Hidden items or counts a deleted item's quantity.
    const res = await cancel(true)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ order: { step: 'cancelled' }, restocked: 6 })
    expect((await rowOf('knot-tying')).stock).toBe(5)
    expect((await rowOf('camp-shirt')).stock).toBe(5)
    expect(await stepOf(NUMBER)).toBe('cancelled')
  })

  it('leaves modified_at and status as they were', async () => {
    // Catches a restock that stamps modified_at, pushing the item to the top of Recently changed.
    await cancel(true)
    expect(await fullRowOf('knot-tying')).toMatchObject({ modified_at: EDITED, status: 'active' })
    expect(await fullRowOf('camp-shirt')).toMatchObject({ modified_at: EDITED, status: 'hidden' })
  })

  it('leaves stock alone when the box is unticked, and reports 0 restocked', async () => {
    // Catches a restock that ignores the checkbox.
    const res = await cancel(false)
    expect(await res.json()).toMatchObject({ order: { step: 'cancelled' }, restocked: 0 })
    expect((await rowOf('knot-tying')).stock).toBe(3)
    expect((await rowOf('camp-shirt')).stock).toBe(1)
  })

  it('refuses a second cancel with 409 and raises stock once', async () => {
    // Catches a double restock from a repeat or a double click.
    expect((await cancel(true)).status).toBe(200)
    const second = await cancel(true, 'new')
    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({ error: 'conflict', order: { step: 'cancelled' } })
    expect((await rowOf('knot-tying')).stock).toBe(5)
  })

  it('gives one 200 and one 409 for two cancels at once, with stock raised once', async () => {
    // Catches a read-then-write race that restocks twice.
    const results = await Promise.all([cancel(true), cancel(true)])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect((await rowOf('knot-tying')).stock).toBe(5)
    expect((await rowOf('camp-shirt')).stock).toBe(5)
  })

  it('gives one winner when a step change races a cancel, and the loser changes no stock', async () => {
    // Catches a cancel that restocks although a step change got in first.
    const results = await Promise.all([cancel(true), postTo('/api/orders/step', { number: NUMBER, from: 'new', to: 'paid', restock: false })])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    const stock = (await rowOf('knot-tying')).stock
    expect(await stepOf(NUMBER)).toBe(stock === 5 ? 'cancelled' : 'paid') // Stock raised only when the cancel won.
    expect([3, 5]).toContain(stock)
  })

  it('restocks nothing and cancels nothing when the stale from loses to a paid order', async () => {
    // Catches a restock that runs although the step guard fails.
    await env.DB.prepare("UPDATE orders SET step = 'paid' WHERE number = ?").bind(NUMBER).run()
    const res = await cancel(true, 'new')
    expect(res.status).toBe(409)
    expect((await rowOf('knot-tying')).stock).toBe(3)
    expect(await stepOf(NUMBER)).toBe('paid')
  })
})
