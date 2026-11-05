// Tests GET /api/clubs: shown order, the five fields with nulls, and the empty list.

import { beforeEach, describe, expect, it } from 'vitest'
import { call, clubWire, seedClubs } from './helpers'

beforeEach(async () => {
  await seedClubs([])
})

describe('GET /api/clubs', () => {
  it('lists clubs by position then id with nulls as null', async () => {
    // Catches an order by id, a tie not broken by id, or nulls turned into empty text.
    await seedClubs([{ id: 1, position: 3 }, { id: 2, position: 1, area: 'Klang', churchName: 'Klang SDA Church' }, { id: 3, position: 1 }])
    const res = await call('/api/clubs')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ clubs: [clubWire(2, { area: 'Klang', churchName: 'Klang SDA Church' }), clubWire(3), clubWire(1)] })
  })

  it('answers an empty list for an empty table', async () => {
    // Catches a 500 or null when the last club was removed.
    expect(await (await call('/api/clubs')).json()).toEqual({ clubs: [] })
  })
})
