// Tests the edges of POST /api/items/picture that the main file leaves open: look-alike file headers, a failing R2 put, other methods, and a first-picture race.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { call, imageOf, seedItems } from './helpers'

// The bytes "RIFF", a size and "WAVE": a RIFF file that is not a WebP.
const WAVE = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 9, 9])
// Only the first seven bytes of the PNG signature.
const SHORT_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a])
// "RIFF" and nothing after it, shorter than the 12 bytes a WebP header needs.
const RIFF_ONLY = new Uint8Array([0x52, 0x49, 0x46, 0x46])
// A valid WebP header followed by filler.
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 9, 9])

/**
 * Posts a picture as the admin page would.
 * @param query The query string after `?`.
 * @param body The bytes to send.
 * @param type The Content-Type header.
 * @return The response.
 */
const upload = (query: string, body: BodyInit | null, type = 'image/webp') =>
  call(`/api/items/picture?${query}`, { method: 'POST', headers: { Origin: 'https://admin.test', 'Content-Type': type }, body })

/**
 * Lists every stored key.
 * @return The keys.
 */
const allKeys = async () => (await env.PICTURES.list()).objects.map((object) => object.key)

beforeEach(async () => {
  await seedItems([{ id: 'knot-tying', name: 'Knot Tying', image: 'items/knot-tying.webp' }, { id: 'africa-lore', name: 'Africa Lore' }])
  for (const { key } of (await env.PICTURES.list()).objects) await env.PICTURES.delete(key) // Empty bucket.
  await env.PICTURES.put('items/knot-tying.webp', WEBP, { httpMetadata: { contentType: 'image/webp' } })
})

describe('POST /api/items/picture edges', () => {
  it.each([
    ['a WAVE file sent as image/webp', WAVE, 'image/webp'],
    ['a RIFF header with nothing after it as image/webp', RIFF_ONLY, 'image/webp'],
    ['a PNG signature cut short as image/png', SHORT_PNG, 'image/png'],
  ])('answers 400 and stores nothing for %s', async (_name, body, type) => {
    // catches: a signature check that looks at RIFF only (or at a short body) and lets a non-picture into the bucket
    const res = await upload('id=africa-lore&seen=', body, type)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid' })
    expect(await allKeys()).toEqual(['items/knot-tying.webp'])
    expect(await imageOf('africa-lore')).toBeNull()
  })

  it('answers 500 and leaves the row and the old object alone when the R2 put throws', async () => {
    // catches: a row pointing at an object that was never stored, or the old picture deleted before the new one landed
    const put = vi.spyOn(env.PICTURES, 'put').mockRejectedValue(new Error('r2 down'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await upload('id=knot-tying&seen=items%2Fknot-tying.webp', WEBP)
    put.mockRestore()
    log.mockRestore()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'server' })
    expect(await imageOf('knot-tying')).toBe('items/knot-tying.webp')
    expect(await allKeys()).toEqual(['items/knot-tying.webp'])
  })

  it.each(['HEAD', 'PUT', 'PATCH', 'DELETE'])('answers 405 with Allow: POST for %s', async (method) => {
    // catches: a write reaching the upload route through another method
    const res = await call('/api/items/picture?id=africa-lore&seen=', { method, headers: { Origin: 'https://admin.test' } })
    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('POST')
    expect(await allKeys()).toEqual(['items/knot-tying.webp'])
  })

  it('lets exactly one of two parallel first uploads (empty seen) win and leaves one object', async () => {
    // catches: a guard written as `image = ?`, which never matches NULL, or a first-picture race that stores two pictures
    const results = await Promise.all([upload('id=africa-lore&seen=', WEBP), upload('id=africa-lore&seen=', WEBP)])
    expect(results.map((res) => res.status).sort()).toEqual([200, 409])
    const keys = (await allKeys()).filter((key) => key.startsWith('items/africa-lore'))
    expect(keys).toHaveLength(1)
    expect(await imageOf('africa-lore')).toBe(keys[0])
  })

  it('answers 409 for a seen key that belongs to another item and never touches that item', async () => {
    // catches: a guard that accepts any valid key, letting one item's upload delete another item's picture
    const res = await upload('id=africa-lore&seen=items%2Fknot-tying.webp', WEBP)
    expect(res.status).toBe(409)
    expect(await imageOf('knot-tying')).toBe('items/knot-tying.webp')
    expect(await allKeys()).toEqual(['items/knot-tying.webp'])
  })

  it('answers 403 before reading the body when Access is missing, even for a too-large declared body', async () => {
    // catches: the size or signature check running ahead of the gate
    const big = new Uint8Array(300 * 1024)
    const res = await call('/api/items/picture?id=africa-lore&seen=', { method: 'POST', headers: { Origin: 'https://admin.test', 'Content-Type': 'image/webp' }, body: big }, { access: 'none' })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
  })
})
