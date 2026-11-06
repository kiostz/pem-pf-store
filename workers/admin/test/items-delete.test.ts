// Tests POST /api/items/delete: Club-added items only, guarded by the row as the admin saw it.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteItem } from '../src/delete-item'
import { fullRowOf, postTo, seedHonors, wire } from './helpers'

// The row as the admin saw it.
const seen = { name: 'Camp Shirt', category: 'Shirt', priceCents: 1500, status: 'hidden', stock: 0, modifiedAt: '2026-11-03T01:00:00.000Z' }

beforeEach(() =>
  seedHonors([
    { id: 'camp-shirt', name: 'Camp Shirt', category: 'Shirt', priceCents: 1500, status: 'hidden', issuedBy: 'Club', modifiedAt: '2026-11-03T01:00:00.000Z', createdAt: '2026-11-03T01:00:00.000Z' },
    { id: 'knot-tying', name: 'Knot Tying' },
  ]),
)

/**
 * Posts a delete.
 * @param id The id.
 * @param over Fields of `seen` that differ.
 * @return The response.
 */
const del = (id: string, over: Record<string, unknown> = {}) => postTo('/api/items/delete', { id, seen: { ...seen, ...over } })

describe('POST /api/items/delete', () => {
  it('removes the picture object of a deleted Club-added item', async () => {
    // Catches orphaned picture objects piling up in R2 after deletes.
    await env.DB.prepare("UPDATE items SET image = 'items/camp-shirt-0a1b2c3d.webp' WHERE id = 'camp-shirt'").run()
    await env.PICTURES.put('items/camp-shirt-0a1b2c3d.webp', new Uint8Array([1]))
    expect((await del('camp-shirt')).status).toBe(200)
    expect(await env.PICTURES.head('items/camp-shirt-0a1b2c3d.webp')).toBeNull()
  })

  it('answers 200 with the row gone when deleting the picture object fails, logging only the class', async () => {
    // Catches a failed cleanup turning a finished delete into a 500, or the error text reaching the log.
    await env.DB.prepare("UPDATE items SET image = 'items/camp-shirt-0a1b2c3d.webp' WHERE id = 'camp-shirt'").run()
    const spy = vi.spyOn(env.PICTURES, 'delete').mockRejectedValue(new TypeError('secret detail'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await del('camp-shirt')
    spy.mockRestore()
    const calls = log.mock.calls
    log.mockRestore()
    expect(res.status).toBe(200)
    expect(await fullRowOf('camp-shirt')).toBeNull()
    expect(calls).toEqual([['picture cleanup failed', 'TypeError']])
  })

  it('keeps the picture object when the delete conflicts', async () => {
    // Catches deleting the picture of an item that survived the guard.
    await env.DB.prepare("UPDATE items SET image = 'items/camp-shirt-0a1b2c3d.webp', stock = 3 WHERE id = 'camp-shirt'").run()
    await env.PICTURES.put('items/camp-shirt-0a1b2c3d.webp', new Uint8Array([1]))
    expect((await del('camp-shirt')).status).toBe(409)
    expect(await env.PICTURES.head('items/camp-shirt-0a1b2c3d.webp')).not.toBeNull()
  })

  it('deletes a Club-added item the admin saw as it is', async () => {
    // Catches a delete that does nothing, or answers with the wrong id.
    const res = await del('camp-shirt')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deletedId: 'camp-shirt' })
    expect(await fullRowOf('camp-shirt')).toBeNull()
  })

  it('answers 400 built-in for an item the club did not add, and keeps it', async () => {
    // Catches a delete of a General Conference honor, which the shop's history and imports rely on.
    const res = await del('knot-tying', { name: 'Knot Tying', category: 'Nature', priceCents: 400, status: 'active', modifiedAt: '2026-11-01T00:00:00.000Z' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'built-in' })
    expect(await fullRowOf('knot-tying')).not.toBeNull()
  })

  it('answers 409 with the current row after a sale, and keeps the item', async () => {
    // Catches deleting an item whose stock moved: a sale changes stock but not modified_at, so the guard must compare stock.
    await env.DB.prepare('UPDATE items SET stock = 3 WHERE id = ?').bind('camp-shirt').run()
    const res = await del('camp-shirt')
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'conflict', items: [wire({ id: 'camp-shirt', name: 'Camp Shirt', category: 'Shirt', status: 'hidden', stock: 3, priceCents: 1500, clubAdded: true, createdAt: seen.modifiedAt, modifiedAt: seen.modifiedAt })] })
    expect(await fullRowOf('camp-shirt')).not.toBeNull()
  })

  it('answers 409 after an edit made after viewing', async () => {
    // Catches a delete over another admin's rename or price change.
    for (const change of ["name = 'Camp Tee'", 'price_cents = 1600', "modified_at = '2026-11-03T02:00:00.000Z'", "category = 'Nature'", "status = 'active'"]) {
      await seedHonors([{ id: 'camp-shirt', name: 'Camp Shirt', category: 'Shirt', priceCents: 1500, status: 'hidden', issuedBy: 'Club', modifiedAt: seen.modifiedAt }])
      await env.DB.prepare(`UPDATE items SET ${change} WHERE id = 'camp-shirt'`).run()
      expect((await del('camp-shirt')).status, change).toBe(409)
      expect(await fullRowOf('camp-shirt'), change).not.toBeNull()
    }
  })

  it('answers 200 again for an item already gone', async () => {
    // Catches a double click or a second admin getting an error for a delete that has happened.
    expect((await del('camp-shirt')).status).toBe(200)
    const again = await del('camp-shirt')
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ deletedId: 'camp-shirt' })
  })

  it('refuses a bad body with 400 invalid', async () => {
    // Catches a delete built from missing guard values.
    const res = await postTo('/api/items/delete', { id: 'camp-shirt' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid' })
  })
})

/**
 * Wraps the database so something happens just before the DELETE statement runs, after the pre-read.
 * @param race What happens in that gap.
 * @return A database whose DELETE runs the race first.
 */
function racing(race: () => Promise<unknown>): D1Database {
  return {
    prepare: (sql: string) => {
      const statement = env.DB.prepare(sql) // The real statement.
      if (!sql.startsWith('DELETE')) return statement // Reads go through.
      return { bind: (...values: unknown[]) => ({ run: async () => { await race(); return statement.bind(...values).run() } }) } // The race lands first.
    },
  } as unknown as D1Database
}

describe('the delete statement\'s own guard', () => {
  it('answers conflict with the current row and keeps the item when a sale lands just before the DELETE', async () => {
    // Catches a guard column dropped from the DELETE's WHERE: an item sold a second earlier would be deleted unseen.
    const result = await deleteItem(racing(() => env.DB.prepare('UPDATE items SET stock = 3 WHERE id = ?').bind('camp-shirt').run()), env.PICTURES, { id: 'camp-shirt', seen: seen as never })
    expect(result).toEqual({ kind: 'conflict', items: [wire({ id: 'camp-shirt', name: 'Camp Shirt', category: 'Shirt', status: 'hidden', stock: 3, priceCents: 1500, clubAdded: true, createdAt: seen.modifiedAt, modifiedAt: seen.modifiedAt })] })
    expect(await fullRowOf('camp-shirt')).not.toBeNull()
  })

  it('answers deleted when another admin deletes the row in that gap', async () => {
    // Catches a 409 or 500 for an item that is gone, which is the outcome the admin wanted.
    const result = await deleteItem(racing(() => env.DB.prepare('DELETE FROM items WHERE id = ?').bind('camp-shirt').run()), env.PICTURES, { id: 'camp-shirt', seen: seen as never })
    expect(result).toEqual({ kind: 'deleted' })
  })
})

describe('interruptions', () => {
  it('answers 200 to both of two parallel deletes of one item', async () => {
    // Catches a double click or two tabs where the loser gets an error for a delete that happened.
    const [a, b] = await Promise.all([del('camp-shirt'), del('camp-shirt')])
    expect([a.status, b.status]).toEqual([200, 200])
    expect(await fullRowOf('camp-shirt')).toBeNull() // Gone once.
  })
})
