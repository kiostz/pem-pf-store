// Tests POST /api/settings/prices: currency and default price, guarded save, validation, and that stored prices and orders never change.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { saveOrder } from '../../api/src/save-order'
import { parseOrderRequest } from '../../api/src/order-request'
import { formatPrice } from '../../../src/shared/format/price.ts' // the shared money formatter
import { readShop } from '../../api/src/read' // the shop read the settings show up in
import { call, fullRowOf, postTo, seedHonors, seedOrders } from './helpers'

beforeEach(async () => {
  await env.DB.exec("DELETE FROM settings; INSERT INTO settings (id, currency, default_price_cents, order_email_on) VALUES (1, 'MYR', 400, 1)")
})

/**
 * Sends a prices save.
 * @param body The JSON body.
 * @return The response.
 */
const save = (body: unknown) => postTo('/api/settings/prices', body)

/**
 * Reads the two price settings through the admin's own read.
 * @return Currency and default price.
 */
async function meta(): Promise<{ currency: string; defaultPriceCents: number }> {
  const { currency, defaultPriceCents } = (await (await call('/api/meta')).json()) as { currency: string; defaultPriceCents: number } // Only the two fields.
  return { currency, defaultPriceCents }
}

describe('POST /api/settings/prices', () => {
  it('saves the currency alone, the price alone and both, and /api/meta shows them', async () => {
    // Catches a save that drops one field or a read that does not see the write.
    let res = await save({ currency: { from: 'MYR', to: 'SGD' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ currency: 'SGD', defaultPriceCents: 400 })
    res = await save({ defaultPriceCents: { from: 400, to: 500 } })
    expect(await res.json()).toEqual({ currency: 'SGD', defaultPriceCents: 500 })
    res = await save({ currency: { from: 'SGD', to: 'CNY' }, defaultPriceCents: { from: 500, to: 0 } })
    expect(await res.json()).toEqual({ currency: 'CNY', defaultPriceCents: 0 })
    expect(await meta()).toEqual({ currency: 'CNY', defaultPriceCents: 0 })
  })

  it('leaves item prices and orders alone, and keeps the order email switch', async () => {
    // Catches a currency change that rewrites stored prices or past orders.
    await seedHonors([{ id: 'knot-tying', name: 'Knot Tying', stock: 5 }])
    await seedOrders([{ number: 'PF-20261105-2222', lines: [{ itemId: 'knot-tying', priceCents: 450 }] }])
    const items = async () => (await env.DB.prepare('SELECT id, price_cents FROM items ORDER BY id').all()).results
    const orders = async () => (await env.DB.prepare('SELECT number, currency, total_cents FROM orders ORDER BY number').all()).results
    const before = [await items(), await orders(), await fullRowOf('knot-tying')]
    await save({ currency: { from: 'MYR', to: 'SGD' }, defaultPriceCents: { from: 400, to: 900 } })
    expect([await items(), await orders(), await fullRowOf('knot-tying')]).toEqual(before)
    expect(await (await call('/api/settings')).json()).toEqual({ orderEmailOn: true })
  })

  it('answers 409 with the stored values for a stale from, writing nothing', async () => {
    // Catches a save that overwrites a change made in another tab, or half-writes when only one field is stale.
    const res = await save({ currency: { from: 'SGD', to: 'CNY' }, defaultPriceCents: { from: 400, to: 700 } })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'conflict', currency: 'MYR', defaultPriceCents: 400 })
    expect(await meta()).toEqual({ currency: 'MYR', defaultPriceCents: 400 })
  })

  it('answers 200 for a retry whose stored values already equal to', async () => {
    // Catches a lost answer that shows a false conflict on the retry.
    await save({ currency: { from: 'MYR', to: 'SGD' }, defaultPriceCents: { from: 400, to: 700 } })
    const res = await save({ currency: { from: 'MYR', to: 'SGD' }, defaultPriceCents: { from: 400, to: 700 } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ currency: 'SGD', defaultPriceCents: 700 })
  })

  it('answers 400 for a currency outside the list, BND and USD included', async () => {
    // Catches a removed currency still accepted, a 0- or 3-decimal currency, a lower-case code or a long code reaching the database.
    for (const to of ['JPY', 'BND', 'USD', 'myr', 'MYRR', '', 5, null]) {
      const res = await save({ currency: { from: 'MYR', to } })
      expect(res.status, String(to)).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid' })
    }
    expect(await meta()).toEqual({ currency: 'MYR', defaultPriceCents: 400 })
  })

  it('answers 400 for a price that is negative, too big, fractional or text', async () => {
    // Catches a price outside 0-99,999 whole cents.
    for (const to of [-1, 100000, 4.5, '400', null]) {
      const res = await save({ defaultPriceCents: { from: 400, to } })
      expect(res.status, String(to)).toBe(400)
    }
    expect(await meta()).toEqual({ currency: 'MYR', defaultPriceCents: 400 })
  })

  it('answers 400 for an empty body, a no-op, an extra key and a non-object', async () => {
    // Catches a loose body shape or a save that changes nothing.
    for (const body of [{}, { currency: { from: 'MYR', to: 'MYR' } }, { defaultPriceCents: { from: 400, to: 400 } }, { currency: { from: 'MYR', to: 'SGD' }, extra: 1 }, { currency: { from: 'MYR', to: 'SGD', x: 1 } }, { currency: { from: 'MYR' } }, [], null]) {
      const res = await save(body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid' })
    }
  })

  it('makes the API Worker\'s /shop and next order use the new currency and its symbol', async () => {
    // Catches a currency the order handler or the shop read does not take from settings, or a money text that keeps the old symbol.
    await seedHonors([{ id: 'knot-tying', name: 'Knot Tying', stock: 5 }])
    await save({ currency: { from: 'MYR', to: 'CNY' } })
    expect((await readShop(env.DB)).settings).toEqual({ currency: 'CNY' })
    const request = parseOrderRequest({ requestId: '00000000-0000-4000-8000-000000000019', turnstileToken: 't', name: 'Ana Tester', email: 'ana@example.com', phone: '+60 12-345 6789', club: { name: 'Gilead', typed: false }, lines: [{ honorId: 'knot-tying', quantity: 2 }] })!
    const sold = await saveOrder(env.DB, request, new Date('2026-11-05T00:00:00Z'))
    expect(sold.kind).toBe('saved')
    const row = await env.DB.prepare('SELECT currency FROM orders WHERE request_id = ?').bind('00000000-0000-4000-8000-000000000019').first<{ currency: string }>()
    expect(row?.currency).toBe('CNY')
    if (sold.kind !== 'saved') return // Narrowed for the money text.
    expect(formatPrice(sold.order.totalCents / 100, sold.order.currency)).toMatch(/^\u00a5\d+\.\d\d$/) // The email's money text uses the same formatter.
  })
})
