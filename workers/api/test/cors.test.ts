// CORS tests: only the exact shop origin gets the header; everyone else still gets the body.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { call } from './helpers'

describe('cors', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM items') // Known empty body.
  })

  it('allows the exact shop origin and varies on Origin', async () => {
    // Catches a missing header or a missing Vary.
    const res = await call('/items', { headers: { Origin: 'https://kiostz.github.io' } }) // The shop.
    expect(res.status).toBe(200) // Success.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://kiostz.github.io') // Exact echo.
    expect(res.headers.get('Vary')).toBe('Origin') // Caches must key on Origin.
  })

  it.each([
    ['http scheme', 'http://kiostz.github.io'],
    ['suffix host', 'https://kiostz.github.io.evil.example'],
    ['null origin', 'null'],
    ['other site', 'https://evil.example'],
  ])('gives no header to %s but still the body', async (_name, origin) => {
    // Catches prefix matching or wildcard use.
    const res = await call('/items', { headers: { Origin: origin } }) // A foreign caller.
    expect(res.status).toBe(200) // Body still served.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull() // No CORS grant.
    expect(res.headers.get('Vary')).toBe('Origin') // Still varies.
    expect(await res.json()).toEqual([]) // Empty database body.
  })

  it('gives no header without an Origin', async () => {
    // Catches defaulting to the shop origin.
    const res = await call('/items') // No Origin header.
    expect(res.status).toBe(200) // Success.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull() // No grant.
  })

  it('keeps the CORS header on a 429 so the shop can read it', async () => {
    // Catches a rate-limit answer the browser reports as a network error.
    const res = await call('/items', { headers: { Origin: 'https://kiostz.github.io' } }, { limit: async () => ({ success: false }) }) // Limiter says no.
    expect(res.status).toBe(429) // Limited.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://kiostz.github.io') // Readable by the shop.
  })
})
