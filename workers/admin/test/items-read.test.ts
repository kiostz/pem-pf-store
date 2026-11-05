// Tests the admin read: a page of honors with their full row shape, hidden ones included, newest change first.

import { describe, expect, it } from 'vitest'
import { call, seedHonors, wire } from './helpers'

describe('GET /api/items', () => {
  it('lists active and hidden honors with every field the admin shows', async () => {
    // Catches a read that filters out Hidden honors, so the admin could never show one again, or drops the price and the times.
    await seedHonors([
      { id: 'knot-tying', name: 'Knot Tying', category: 'Outdoor Industries', status: 'active', stock: 12, priceCents: 450, image: 'items/knot-tying.webp' },
      { id: 'africa-lore', name: 'Africa Lore', category: 'Outreach', status: 'hidden', stock: 0, issuedBy: 'Club', modifiedAt: '2026-11-02T10:00:00.000Z' },
    ])
    const res = await call('/api/items')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({
      honors: [
        wire({ id: 'africa-lore', name: 'Africa Lore', category: 'Outreach', status: 'hidden', clubAdded: true, modifiedAt: '2026-11-02T10:00:00.000Z' }),
        wire({ id: 'knot-tying', name: 'Knot Tying', category: 'Outdoor Industries', stock: 12, priceCents: 450, image: 'items/knot-tying.webp' }),
      ],
      nextCursor: null,
    })
  })

  it('returns an empty page for an empty database', async () => {
    // Catches a null or error where the table has no rows.
    await seedHonors([])
    const res = await call('/api/items')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ honors: [], nextCursor: null })
  })
})
