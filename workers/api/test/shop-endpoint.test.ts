// Shop endpoint tests: GET /shop returns items, clubs and settings in one answer, with the same limits and errors as the other paths.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addItem, addSettings, call, expectJsonNoStore } from './helpers'

const SHOP = 'https://kiostz.github.io' // The one allowed origin.

describe('GET /shop', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM items; DELETE FROM clubs; DELETE FROM settings;') // Each test starts empty.
  })

  it('returns exactly items, clubs and settings with their public fields', async () => {
    // Catches leaking issued_by, status, skill_level or order_email_on, a wrong club order, or settings beyond currency.
    await addItem({ id: 'a', name: 'Alpha', stock: 3, price_cents: 250, image: '/p/a.png' }) // One item.
    await env.DB.exec(
      "INSERT INTO clubs (name, area, language, location, church_name, position) VALUES ('Zed', NULL, NULL, NULL, NULL, 1), ('Gilead', 'North', 'English', 'KL', 'Gilead Church', 2)",
    ) // Position order differs from name order.
    await addSettings() // One row.
    const res = await call('/shop') // The combined endpoint.
    expect(res.status).toBe(200) // Success.
    expectJsonNoStore(res) // Not cacheable.
    expect(await res.json()).toEqual({
      items: [{ id: 'a', name: 'Alpha', category: 'Nature', subcategory: null, priceCents: 250, stock: 3, image: '/p/a.png' }], // The one item.
      clubs: [
        { name: 'Zed', area: null, language: null, location: null, churchName: null },
        { name: 'Gilead', area: 'North', language: 'English', location: 'KL', churchName: 'Gilead Church' },
      ],
      settings: { currency: 'MYR' },
    }) // Literal expected body.
  })

  it('carries the subcategory name for an honor and null for an accessory, on /shop and /items', async () => { // The new column.
    // catches: a missing subquery, an id served instead of the name, or a hidden item leaking through the new column.
    await addSettings() // Needed for 200.
    await addItem({ id: 'knots', name: 'Knot Tying', category: 'Honors', subcategory_id: 5 }) // Id 5 is Nature.
    await addItem({ id: 'scarf', name: 'Scarf', category: 'Accessories' }) // No subcategory.
    await addItem({ id: 'ghost', name: 'Ghost', category: 'Honors', subcategory_id: 8, status: 'hidden' }) // Hidden stays hidden.
    const shop = (await (await call('/shop')).json()) as { items: { id: string; subcategory: string | null }[] } // Combined read.
    const items = (await (await call('/items')).json()) as { id: string; subcategory: string | null }[] // Items read.
    const pairs = (rows: { id: string; subcategory: string | null }[]) => rows.map((row) => [row.id, row.subcategory]) // Id and name only.
    expect(pairs(shop.items)).toEqual([['knots', 'Nature'], ['scarf', null]]) // Name order, literal names; ghost absent.
    expect(pairs(items)).toEqual([['knots', 'Nature'], ['scarf', null]]) // Same on /items.
  })

  it('orders clubs by position, then id', async () => {
    // Catches ordering by name, or ties left to chance.
    await addSettings() // Needed for 200.
    await env.DB.exec(
      "INSERT INTO clubs (id, name, position) VALUES (5, 'Late', 1), (2, 'Early', 1), (9, 'First', 0)",
    ) // Two share a position.
    const body = (await (await call('/shop')).json()) as { clubs: { name: string }[] } // The clubs list.
    expect(body.clubs.map((club) => club.name)).toEqual(['First', 'Early', 'Late']) // Position, then id.
  })

  it('never lists a hidden item even with stock', async () => {
    // Catches a missing status filter in the combined read.
    await addSettings() // Needed for 200.
    await addItem({ id: 'h', name: 'Hidden', status: 'hidden', stock: 5 }) // Hidden with stock.
    const body = (await (await call('/shop')).json()) as { items: unknown[] } // The items list.
    expect(body.items).toEqual([]) // Nothing shown.
  })

  it('sorts names case-insensitively, on /shop and /items', async () => {
    // Catches binary order (apple after Banana); names are unique ignoring case, so no tie remains.
    await addSettings() // Needed for 200.
    await addItem({ id: 'b1', name: 'Banana' }) // Sorts last.
    await addItem({ id: 'a2', name: 'apple' }) // Lower case, sorts first.
    await addItem({ id: 'a1', name: 'Apple Pie' }) // Inserted last, sorts second.
    const shop = (await (await call('/shop')).json()) as { items: { id: string }[] } // Combined read.
    const items = (await (await call('/items')).json()) as { id: string }[] // Items read.
    expect(shop.items.map((item) => item.id)).toEqual(['a2', 'a1', 'b1']) // Case-insensitive.
    expect(items.map((item) => item.id)).toEqual(['a2', 'a1', 'b1']) // Same order.
  })

  it('gives empty lists for an empty database with a settings row', async () => {
    // Catches an error or null where an empty list belongs.
    await addSettings() // Only settings.
    expect(await (await call('/shop')).json()).toEqual({ items: [], clubs: [], settings: { currency: 'MYR' } }) // Empty lists.
  })

  it('answers 500 server with no SQL text when the settings row is missing', async () => {
    // Catches a null-dereference, an invented currency, or driver text in the body or the log.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {}) // Capture what is logged.
    const res = await call('/shop') // No settings row.
    expect(res.status).toBe(500) // Server error.
    expect(await res.text()).toBe('{"error":"server"}') // Exactly the short code.
    const logged = JSON.stringify(spy.mock.calls) // Everything logged.
    expect(logged).not.toMatch(/SELECT|settings-missing|no such/i) // No SQL or internals.
    expect(logged).toContain('/shop') // Route is logged.
    spy.mockRestore() // Undo the spy.
  })

  it('answers POST with 405 and Allow: GET, and /shop/ with 404', async () => {
    // Catches a write route or loose path matching.
    const post = await call('/shop', { method: 'POST', body: '{}' }) // A write attempt.
    expect(post.status).toBe(405) // Refused.
    expect(post.headers.get('Allow')).toBe('GET') // Says what is allowed.
    const slash = await call('/shop/') // Trailing slash.
    expect(slash.status).toBe(404) // Exact match only.
    expect(await slash.json()).toEqual({ error: 'not-found' }) // Short code.
  })

  it('counts one limiter call per request and answers 429 with Retry-After when refused', async () => {
    // Catches a /shop load costing several limiter calls.
    await addSettings() // Needed for 200.
    const allow = vi.fn(async () => ({ success: true })) // Allows.
    expect((await call('/shop', {}, { limit: allow })).status).toBe(200) // Served.
    expect(allow).toHaveBeenCalledTimes(1) // Once.
    const refuse = vi.fn(async () => ({ success: false })) // Refuses.
    const res = await call('/shop', {}, { limit: refuse }) // Over the limit.
    expect(res.status).toBe(429) // Limited.
    expect(res.headers.get('Retry-After')).toBe('60') // Window length.
    expect(await res.json()).toEqual({ error: 'rate-limited' }) // Short code.
  })

  it('sends the CORS header only for the exact shop origin', async () => {
    // Catches a wildcard or loose origin match on the new route.
    await addSettings() // Needed for 200.
    const ok = await call('/shop', { headers: { Origin: SHOP } }) // The shop.
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(SHOP) // Granted.
    const other = await call('/shop', { headers: { Origin: 'https://evil.example' } }) // Anyone else.
    expect(other.status).toBe(200) // Body still served.
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull() // No grant.
  })
})
