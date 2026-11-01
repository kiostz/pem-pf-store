// Error and rate-limit tests: short codes only, no-store JSON everywhere, 429 past the limit, reads kept up when the limiter fails.

import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import { call, expectJsonNoStore } from './helpers'

describe('errors', () => {
  it('answers 404 not-found for an unknown path and for /items/', async () => {
    // Catches loose path matching.
    for (const path of ['/nope', '/items/', '/']) {
      const res = await call(path) // Not an exact route.
      expect(res.status).toBe(404) // Unknown.
      expect(await res.json()).toEqual({ error: 'not-found' }) // Short code only.
      expectJsonNoStore(res) // Errors are no-store JSON too.
    }
  })

  it('answers 405 with Allow: GET for POST', async () => {
    // Catches a write route appearing early or a missing Allow header.
    const res = await call('/items', { method: 'POST', body: '{}' }) // A write attempt.
    expect(res.status).toBe(405) // Refused.
    expect(res.headers.get('Allow')).toBe('GET') // Says what is allowed.
    expect(await res.json()).toEqual({ error: 'method-not-allowed' }) // Short code only.
    expectJsonNoStore(res) // No-store JSON.
  })

  it('answers 500 server when the settings row is missing', async () => {
    // Catches a null-dereference crash or an invented default currency.
    await env.DB.exec('DELETE FROM settings') // No row.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {}) // Keep test output clean.
    const res = await call('/settings') // Needs the row.
    expect(res.status).toBe(500) // Server error.
    expect(await res.json()).toEqual({ error: 'server' }) // Short code only.
    expectJsonNoStore(res) // No-store JSON.
    spy.mockRestore() // Undo the spy.
  })

  it('answers 500 server with no SQL text when a table is gone, and logs only route and error name', async () => {
    // Catches SQL or driver messages leaking into the body or the log.
    await env.DB.exec('DROP TABLE order_lines; DROP TABLE honors') // Break the read.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {}) // Capture what is logged.
    const res = await call('/items') // Hits the missing table.
    expect(res.status).toBe(500) // Server error.
    expect(await res.text()).toBe('{"error":"server"}') // Exactly the short code.
    expectJsonNoStore(res) // No-store JSON.
    const logged = JSON.stringify(spy.mock.calls) // Everything logged.
    expect(logged).not.toMatch(/honors|SELECT|no such table/i) // No SQL or table names.
    expect(logged).toContain('/items') // Route is logged.
    spy.mockRestore() // Undo the spy.
  })

  it('answers 429 rate-limited past the limit without touching D1, keyed on the client IP', async () => {
    // Catches a missing limiter, a wrong key, or a limited request still reaching D1 (a dropped table would give 500).
    await env.DB.exec('DROP TABLE IF EXISTS honors') // A D1 read would now answer 500 (may already be gone).
    const limit = vi.fn(async () => ({ success: false })) // Always over the limit.
    const res = await call('/items', { headers: { 'CF-Connecting-IP': '203.0.113.9' } }, { limit }) // From one IP.
    expect(res.status).toBe(429) // Limited, not 500.
    expect(await res.json()).toEqual({ error: 'rate-limited' }) // Short code only.
    expect(res.headers.get('Retry-After')).toBe('60') // Window length.
    expectJsonNoStore(res) // No-store JSON.
    expect(limit).toHaveBeenCalledWith({ key: '203.0.113.9' }) // Keyed on the IP.
  })

  it('lets requests through while the limiter allows them', async () => {
    // Catches a limiter that blocks by default.
    const limit = vi.fn(async () => ({ success: true })) // Always allowed.
    expect((await call('/clubs', {}, { limit })).status).toBe(200) // Served.
  })

  it('serves the read when the limiter itself throws and logs only the error name', async () => {
    // Catches a limiter outage taking the whole shop down.
    const limit = vi.fn(async (): Promise<{ success: boolean }> => {
      throw new TypeError('secret-limiter-detail') // A failing binding.
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {}) // Capture what is logged.
    const res = await call('/clubs', {}, { limit }) // Read with a broken limiter.
    expect(res.status).toBe(200) // Fails open.
    expect(await res.json()).toEqual([]) // Real body, empty database.
    const logged = JSON.stringify(spy.mock.calls) // Everything logged.
    expect(logged).toContain('TypeError') // Error name only.
    expect(logged).not.toContain('secret-limiter-detail') // Never the message.
    spy.mockRestore() // Undo the spy.
  })
})
