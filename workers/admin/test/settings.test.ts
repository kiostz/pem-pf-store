// Tests GET and POST /api/settings: the order email switch, its guarded save, validation and the order handler's next read.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { saveOrder } from '../../api/src/save-order'
import { parseOrderRequest } from '../../api/src/order-request'
import { call, postTo, seedHonors } from './helpers'

beforeEach(async () => {
  await env.DB.exec("DELETE FROM settings; INSERT INTO settings (id, currency, default_price_cents, order_email_on) VALUES (1, 'MYR', 400, 1)")
})

/**
 * Sends a settings save.
 * @param body The JSON body.
 * @return The response.
 */
const save = (body: unknown) => postTo('/api/settings', body)

describe('settings', () => {
  it('reads the switch and saves a change', async () => {
    // Catches a switch read as 0/1 instead of a boolean, or a save that does not stick.
    const read = await call('/api/settings')
    expect(read.headers.get('Cache-Control')).toBe('no-store')
    expect(await read.json()).toEqual({ orderEmailOn: true })
    const res = await save({ orderEmailOn: { from: true, to: false } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ orderEmailOn: false })
    expect(await (await call('/api/settings')).json()).toEqual({ orderEmailOn: false })
  })

  it('answers 409 with the current value for a stale from, writing nothing', async () => {
    // Catches a save that overwrites a change made in another tab.
    const res = await save({ orderEmailOn: { from: false, to: true } })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'conflict', orderEmailOn: true })
    expect(await (await call('/api/settings')).json()).toEqual({ orderEmailOn: true })
  })

  it('answers 400 for a non-boolean, an extra key, a missing side, a no-op and a non-object', async () => {
    // Catches a loose body, such as 1/0 or text, reaching the database.
    for (const body of [{ orderEmailOn: { from: 1, to: 0 } }, { orderEmailOn: { from: true, to: 'false' } }, { orderEmailOn: { from: true, to: false, x: 1 } }, { orderEmailOn: { from: true } }, { orderEmailOn: { from: true, to: true } }, { orderEmailOn: { from: true, to: false }, currency: 'USD' }, {}, [], null]) {
      const res = await save(body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid' })
    }
    expect(await (await call('/api/settings')).json()).toEqual({ orderEmailOn: true })
  })

  it('makes the API Worker\'s next order read the new value', async () => {
    // Catches a switch the order handler does not see.
    await seedHonors([{ id: 'knot-tying', name: 'Knot Tying', stock: 5 }])
    await save({ orderEmailOn: { from: true, to: false } })
    const request = parseOrderRequest({ requestId: '00000000-0000-4000-8000-000000000009', turnstileToken: 't', name: 'Ana Tester', email: 'ana@example.com', phone: '+60 12-345 6789', club: { name: 'Gilead', typed: false }, lines: [{ honorId: 'knot-tying', quantity: 1 }] })!
    const sold = await saveOrder(env.DB, request, new Date('2026-11-05T00:00:00Z'))
    expect(sold.kind === 'saved' && sold.emailOn).toBe(false)
  })

  it('answers 500 server when the settings row is missing', async () => {
    // Catches an undefined switch sent as a value.
    await env.DB.exec('DELETE FROM settings')
    expect((await call('/api/settings')).status).toBe(500)
  })
})
