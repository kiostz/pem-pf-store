// Tests POST /api/clubs/order: guarded renumbering, the race with an added club, retries and validation.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { call, clubRows, postTo, racingAfterRead, seedClubs } from './helpers'

beforeEach(async () => {
  await seedClubs([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }])
})

/**
 * Sends a reorder.
 * @param body The JSON body.
 * @param options The call options.
 * @return The response.
 */
const reorder = (body: unknown, options: Parameters<typeof call>[2] = {}) => postTo('/api/clubs/order', body, {}, options)

/**
 * Reads the shown order.
 * @return The club ids in order.
 */
async function shown(): Promise<number[]> {
  return ((await (await call('/api/clubs')).json()) as { clubs: { id: number }[] }).clubs.map((club) => club.id) // Ids only.
}

describe('POST /api/clubs/order', () => {
  it('saves a move and renumbers positions 1..n', async () => {
    // Catches positions left as gaps or ties after a move.
    await seedClubs([{ id: 1, position: 5 }, { id: 2, position: 5 }, { id: 3, position: 9 }, { id: 4, position: 20 }])
    const res = await reorder({ from: [1, 2, 3, 4], to: [3, 1, 2, 4] })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { clubs: { id: number }[] }).clubs.map((club) => club.id)).toEqual([3, 1, 2, 4])
    expect((await clubRows()).map((row) => [row.id, row.position])).toEqual([[1, 2], [2, 3], [3, 1], [4, 4]])
  })

  it('gives 409 for a stale from and changes no position', async () => {
    // Catches a move applied over another tab's reorder.
    await reorder({ from: [1, 2, 3, 4], to: [4, 1, 2, 3] })
    const before = await clubRows()
    const res = await reorder({ from: [1, 2, 3, 4], to: [2, 1, 3, 4] })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string; clubs: { id: number }[] }).clubs.map((club) => club.id)).toEqual([4, 1, 2, 3])
    expect(await clubRows()).toEqual(before)
  })

  it('rolls the whole batch back when a club is added between the read and the write', async () => {
    // Catches a count guard that is missing, so a reorder renumbers over a club it never saw.
    const racing = { // A DB that adds a club just before the batch runs.
      prepare: (sql: string) => env.DB.prepare(sql),
      batch: async (statements: D1PreparedStatement[]) => {
        await env.DB.exec("INSERT INTO clubs (name, position) VALUES ('Late', 99)")
        return env.DB.batch(statements)
      },
    } as unknown as D1Database
    const before = (await clubRows()).map((row) => [row.id, row.position])
    const res = await reorder({ from: [1, 2, 3, 4], to: [4, 3, 2, 1] }, { env: { DB: racing } })
    expect(res.status).toBe(409)
    const after = await clubRows()
    expect(after.slice(0, 4).map((row) => [row.id, row.position])).toEqual(before) // The four are untouched.
    expect((await res.json() as { clubs: unknown[] }).clubs).toHaveLength(5)
  })

  it('rolls the whole batch back when a club moves between the read and the write', async () => {
    // Catches a position guard that is missing, so another tab's move is overwritten.
    const racing = {
      prepare: (sql: string) => env.DB.prepare(sql),
      batch: async (statements: D1PreparedStatement[]) => {
        await env.DB.exec('UPDATE clubs SET position = 7 WHERE id = 2')
        return env.DB.batch(statements)
      },
    } as unknown as D1Database
    const res = await reorder({ from: [1, 2, 3, 4], to: [4, 3, 2, 1] }, { env: { DB: racing } })
    expect(res.status).toBe(409)
    expect((await clubRows()).map((row) => row.position)).toEqual([1, 7, 3, 4])
  })

  it('gives 409 when a club moves right after the list was read, before the write', async () => {
    // Catches positions read a second time after the order check, so another tab's move is overwritten.
    const racing = racingAfterRead(/FROM clubs( ORDER BY|$)/, () => env.DB.exec('UPDATE clubs SET position = 7 WHERE id = 2')) // Another tab moves club 2 after the first read.
    const res = await reorder({ from: [1, 2, 3, 4], to: [4, 3, 2, 1] }, { env: { DB: racing } })
    expect(res.status).toBe(409)
    expect((await clubRows()).map((row) => row.position)).toEqual([1, 7, 3, 4]) // The other tab's move stands; nothing renumbered.
  })

  it('answers 200 when the stored order already equals to', async () => {
    // Catches a lost answer turning into a conflict.
    const body = { from: [1, 2, 3, 4], to: [2, 1, 3, 4] }
    expect((await reorder(body)).status).toBe(200)
    expect((await reorder(body)).status).toBe(200)
    expect(await shown()).toEqual([2, 1, 3, 4])
  })

  it.each([
    ['duplicates', { from: [1, 1], to: [1, 1] }],
    ['a missing id', { from: [1, 2, 3, 4], to: [1, 2, 3] }],
    ['an extra id', { from: [1, 2], to: [1, 2, 3] }],
    ['a different id', { from: [1, 2], to: [1, 3] }],
    ['from equal to to', { from: [1, 2], to: [1, 2] }],
    ['a non-integer', { from: [1, 2.5], to: [2.5, 1] }],
    ['a string id', { from: [1, '2'], to: ['2', 1] }],
    ['501 ids', { from: Array.from({ length: 501 }, (_, i) => i + 1), to: Array.from({ length: 501 }, (_, i) => 501 - i) }],
    ['empty lists', { from: [], to: [] }],
    ['an extra key', { from: [1, 2], to: [2, 1], extra: 1 }],
  ])('refuses %s', async (_label, body) => {
    // Catches a body that is not a real permutation reaching the guards.
    const before = await clubRows()
    expect((await reorder(body)).status).toBe(400)
    expect(await clubRows()).toEqual(before)
  })
})
