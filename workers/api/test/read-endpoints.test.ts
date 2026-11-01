// Read endpoint tests: what buyers may see from /items, /clubs and /settings, and nothing more.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { call, expectJsonNoStore } from './helpers'

/**
 * Inserts one honor row with defaults a test can override.
 * @param row Columns to override.
 * @return Resolves when the row is stored.
 */
async function addHonor(row: Record<string, unknown>): Promise<void> {
  const h = { id: 'x', name: 'X', category: 'Nature', issued_by: 'General Conference', status: 'active', stock: 0, price_cents: 400, image: null, ...row } // Defaults plus overrides.
  await env.DB.prepare(
    'INSERT INTO honors (id, name, category, issued_by, skill_level, status, stock, price_cents, image) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)',
  ).bind(h.id, h.name, h.category, h.issued_by, h.status, h.stock, h.price_cents, h.image).run() // Positional binds.
}

describe('read endpoints', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM honors; DELETE FROM clubs; DELETE FROM settings;') // Each test starts empty.
  })

  it('lists active honors by name with exactly six fields', async () => {
    // Catches leaking issued_by, status or skill_level, or a wrong order.
    await addHonor({ id: 'b', name: 'Beta', stock: 3, image: '/p/b.png' }) // Sorts second.
    await addHonor({ id: 'a', name: 'Alpha', price_cents: 250 }) // Sorts first.
    const res = await call('/items') // The public path.
    expect(res.status).toBe(200) // Success.
    expectJsonNoStore(res) // Success answers must not be cacheable.
    expect(await res.json()).toEqual([
      { id: 'a', name: 'Alpha', category: 'Nature', priceCents: 250, stock: 0, image: null },
      { id: 'b', name: 'Beta', category: 'Nature', priceCents: 400, stock: 3, image: '/p/b.png' },
    ]) // Literal expected values.
  })

  it('never lists a hidden honor even with stock', async () => {
    // Catches a missing status filter.
    await addHonor({ id: 'h', name: 'Hidden', status: 'hidden', stock: 5 }) // Hidden with stock.
    expect(await (await call('/items')).json()).toEqual([]) // Nothing shown.
  })

  it('lists clubs in position order and keeps nulls', async () => {
    // Catches ordering by name or id, and nulls turned into empty strings.
    await env.DB.exec(
      "INSERT INTO clubs (name, area, language, location, church_name, position) VALUES ('Zed', NULL, NULL, NULL, NULL, 1), ('Gilead', 'North', 'English', 'KL', 'Gilead Church', 2)",
    ) // Position order differs from name order.
    const res = await call('/clubs') // The clubs endpoint.
    expect(res.status).toBe(200) // Success.
    expectJsonNoStore(res) // Success answers must not be cacheable.
    expect(await res.json()).toEqual([
      { name: 'Zed', area: null, language: null, location: null, churchName: null },
      { name: 'Gilead', area: 'North', language: 'English', location: 'KL', churchName: 'Gilead Church' },
    ]) // Position order, nulls kept.
  })

  it('shows only the currency in settings', async () => {
    // Catches leaking the default price or the order email switch.
    await env.DB.exec("INSERT INTO settings (id, currency, default_price_cents, order_email_on) VALUES (1, 'MYR', 400, 1)") // One row.
    const res = await call('/settings') // The settings endpoint.
    expect(res.status).toBe(200) // Success.
    expectJsonNoStore(res) // Success answers must not be cacheable.
    expect(await res.json()).toEqual({ currency: 'MYR' }) // Currency only.
  })

  it('gives empty lists for an empty database', async () => {
    // Catches an error or null where an empty list belongs.
    expect(await (await call('/items')).json()).toEqual([]) // No honors.
    expect(await (await call('/clubs')).json()).toEqual([]) // No clubs.
  })
})
