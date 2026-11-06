// Tests a restock landing between the admin's load and save of Items: the stale save is refused and the restock kept.

import { beforeEach, describe, expect, it } from 'vitest'
import { insertHonors, postChanges, postTo, rowOf, seedHonors, seedOrders, wire } from './helpers'

beforeEach(async () => {
  await seedHonors([])
  await insertHonors([{ id: 'knot-tying', name: 'Knot Tying', stock: 3 }])
  await seedOrders([{ number: 'PF-20261105-ABCD', lines: [{ itemId: 'knot-tying', quantity: 2 }] }])
})

describe('a cancel between the Items load and save', () => {
  it('gives the stale-stock 409 with the restocked row and keeps the restock', async () => {
    // Catches an Items save that overwrites stock a cancel just put back.
    expect((await postTo('/api/orders/step', { number: 'PF-20261105-ABCD', from: 'new', to: 'cancelled', restock: true })).status).toBe(200)
    const stale = await postChanges({ changes: [{ id: 'knot-tying', stock: { from: 3, to: 9 } }] }) // The admin saw 3.
    expect(stale.status).toBe(409)
    expect(await stale.json()).toEqual({ error: 'conflict', items: [wire({ id: 'knot-tying', name: 'Knot Tying', stock: 5 })], deletedIds: [] })
    expect((await rowOf('knot-tying')).stock).toBe(5)
  })
})
