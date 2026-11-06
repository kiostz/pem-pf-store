// Tests the admin read: a page of items with their full row shape, hidden ones included, newest change first.

import { describe, expect, it } from 'vitest'
import { call, seedItems, wire } from './helpers'

describe('GET /api/items', () => {
  it('lists active and hidden items with every field the admin shows', async () => {
    // Catches a read that filters out Hidden items, so the admin could never show one again, or drops the price and the times.
    await seedItems([
      { id: 'knot-tying', name: 'Knot Tying', category: 'Honors', status: 'active', stock: 12, priceCents: 450, image: 'items/knot-tying.webp' }, // An active catalogue row.
      { id: 'africa-lore', name: 'Africa Lore', category: 'Accessories', status: 'hidden', stock: 0, issuedBy: 'Club', modifiedAt: '2026-11-02T10:00:00.000Z' }, // A hidden Club-added row.
    ])
    const res = await call('/api/items')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({
      items: [
        wire({ id: 'africa-lore', name: 'Africa Lore', category: 'Accessories', status: 'hidden', clubAdded: true, modifiedAt: '2026-11-02T10:00:00.000Z' }), // The Club-added row, newest first.
        wire({ id: 'knot-tying', name: 'Knot Tying', category: 'Honors', stock: 12, priceCents: 450, image: 'items/knot-tying.webp' }), // The catalogue row.
      ],
      nextCursor: null,
    })
  })

  it('returns an empty page for an empty database', async () => {
    // Catches a null or error where the table has no rows.
    await seedItems([])
    const res = await call('/api/items')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [], nextCursor: null })
  })
})
