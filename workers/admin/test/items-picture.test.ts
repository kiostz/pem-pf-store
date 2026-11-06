// Tests POST /api/items/picture: a picture is stored under a new key only if the admin saw the current one, with every check before any write.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { call, fullRowOf, imageOf, seedHonors, wire } from './helpers'

// A valid WebP header followed by filler.
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 9, 9])
// A valid PNG signature followed by filler.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9])
// The key the seeded item starts with.
const OLD = 'items/knot-tying.webp'

/**
 * Posts a picture as the admin page would.
 * @param query The query string after `?`.
 * @param body The bytes to send.
 * @param headers Header overrides.
 * @param options The Access options.
 * @return The response.
 */
const upload = (query: string, body: BodyInit | null = WEBP, headers: Record<string, string> = {}, options = {}) =>
  call(`/api/items/picture?${query}`, { method: 'POST', headers: { Origin: 'https://admin.test', 'Content-Type': 'image/webp', ...headers }, body }, options)

/**
 * Lists the stored keys under one id.
 * @param id The honor id.
 * @return The keys.
 */
const keysOf = async (id: string) => (await env.PICTURES.list({ prefix: `items/${id}` })).objects.map((object) => object.key)

beforeEach(async () => {
  await seedHonors([{ id: 'knot-tying', name: 'Knot Tying', stock: 5, priceCents: 450, status: 'active', image: OLD }, { id: 'africa-lore', name: 'Africa Lore' }])
  for (const { key } of (await env.PICTURES.list()).objects) await env.PICTURES.delete(key) // Empty bucket.
  await env.PICTURES.put(OLD, WEBP, { httpMetadata: { contentType: 'image/webp' } })
})

describe('POST /api/items/picture', () => {
  it('stores a WebP under a new key, points the row at it, drops the old object and sets modifiedAt', async () => {
    // catches: an overwrite in place (stale cache), a lost old object, a missing modified_at or a changed guard field
    const before = Date.now()
    const res = await upload(`id=knot-tying&seen=${encodeURIComponent(OLD)}`)
    expect(res.status).toBe(200)
    const { item } = (await res.json()) as { item: { image: string; modifiedAt: string } }
    expect(item.image).toMatch(/^items\/knot-tying-[0-9a-f]{8}\.webp$/)
    expect(await imageOf('knot-tying')).toBe(item.image)
    const stored = await env.PICTURES.head(item.image)
    expect(stored?.httpMetadata?.contentType).toBe('image/webp')
    expect(stored?.httpMetadata?.cacheControl).toBe('public, max-age=31536000, immutable')
    expect(await env.PICTURES.head(OLD)).toBeNull()
    expect(Date.parse(item.modifiedAt)).toBeGreaterThanOrEqual(before)
    const row = await fullRowOf('knot-tying')
    expect([row?.name, row?.price_cents, row?.status, row?.stock]).toEqual(['Knot Tying', 450, 'active', 5])
  })

  it('stores a PNG under a .png key with image/png', async () => {
    // catches: Safari pictures saved with a webp key or type
    const res = await upload(`id=knot-tying&seen=${encodeURIComponent(OLD)}`, PNG, { 'Content-Type': 'image/png' })
    expect(res.status).toBe(200)
    const { item } = (await res.json()) as { item: { image: string } }
    expect(item.image).toMatch(/^items\/knot-tying-[0-9a-f]{8}\.png$/)
    expect((await env.PICTURES.head(item.image))?.httpMetadata?.contentType).toBe('image/png')
  })

  it('saves a first picture (empty seen) and deletes nothing', async () => {
    // catches: a first upload refused, or deleting an object that is not its own
    const del = vi.spyOn(env.PICTURES, 'delete')
    const res = await upload('id=africa-lore&seen=')
    expect(res.status).toBe(200)
    const { item } = (await res.json()) as { item: { image: string } }
    expect(item.image).toMatch(/^items\/africa-lore-[0-9a-f]{8}\.webp$/)
    expect(del).not.toHaveBeenCalled()
    expect(await env.PICTURES.head(OLD)).not.toBeNull()
    del.mockRestore()
  })

  it('answers 409 with the current row when seen differs, writing nothing', async () => {
    // catches: overwriting a picture another admin saved
    const res = await upload('id=knot-tying&seen=items%2Fother.webp')
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'conflict', items: [wire({ id: 'knot-tying', name: 'Knot Tying', stock: 5, priceCents: 450, image: OLD })], deletedIds: [] })
    expect(await imageOf('knot-tying')).toBe(OLD)
    expect(await keysOf('knot-tying')).toEqual([OLD])
  })

  it('answers 409 when the admin thought there was no picture but there is one', async () => {
    // catches: an empty seen treated as "anything goes"
    const res = await upload('id=knot-tying&seen=')
    expect(res.status).toBe(409)
    expect(await imageOf('knot-tying')).toBe(OLD)
  })

  it('lets exactly one of two parallel uploads with the same seen win', async () => {
    // catches: the lost update, where both uploads succeed and one picture is orphaned
    const query = `id=knot-tying&seen=${encodeURIComponent(OLD)}`
    const results = await Promise.all([upload(query), upload(query)])
    expect(results.map((res) => res.status).sort()).toEqual([200, 409])
    const keys = await keysOf('knot-tying')
    expect(keys).toHaveLength(1)
    expect(await imageOf('knot-tying')).toBe(keys[0])
  })

  it('answers 409 with deletedIds when the row is gone, leaving no object', async () => {
    // catches: an orphan object or a 500 for a deleted item
    await env.DB.prepare("DELETE FROM items WHERE id = 'africa-lore'").run()
    const res = await upload('id=africa-lore&seen=')
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'conflict', items: [], deletedIds: ['africa-lore'] })
    expect(await keysOf('africa-lore')).toEqual([])
  })

  it('answers 400 invalid when the first bytes do not match the type', async () => {
    // catches: text or a PNG stored as a WebP, which the shop would then show broken
    const png = await upload(`id=knot-tying&seen=${encodeURIComponent(OLD)}`, PNG, { 'Content-Type': 'image/webp' })
    expect(png.status).toBe(400)
    expect(await png.json()).toEqual({ error: 'invalid' })
    const text = await upload(`id=knot-tying&seen=${encodeURIComponent(OLD)}`, 'hello world, not a picture', { 'Content-Type': 'image/png' })
    expect(text.status).toBe(400)
    expect(await keysOf('knot-tying')).toEqual([OLD])
  })

  it('answers 400 for an empty body, a bad or missing id and a seen outside the key pattern', async () => {
    // catches: a path-like id or seen reaching R2, or an empty object stored
    expect((await upload('id=knot-tying&seen=', new Uint8Array())).status).toBe(400)
    for (const query of ['seen=', 'id=&seen=', 'id=Knot&seen=', 'id=a%2Fb&seen=', 'id=knot-tying', 'id=knot-tying&seen=patches%2Fx.webp', 'id=knot-tying&seen=items%2F..%2Fx.webp', `id=${'a'.repeat(101)}&seen=`]) {
      expect((await upload(query)).status, query).toBe(400)
    }
    expect(await imageOf('knot-tying')).toBe(OLD)
  })

  it('answers 413 over 256 KB, declared and streamed', async () => {
    // catches: a large body buffered or stored
    const big = new Uint8Array(256 * 1024 + 1)
    big.set(WEBP)
    const query = `id=africa-lore&seen=`
    expect((await upload(query, big)).status).toBe(413) // Declared by Content-Length.
    const stream = new ReadableStream({ start(controller) { controller.enqueue(big); controller.close() } }) // No length.
    const res = await call(`/api/items/picture?${query}`, { method: 'POST', headers: { Origin: 'https://admin.test', 'Content-Type': 'image/webp' }, body: stream, duplex: 'half' } as RequestInit)
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'too-large' })
    expect(await keysOf('africa-lore')).toEqual([])
  })

  it('answers 415 picture-only for other types', async () => {
    // catches: JSON or form posts reaching the picture store
    for (const type of ['application/json', 'text/plain', 'image/jpeg', '']) {
      const res = await upload('id=africa-lore&seen=', WEBP, { 'Content-Type': type })
      expect(res.status, type).toBe(415)
      expect(await res.json()).toEqual({ error: 'picture-only' })
    }
  })

  it('answers 403 forbidden for a foreign or missing Origin, before the type check', async () => {
    // catches: a cross-site page storing pictures
    for (const headers of [{ Origin: 'https://evil.test' }, { Origin: '' }]) {
      const res = await upload('id=africa-lore&seen=', WEBP, { ...headers, 'Content-Type': 'text/plain' })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'forbidden' })
    }
    const none = await call('/api/items/picture?id=africa-lore&seen=', { method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: WEBP })
    expect(none.status).toBe(403)
    expect(await keysOf('africa-lore')).toEqual([])
  })

  it('answers 403 JSON without Access, before any R2 or D1 work', async () => {
    // catches: the gate running after the write
    const put = vi.spyOn(env.PICTURES, 'put')
    const prepare = vi.spyOn(env.DB, 'prepare')
    for (const access of ['none', { email: 'stranger@example.test' }] as const) {
      const res = await upload('id=africa-lore&seen=', WEBP, {}, { access })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'forbidden' })
    }
    expect(put).not.toHaveBeenCalled()
    expect(prepare).not.toHaveBeenCalled()
    put.mockRestore()
    prepare.mockRestore()
  })

  it('removes the new object and answers 500 server when the row update throws', async () => {
    // catches: an orphan object after a failed D1 write
    const real = env.DB.prepare.bind(env.DB)
    const spy = vi.spyOn(env.DB, 'prepare').mockImplementation((sql: string) => {
      if (sql.startsWith('UPDATE')) throw new Error('boom')
      return real(sql)
    })
    const res = await upload('id=africa-lore&seen=')
    spy.mockRestore()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'server' })
    expect(await keysOf('africa-lore')).toEqual([])
  })

  it('answers 200 and keeps the new key when deleting the old object fails, logging only the class', async () => {
    // catches: a failed cleanup turning a saved upload into a 500, or the error text reaching the log
    const del = vi.spyOn(env.PICTURES, 'delete').mockRejectedValue(new TypeError('secret detail'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await upload(`id=knot-tying&seen=${encodeURIComponent(OLD)}`)
    del.mockRestore()
    const calls = log.mock.calls
    log.mockRestore()
    expect(res.status).toBe(200)
    const { item } = (await res.json()) as { item: { image: string } }
    expect(item.image).toMatch(/^items\/knot-tying-[0-9a-f]{8}\.webp$/)
    expect(await imageOf('knot-tying')).toBe(item.image)
    expect(calls).toEqual([['picture cleanup failed', 'TypeError']])
  })

  it('accepts a 92-character item id', async () => {
    // catches: an upload-only id cap tighter than the 100 characters every other route accepts
    const id = `${'a'.repeat(45)}-${'b'.repeat(46)}`
    await seedHonors([{ id, name: 'Long' }])
    const res = await upload(`id=${id}&seen=`)
    expect(res.status).toBe(200)
    expect(id).toHaveLength(92)
  })

  it('answers 409 deletedIds, keeps the old object and drops the new one when the row is deleted just before the guarded update', async () => {
    // catches: a 500 or a row-less conflict body when the guarded update changes 0 rows because the item was deleted mid-upload
    const real = env.DB.prepare.bind(env.DB)
    const spy = vi.spyOn(env.DB, 'prepare').mockImplementation((sql: string) => {
      const statement = real(sql)
      if (!sql.startsWith('UPDATE')) return statement
      return { bind: (...args: unknown[]) => ({ run: async () => { await real("DELETE FROM items WHERE id = 'knot-tying'").run(); return statement.bind(...args).run() } }) } as unknown as D1PreparedStatement
    })
    const res = await upload(`id=knot-tying&seen=${encodeURIComponent(OLD)}`)
    spy.mockRestore()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'conflict', items: [], deletedIds: ['knot-tying'] })
    expect(await keysOf('knot-tying')).toEqual([OLD])
  })

  it('answers 409 deletedIds and drops the new object when the row is deleted right after the guarded update succeeds', async () => {
    // catches: a 200 with no honor, or an orphan new object, when another admin deletes the item between the update and the re-read
    const real = env.DB.prepare.bind(env.DB)
    const spy = vi.spyOn(env.DB, 'prepare').mockImplementation((sql: string) => {
      const statement = real(sql)
      if (!sql.startsWith('UPDATE')) return statement
      return { bind: (...args: unknown[]) => ({ run: async () => { const result = await statement.bind(...args).run(); await real("DELETE FROM items WHERE id = 'knot-tying'").run(); return result } }) } as unknown as D1PreparedStatement
    })
    const res = await upload(`id=knot-tying&seen=${encodeURIComponent(OLD)}`)
    spy.mockRestore()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'conflict', items: [], deletedIds: ['knot-tying'] })
    expect(await keysOf('knot-tying')).toEqual([])
  })
})
