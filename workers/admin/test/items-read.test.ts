// Tests the admin read: every honor with five fields, in case-insensitive name order.

import { describe, expect, it } from 'vitest'
import { call, seedHonors } from './helpers'

describe('GET /api/items', () => {
  it('lists active and hidden honors with exactly five fields', async () => {
    // Catches a read that filters out Hidden honors, so the admin could never show one again.
    await seedHonors([
      { id: 'knot-tying', name: 'Knot Tying', category: 'Outdoor', status: 'active', stock: 12 },
      { id: 'africa-lore', name: 'Africa Lore', category: 'Mission', status: 'hidden', stock: 0 },
    ])
    const res = await call('/api/items')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual([
      { id: 'africa-lore', name: 'Africa Lore', category: 'Mission', status: 'hidden', stock: 0 },
      { id: 'knot-tying', name: 'Knot Tying', category: 'Outdoor', status: 'active', stock: 12 },
    ])
  })

  it('sorts case-insensitively and breaks ties by id', async () => {
    // Catches binary collation, which puts "apple" after every capital, and unstable ties.
    await seedHonors([
      { id: 'banana', name: 'Banana' },
      { id: 'apple-low', name: 'apple' },
      { id: 'b-twin', name: 'Twin' },
      { id: 'a-twin', name: 'Twin' },
      { id: 'apple-cap', name: 'Apple' },
    ])
    const ids = ((await (await call('/api/items')).json()) as { id: string }[]).map((honor) => honor.id)
    expect(ids).toEqual(['apple-cap', 'apple-low', 'banana', 'a-twin', 'b-twin']) // "Apple" and "apple" tie, id decides.
  })

  it('returns an empty list for an empty database', async () => {
    // Catches a null or error where the table has no rows.
    await seedHonors([])
    const res = await call('/api/items')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})
