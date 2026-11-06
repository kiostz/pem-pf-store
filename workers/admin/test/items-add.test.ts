// Tests POST /api/items: a Club-added item starts Hidden with 0 in stock, a safe id, and both times set to the request time.

import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { call, fullRowOf, insertHonors, postTo, seedHonors, wire } from './helpers'

// The time a frozen-clock request stamps.
const NOW = '2026-11-03T09:30:15.123Z'

beforeEach(async () => {
  await seedHonors([{ id: 'knot-tying', name: 'Knot Tying' }])
  vi.useFakeTimers({ toFake: ['Date'] }) // Only Date, so D1 still runs.
  vi.setSystemTime(new Date(NOW))
})
afterEach(() => vi.useRealTimers())

/**
 * Posts an add.
 * @param over Fields that differ from a valid Camp Shirt.
 * @return The response.
 */
const add = (over: Record<string, unknown> = {}) => postTo('/api/items', { name: 'Camp Shirt', category: 'Shirt', priceCents: 400, ...over })

describe('POST /api/items', () => {
  it('adds a Hidden item with stock 0, issued by Club, both times equal to the request time', async () => {
    // Catches an Add that starts Active (sellable before the admin looked), or with a time of the backfill date.
    const res = await add()
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ honor: wire({ id: 'camp-shirt', name: 'Camp Shirt', category: 'Shirt', status: 'hidden', stock: 0, priceCents: 400, clubAdded: true, createdAt: NOW, modifiedAt: NOW }) })
    expect(await fullRowOf('camp-shirt')).toMatchObject({ issued_by: 'Club', status: 'hidden', stock: 0, created_at: NOW, modified_at: NOW })
  })

  it('uses the price the sheet sent', async () => {
    // Catches a price dropped on the way in.
    await add({ priceCents: 1250 })
    expect((await fullRowOf('camp-shirt'))!.price_cents).toBe(1250)
  })

  it('gives -2 when the id is taken by a differently named item', async () => {
    // Catches an id clash answered as a 500, or an overwrite of the other item.
    await insertHonors([{ id: 'camp-shirt', name: 'Camp  Shirt!' }]) // The same slug, another name.
    const res = await add()
    expect(res.status).toBe(201)
    expect(((await res.json()) as { honor: { id: string } }).honor.id).toBe('camp-shirt-2')
    expect((await fullRowOf('camp-shirt'))!.name).toBe('Camp  Shirt!') // Untouched.
  })

  it('answers 409 name-taken for the same name in another case, writing nothing', async () => {
    // Catches duplicates that differ only by case, which look identical to buyers.
    const res = await add({ name: 'knot tying' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'name-taken' })
    expect(((await (await call('/api/items?sort=name')).json()) as { honors: unknown[] }).honors).toHaveLength(1)
  })

  it('makes one row from two parallel adds of the same name', async () => {
    // Catches two admins' double Add creating two items: the unique index decides.
    const [a, b] = await Promise.all([add(), add({ name: 'CAMP SHIRT' })])
    expect([a.status, b.status].sort()).toEqual([201, 409])
    const { n } = (await env.DB.prepare("SELECT count(*) AS n FROM items WHERE name = 'Camp Shirt' COLLATE NOCASE").first<{ n: number }>())!
    expect(n).toBe(1)
  })

  it('refuses a bad body with 400 and writes nothing', async () => {
    // Catches Add accepting a status or stock from the client, or an unlisted category.
    for (const over of [{ status: 'active' }, { stock: 5 }, { category: 'Other' }, { name: ' ' }, { priceCents: -1 }]) {
      const res = await add(over)
      expect(res.status, JSON.stringify(over)).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid' })
    }
    expect(await fullRowOf('camp-shirt')).toBeNull()
  })

  it('answers 409 id-taken after the nine suffixes are used', async () => {
    // Catches an endless loop or a 500 when -2 to -9 are all taken.
    await insertHonors([{ id: 'camp-shirt', name: 'A1' }, ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ id: `camp-shirt-${n}`, name: `A${n}` }))])
    const res = await add()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'id-taken' })
  })
})
