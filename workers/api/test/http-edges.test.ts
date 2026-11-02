// HTTP edge tests: methods, malformed Origin values, query strings and limiter order, so no odd request gets a CORS grant, a body it should not have, or a crash.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { call, expectJsonNoStore } from './helpers'

const SHOP = 'https://kiostz.github.io' // The one allowed origin.

describe('http edges', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM honors; DELETE FROM clubs; DELETE FROM settings;') // Each test starts empty.
  })

  it.each(['HEAD', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'])('answers %s on /items with 405 and Allow: GET', async (method) => {
    // Catches a method check that only blocks POST, or a preflight that is answered before Task 10 adds it.
    const res = await call('/items', { method, headers: { Origin: SHOP } }) // A non-GET call from the shop.
    expect(res.status).toBe(405) // Refused.
    expect(res.headers.get('Allow')).toBe('GET') // Says what is allowed.
    expect(res.headers.get('Access-Control-Allow-Methods')).toBeNull() // No preflight grant yet.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SHOP) // The shop can still read the refusal.
  })

  it('answers the /orders preflight with 204 and CORS headers for the shop only', async () => {
    // Catches a missing preflight (the browser would block every send) or a grant to another origin.
    const shop = await call('/orders', { method: 'OPTIONS', headers: { Origin: SHOP } }) // From the shop.
    expect(shop.status).toBe(204) // No content.
    expect(shop.headers.get('Access-Control-Allow-Origin')).toBe(SHOP) // Granted.
    expect(shop.headers.get('Access-Control-Allow-Methods')).toBe('POST') // Only POST.
    expect(shop.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type') // Only Content-Type.
    expect(shop.headers.get('Access-Control-Max-Age')).toBe('86400') // A day.
    const evil = await call('/orders', { method: 'OPTIONS', headers: { Origin: 'https://evil.test' } }) // From elsewhere.
    expect(evil.status).toBe(204) // Still answered.
    expect(evil.headers.get('Access-Control-Allow-Origin')).toBeNull() // No grant.
    expect(evil.headers.get('Access-Control-Allow-Methods')).toBeNull() // No grant.
  })

  it('answers GET /orders with 405 and Allow: POST, OPTIONS', async () => {
    // Catches a read route on the order path.
    const res = await call('/orders') // A GET.
    expect(res.status).toBe(405) // Refused.
    expect(res.headers.get('Allow')).toBe('POST, OPTIONS') // What is allowed.
  })

  it('answers OPTIONS on an unknown path with 404, not 405', async () => {
    // Catches a method check that runs before the path lookup.
    const res = await call('/nope', { method: 'OPTIONS' }) // Unknown path.
    expect(res.status).toBe(404) // Path decides first.
  })

  it.each([
    ['trailing slash', `${SHOP}/`],
    ['upper-case host', 'https://KIOSTZ.GITHUB.IO'],
    ['explicit port', `${SHOP}:443`],
    ['two origins joined', `${SHOP}, https://evil.example`],
    ['a path', `${SHOP}/pem-pf-store`],
    ['empty value', ''],
    ['wildcard', '*'],
  ])('gives no CORS header to a malformed Origin: %s', async (_name, origin) => {
    // Catches prefix, case-folding, trimming or wildcard matching of the Origin.
    const res = await call('/clubs', { headers: { Origin: origin } }) // Odd caller.
    expect(res.status).toBe(200) // Body still served.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull() // No grant.
    expect(res.headers.get('Vary')).toBe('Origin') // Still varies.
  })

  it('keeps the CORS header on 404, 405 and 500 answers to the shop', async () => {
    // Catches error paths that skip the CORS context, which a browser reports as a network error.
    const headers = { Origin: SHOP } // The shop.
    expect((await call('/nope', { headers })).headers.get('Access-Control-Allow-Origin')).toBe(SHOP) // 404.
    expect((await call('/items', { method: 'POST', headers })).headers.get('Access-Control-Allow-Origin')).toBe(SHOP) // 405.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {}) // Quiet log.
    const res = await call('/settings', { headers }) // No settings row: 500.
    spy.mockRestore() // Undo the spy.
    expect(res.status).toBe(500) // Server error.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SHOP) // Still readable.
  })

  it('ignores the query string when matching a route', async () => {
    // Catches routing on the full URL, which would 404 a cache-busting shop call.
    const res = await call('/items?cb=123&x=%27%3B--') // Query with SQL-shaped text.
    expect(res.status).toBe(200) // Still the route.
    expect(await res.json()).toEqual([]) // Empty database.
  })

  it('does not decode an encoded path into a route', async () => {
    // Catches decoding before matching, which would let %2f or %69tems reach a handler.
    expect((await call('/%69tems')).status).toBe(404) // Encoded i is a different path for the router.
  })

  it('answers 429 before the 404 and 405 checks and keeps no-store JSON', async () => {
    // Catches a limiter that only guards real routes, leaving scans of unknown paths free.
    const limit = vi.fn(async () => ({ success: false })) // Always limited.
    const unknown = await call('/nope', {}, { limit }) // Unknown path.
    const post = await call('/items', { method: 'POST' }, { limit }) // Wrong method.
    expect(unknown.status).toBe(429) // Limited first.
    expect(post.status).toBe(429) // Limited first.
    expectJsonNoStore(post) // Same headers.
  })

  it('uses one shared bucket when CF-Connecting-IP is missing', async () => {
    // Catches an undefined key that would throw in the limiter or skip it.
    const limit = vi.fn(async () => ({ success: true })) // Allowed.
    await call('/clubs', {}, { limit }) // No IP header.
    expect(limit).toHaveBeenCalledWith({ key: 'unknown' }) // The shared key.
  })

  it('serves non-ASCII text in the body as valid UTF-8', async () => {
    // Catches a lost charset or mangled characters for Malay or emoji club and honor names.
    await env.DB.prepare('INSERT INTO clubs (name, area, language, location, church_name, position) VALUES (?, NULL, NULL, NULL, ?, 1)')
      .bind('Kelab Cahaya \u{1F31F}', 'Gereja Élémènt').run() // Emoji and accents.
    const res = await call('/clubs') // Read back.
    const text = await res.text() // Raw body.
    expect(JSON.parse(text)[0]).toMatchObject({ name: 'Kelab Cahaya \u{1F31F}', churchName: 'Gereja Élémènt' }) // Round trip.
  })
})
