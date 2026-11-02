// Read endpoint tests: what buyers may see from /items, /clubs and /settings, and nothing more.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { addHonor, addSettings, call, expectJsonNoStore } from './helpers'

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

  it('sorts /items names ignoring case, equal names by id', async () => {
    // Catches binary order (apple after Banana) and unstable order for equal names.
    await addHonor({ id: 'b1', name: 'Banana' }) // Sorts last.
    await addHonor({ id: 'a2', name: 'apple' }) // Higher id.
    await addHonor({ id: 'a1', name: 'Apple' }) // Lower id, inserted last.
    const items = (await (await call('/items')).json()) as { id: string }[] // The items.
    expect(items.map((honor) => honor.id)).toEqual(['a1', 'a2', 'b1']) // Case-insensitive, ties by id.
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
    await addSettings() // One row.
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
