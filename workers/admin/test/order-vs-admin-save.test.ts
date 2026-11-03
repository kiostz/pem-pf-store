// Tests an order landing between the admin's load and save: the admin's stale save must be refused and the sale kept, so the admin never overwrites a customer's order.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { saveOrder } from '../../api/src/save-order'
import { parseOrderRequest } from '../../api/src/order-request'
import { call, fullRowOf, postChanges, rowOf, seedHonors, wire } from './helpers'

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM order_lines'), env.DB.prepare('DELETE FROM orders'), env.DB.prepare('DELETE FROM settings')]) // Clean slate.
  await env.DB.exec("INSERT INTO settings (id, currency, default_price_cents, order_email_on) VALUES (1, 'MYR', 400, 1)") // The order save needs it.
  await seedHonors([{ id: 'knot-tying', name: 'Knot Tying', stock: 5 }]) // The admin sees 5.
})

describe('an order between the admin load and save', () => {
  it('makes the admin save 409 with the lowered stock, keeping the sale, and a re-save from the new value works', async () => {
    // Catches an admin save that overwrites the stock a real order just lowered (a silently undone sale).
    const request = parseOrderRequest({ requestId: '00000000-0000-4000-8000-000000000001', turnstileToken: 't', name: 'Ana Tester', email: 'ana@example.com', phone: '+60 12-345 6789', club: { name: 'Gilead', typed: false }, lines: [{ honorId: 'knot-tying', quantity: 2 }] })! // Valid.
    const sold = await saveOrder(env.DB, request, new Date('2026-11-02T00:00:00Z')) // The sale: stock 5 to 3.
    expect(sold.kind).toBe('saved') // Saved.
    const stale = await postChanges({ changes: [{ id: 'knot-tying', stock: { from: 5, to: 8 } }] }) // The admin still sees 5.
    expect(stale.status).toBe(409) // Conflict.
    expect(await stale.json()).toEqual({ error: 'conflict', honors: [wire({ id: 'knot-tying', name: 'Knot Tying', stock: 3 })], deletedIds: [] }) // The current row.
    expect(await rowOf('knot-tying')).toEqual({ stock: 3, status: 'active' }) // Not overwritten.
    const orders = await env.DB.prepare('SELECT COUNT(*) AS n FROM orders').first<{ n: number }>() // The sale.
    expect(orders?.n).toBe(1) // Still there.
    const fresh = await postChanges({ changes: [{ id: 'knot-tying', stock: { from: 3, to: 8 } }] }) // After reloading.
    expect(fresh.status).toBe(200) // Saved.
    expect(await rowOf('knot-tying')).toEqual({ stock: 8, status: 'active' }) // Restocked.
  })
})

describe('an order for an item the admin just edited', () => {
  it('lowers the stock but leaves the changed time and the Recently changed position as the edit left them', async () => {
    // Catches an order stamping modified_at, which would push every sold item to the top of Recently changed.
    await seedHonors([{ id: 'africa-lore', name: 'Africa Lore', stock: 5 }, { id: 'knot-tying', name: 'Knot Tying', stock: 5 }])
    expect((await postChanges({ changes: [{ id: 'africa-lore', priceCents: { from: 400, to: 650 } }] })).status).toBe(200) // The edit stamps Africa Lore.
    const edited = (await fullRowOf('africa-lore'))!.modified_at
    const request = parseOrderRequest({ requestId: '00000000-0000-4000-8000-000000000002', turnstileToken: 't', name: 'Ana Tester', email: 'ana@example.com', phone: '+60 12-345 6789', club: { name: 'Gilead', typed: false }, lines: [{ honorId: 'africa-lore', quantity: 2 }] })!
    expect((await saveOrder(env.DB, request, new Date('2030-01-01T00:00:00Z'))).kind).toBe('saved') // The sale, far later.
    expect(await fullRowOf('africa-lore')).toMatchObject({ stock: 3, modified_at: edited }) // Stock down, time kept.
    const page = (await (await call('/api/items?sort=changed')).json()) as { honors: { id: string; modifiedAt: string }[] }
    expect(page.honors.map((honor) => honor.id)).toEqual(['africa-lore', 'knot-tying']) // Edited first, as before the sale.
    expect(page.honors[0].modifiedAt).toBe(edited)
  })
})
