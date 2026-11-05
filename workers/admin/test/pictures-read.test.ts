// Tests the Admin Worker's picture read route: stored bytes come back with their type, bad keys never reach R2, and the Access gate runs first.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { call } from './helpers'

// Bytes of a stand-in picture.
const BYTES = new Uint8Array([82, 73, 70, 70, 1, 2, 3])

describe('GET /pictures/<key>', () => {
  beforeEach(async () => {
    await env.PICTURES.put('items/knot-tying.webp', BYTES, { httpMetadata: { contentType: 'image/webp' } }) // One stored picture.
  })

  it('serves a stored key with its type, nosniff and the bytes', async () => {
    // catches: a wrong content type, a sniffable response or lost bytes
    const res = await call('/pictures/items/knot-tying.webp')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES)
  })

  it('answers HEAD with 200 and no body', async () => {
    // catches: HEAD answered 405, with a body, or reading the whole object
    const get = vi.spyOn(env.PICTURES, 'get') // Counts body reads.
    const res = await call('/pictures/items/knot-tying.webp', { method: 'HEAD' })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    expect((await res.arrayBuffer()).byteLength).toBe(0)
    expect(get).not.toHaveBeenCalled() // HEAD must not open the body stream.
    get.mockRestore()
  })

  it('answers 404 not-found for a missing key', async () => {
    // catches: a 500 or an empty 200 for a picture that is not there
    const res = await call('/pictures/items/missing.webp')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not-found' })
  })

  it.each(['patches/x.webp', 'items/..%2Fx.webp', 'items/..%2fx.webp', 'items%2Fx.webp', 'items/X.webp', 'items/x.svg'])('answers 404 for %s without reading R2', async (key) => {
    // catches: a key outside the pattern reaching the bucket
    const get = vi.spyOn(env.PICTURES, 'get') // Counts reads.
    const res = await call(`/pictures/${key}`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not-found' })
    expect(get).not.toHaveBeenCalled()
    get.mockRestore()
  })

  it.each(['POST', 'PUT', 'DELETE'])('answers 405 for %s', async (method) => {
    // catches: a write method reaching the picture route
    const res = await call('/pictures/items/knot-tying.webp', { method, headers: { Origin: 'https://admin.test' } })
    expect(res.status).toBe(405)
  })

  it('answers the HTML 403 page without Access', async () => {
    // catches: a picture served to someone who is not signed in
    const res = await call('/pictures/items/knot-tying.webp', {}, { access: 'none' })
    expect(res.status).toBe(403)
    expect(res.headers.get('Content-Type')).toContain('text/html')
  })

  it('answers 403 for an admin not in ADMIN_EMAILS', async () => {
    // catches: any signed-in Access user reading pictures
    const res = await call('/pictures/items/knot-tying.webp', {}, { access: { email: 'stranger@example.test' } })
    expect(res.status).toBe(403)
  })
})
