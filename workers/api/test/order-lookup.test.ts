// GET /orders/status/<requestId> tests: a buyer whose answer was lost can learn whether the order was saved, without the lookup ever returning or logging buyer data or the request id.

import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { call, count, mockSiteverify, postOrder, SHOP, seedShop, validOrder } from './helpers'

const UUID = '00000000-0000-4000-8000-0000000000aa' // A made-up request id.

/**
 * Looks an order up the way the shop does.
 * @param path The path after the host.
 * @param init Request options; the shop's Origin is sent unless the test says otherwise.
 * @param limiter A rate limiter to use.
 * @return The response.
 */
function lookup(path: string, init: RequestInit = { headers: { Origin: SHOP } }, limiter?: RateLimit): Promise<Response> {
  return call(path, init, limiter) // Through the Worker's handler.
}

beforeEach(async () => {
  await seedShop() // Honors and settings.
})
afterEach(() => {
  vi.restoreAllMocks() // Spies off.
})

describe('GET /orders/status/<requestId>', () => {
  it('answers 200 { found: false } with no-store and the shop CORS header for an unknown id', async () => {
    // Catches a 404 for "not saved yet", which the shop would read as a missing route.
    const res = await lookup(`/orders/status/${UUID}`) // Nothing saved.
    expect(res.status).toBe(200) // Answered.
    expect(await res.json()).toEqual({ found: false }) // Not found.
    expect(res.headers.get('Cache-Control')).toBe('no-store') // Never cached.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SHOP) // The shop can read it.
  })

  it('answers found with exactly the six keys and none of the buyer data', async () => {
    // Catches buyer fields or the request id leaking into the lookup answer.
    mockSiteverify() // Captcha passes.
    const body = validOrder({ requestId: UUID }) // One id.
    await postOrder(body) // Saved.
    const res = await lookup(`/orders/status/${UUID}`) // The lookup.
    const json = (await res.json()) as { found: boolean; order: Record<string, unknown> } // The answer.
    expect(json.found).toBe(true) // Found.
    expect(Object.keys(json.order).sort()).toEqual(['club', 'createdAt', 'currency', 'lines', 'number', 'totalCents']) // Exactly these.
    expect(json.order.club).toBe('Gilead') // The stored club.
    expect(json.order.lines).toEqual([{ itemId: 'knots', name: 'Knot Tying', quantity: 2, priceCents: 300 }]) // Saved lines.
    expect(JSON.stringify(json)).not.toMatch(/Ana|ana@|0123|12-345|00000000-0000-4000/) // No name, email, phone or id.
  })

  it('answers a typed club as "Other: <name>"', async () => {
    // Catches losing the flag that says the club was typed by hand.
    mockSiteverify() // Captcha passes.
    await postOrder(validOrder({ requestId: UUID, club: { name: 'Riverside', typed: true } })) // Typed club.
    const json = (await (await lookup(`/orders/status/${UUID}`)).json()) as { order: { club: string } } // The answer.
    expect(json.order.club).toBe('Other: Riverside') // Body text.
  })

  it('finds an order stored in lower case by an id in capitals', async () => {
    // Catches a case-sensitive query for an id the shop may send in any case.
    mockSiteverify() // Captcha passes.
    await postOrder(validOrder({ requestId: UUID })) // Stored lower case.
    const json = (await (await lookup(`/orders/status/${UUID.toUpperCase()}`)).json()) as { found: boolean } // Capitals.
    expect(json.found).toBe(true) // Found.
  })

  it.each([
    ['not a UUID', '/orders/status/abc', 400, { error: 'invalid' }],
    ['an empty segment', '/orders/status/', 404, { error: 'not-found' }],
    ['an extra segment', `/orders/status/${UUID}/x`, 404, { error: 'not-found' }],
    ['a trailing slash', `/orders/status/${UUID}/`, 404, { error: 'not-found' }],
  ])('answers %s', async (_name, path, status, body) => {
    // Catches a loose route match that reaches the query with an odd id.
    const res = await lookup(path) // The odd path.
    expect(res.status).toBe(status) // Refused.
    expect(await res.json()).toEqual(body) // Short code.
  })

  it.each([
    ['a foreign Origin', { headers: { Origin: 'https://evil.test' } }],
    ['no Origin', {}],
  ])('answers %s with 403 forbidden-origin and no CORS header', async (_name, init) => {
    // Catches a lookup open to any caller.
    const res = await lookup(`/orders/status/${UUID}`, init) // Not the shop.
    expect(res.status).toBe(403) // Refused.
    expect(await res.json()).toEqual({ error: 'forbidden-origin' }) // Short code.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull() // No grant.
  })

  it.each(['POST', 'PUT', 'OPTIONS'])('answers %s with 405 and Allow: GET', async (method) => {
    // Catches a write or preflight on the read route.
    const res = await lookup(`/orders/status/${UUID}`, { method, headers: { Origin: SHOP } }) // Wrong method.
    expect(res.status).toBe(405) // Refused.
    expect(res.headers.get('Allow')).toBe('GET') // What is allowed.
  })

  it('answers 429 before any route check when the limiter refuses', async () => {
    // Catches a lookup outside the shared rate limit.
    const limited: RateLimit = { limit: async () => ({ success: false }) } // Always refuses.
    const res = await lookup('/orders/status/abc', { headers: { Origin: SHOP } }, limited) // Would be 400 otherwise.
    expect(res.status).toBe(429) // Limited first.
  })

  it('answers 500 server on a D1 fault and logs no id and no buyer data', async () => {
    // Catches the id (in the path) or buyer data reaching the console.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {}) // Captured.
    const log = vi.spyOn(console, 'log').mockImplementation(() => {}) // Captured.
    const broken = { prepare: () => { throw new Error(`boom ${UUID} Ana Tester`) } } as unknown as D1Database // Throws on use.
    const res = await call(`/orders/status/${UUID}`, { headers: { Origin: SHOP } }, undefined, { DB: broken }) // Faulty database.
    expect(res.status).toBe(500) // Server error.
    expect(await res.json()).toEqual({ error: 'server' }) // Short code.
    const logged = JSON.stringify([...error.mock.calls, ...log.mock.calls]) // Everything printed.
    expect(logged).not.toContain(UUID) // No request id.
    expect(logged).not.toMatch(/Ana|ana@|12-345/) // No buyer data.
  })

  it('answers the order as saved after the item is renamed, repriced, sold out and the currency changed', async () => {
    // Catches a lookup that reads today's item names, prices or currency instead of the saved order lines.
    mockSiteverify() // Captcha passes.
    await postOrder(validOrder({ requestId: UUID })) // Two Knot Tying at 300 in MYR.
    const first = await (await lookup(`/orders/status/${UUID}`)).json() // Before the admin's changes.
    await env.DB.batch([
      env.DB.prepare("UPDATE items SET name = 'Renamed', price_cents = 999, stock = 0 WHERE id = 'knots'"), // Renamed, repriced, sold out.
      env.DB.prepare("UPDATE settings SET currency = 'SGD'"), // Another currency.
    ])
    expect(await (await lookup(`/orders/status/${UUID}`)).json()).toEqual(first) // The same answer.
  })

  it('logs nothing on a found, a not-found or a refused lookup', async () => {
    // Catches a debug log that puts the request id or the order on the console.
    mockSiteverify() // Captcha passes.
    const spies = (['log', 'error', 'warn', 'info'] as const).map((name) => vi.spyOn(console, name).mockImplementation(() => {})) // Every channel.
    await postOrder(validOrder({ requestId: UUID })) // Saved.
    spies.forEach((spy) => spy.mockClear()) // Only the lookups count.
    await lookup(`/orders/status/${UUID}`) // Found.
    await lookup(`/orders/status/${UUID.replace('aa', 'bb')}`) // Not found.
    await lookup(`/orders/status/${UUID}`, { headers: { Origin: 'https://evil.test' } }) // Refused.
    expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]) // Silent.
  })

  it('writes nothing: order rows and stock are equal before and after', async () => {
    // Catches a lookup with a side effect.
    mockSiteverify() // Captcha passes.
    await postOrder(validOrder({ requestId: UUID })) // One order.
    const snapshot = async () => JSON.stringify([(await env.DB.prepare('SELECT * FROM orders').all()).results, (await env.DB.prepare('SELECT id, stock FROM items ORDER BY id').all()).results]) // Rows and stock.
    const before = await snapshot() // Before.
    await lookup(`/orders/status/${UUID}`) // Found.
    await lookup(`/orders/status/${UUID.replace('aa', 'bb')}`) // Not found.
    expect(await snapshot()).toBe(before) // Unchanged.
    expect(await count('orders')).toBe(1) // Still one.
  })
})
