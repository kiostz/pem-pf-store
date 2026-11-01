// Tests the guarded save: all or nothing, refusing a stale view, and the HTTP guards around it.

import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHandler } from '../src/handler'
import { saveHonorChanges } from '../src/honors'
import { call, pages, postChanges, rowOf, seedHonors } from './helpers'

beforeEach(async () => {
  await seedHonors([
    { id: 'knot-tying', name: 'Knot Tying', category: 'Outdoor', status: 'active', stock: 12 },
    { id: 'africa-lore', name: 'Africa Lore', category: 'Mission', status: 'hidden', stock: 0 },
  ])
})
afterEach(() => vi.restoreAllMocks()) // Spies never leak between tests.

describe('POST /api/items/changes', () => {
  it('saves a stock and a status and returns the saved rows', async () => {
    // Catches a save that writes nothing, or answers with the old rows.
    const res = await postChanges({
      changes: [
        { id: 'knot-tying', stock: { from: 12, to: 20 } },
        { id: 'africa-lore', status: { from: 'hidden', to: 'active' } },
      ],
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({
      honors: [
        { id: 'africa-lore', name: 'Africa Lore', category: 'Mission', status: 'active', stock: 0 },
        { id: 'knot-tying', name: 'Knot Tying', category: 'Outdoor', status: 'active', stock: 20 },
      ],
    })
    expect(await rowOf('knot-tying')).toEqual({ stock: 20, status: 'active' }) // Really stored.
    expect((await rowOf('africa-lore')).status).toBe('active')
  })

  it('refuses a stale stock with 409 and the current row, writing nothing', async () => {
    // Catches a save that overwrites a newer stock (a Task 10 sale) with the admin's old view.
    const res = await postChanges({
      changes: [
        { id: 'knot-tying', stock: { from: 99, to: 5 } }, // The admin saw 99; it is 12.
        { id: 'africa-lore', status: { from: 'hidden', to: 'active' } }, // Valid beside it.
      ],
    })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: 'conflict',
      honors: [{ id: 'knot-tying', name: 'Knot Tying', category: 'Outdoor', status: 'active', stock: 12 }],
    })
    expect(await rowOf('knot-tying')).toEqual({ stock: 12, status: 'active' }) // Untouched.
    expect((await rowOf('africa-lore')).status).toBe('hidden') // The valid change was not written either.
  })

  it('refuses a stale status with 409 and writes nothing', async () => {
    // Catches a status save that skips the per-field check.
    const res = await postChanges({
      changes: [
        { id: 'africa-lore', status: { from: 'active', to: 'hidden' } }, // It is already hidden.
        { id: 'knot-tying', stock: { from: 12, to: 13 } },
      ],
    })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { honors: { id: string }[] }).honors.map((h) => h.id)).toEqual(['africa-lore'])
    expect((await rowOf('knot-tying')).stock).toBe(12)
  })

  it('rolls back to 409 when a row changes between the read and the write', async () => {
    // Catches a read-then-write race: a sale landing after the check must not be overwritten.
    const racing = {
      prepare: (sql: string) => env.DB.prepare(sql), // Reads go through.
      batch: async (statements: D1PreparedStatement[]) => {
        await env.DB.prepare('UPDATE honors SET stock = 3 WHERE id = ?').bind('knot-tying').run() // A sale lands first.
        return env.DB.batch(statements)
      },
    } as unknown as D1Database
    const result = await saveHonorChanges(racing, [
      { id: 'knot-tying', stock: { from: 12, to: 20 } },
      { id: 'africa-lore', status: { from: 'hidden', to: 'active' } },
    ])
    expect(result.kind).toBe('conflict')
    expect(result.honors).toEqual([{ id: 'knot-tying', name: 'Knot Tying', category: 'Outdoor', status: 'active', stock: 3 }])
    expect(await rowOf('knot-tying')).toEqual({ stock: 3, status: 'active' }) // The sale stands.
    expect((await rowOf('africa-lore')).status).toBe('hidden') // The whole batch rolled back.
  })

  it('rolls back to 409 when a status changes between the read and the write', async () => {
    // Catches a status guard that overwrites another tab's status change after the first read.
    const racing = {
      prepare: (sql: string) => env.DB.prepare(sql), // Reads go through.
      batch: async (statements: D1PreparedStatement[]) => {
        await env.DB.prepare("UPDATE honors SET status = 'hidden' WHERE id = ?").bind('knot-tying').run() // Another tab hides it first.
        return env.DB.batch(statements)
      },
    } as unknown as D1Database
    const result = await saveHonorChanges(racing, [
      { id: 'knot-tying', status: { from: 'active', to: 'hidden' } },
      { id: 'africa-lore', stock: { from: 0, to: 5 } }, // Valid beside it.
    ])
    expect(result.kind).toBe('conflict')
    expect(result.honors).toEqual([{ id: 'knot-tying', name: 'Knot Tying', category: 'Outdoor', status: 'hidden', stock: 12 }])
    expect((await rowOf('africa-lore')).stock).toBe(0) // The whole batch rolled back.
  })

  it('rethrows a batch failure that moved no row, so the page gets 500 and nothing is written', async () => {
    // Catches a failed write reported as saved, or as a conflict with nothing flagged.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = {
      prepare: (sql: string) => env.DB.prepare(sql), // Reads go through.
      batch: async () => {
        throw new Error('D1_ERROR: network lost') // Fails before writing.
      },
    } as unknown as D1Database
    const res = await postChanges({ changes: [{ id: 'knot-tying', stock: { from: 12, to: 20 } }] }, {}, { env: { DB: failing } })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'server' })
    expect(await rowOf('knot-tying')).toEqual({ stock: 12, status: 'active' }) // Untouched.
  })

  it('counts a batch that committed but threw on the way back as saved', async () => {
    // Catches a network blip after a good write being shown as a conflict with the admin's own values.
    const blip = {
      prepare: (sql: string) => env.DB.prepare(sql), // Reads go through.
      batch: async (statements: D1PreparedStatement[]) => {
        await env.DB.batch(statements) // The write lands...
        throw new Error('D1_ERROR: connection reset') // ...but the answer is lost.
      },
    } as unknown as D1Database
    const result = await saveHonorChanges(blip, [
      { id: 'knot-tying', stock: { from: 12, to: 20 } },
      { id: 'africa-lore', status: { from: 'hidden', to: 'active' } },
    ])
    expect(result.kind).toBe('saved')
    expect(result.honors.map((honor) => [honor.id, honor.stock, honor.status])).toEqual([
      ['africa-lore', 0, 'active'],
      ['knot-tying', 20, 'active'],
    ])
  })

  it('answers 400 invalid for an unknown id and writes nothing', async () => {
    // Catches a silent no-op UPDATE on a missing row reported as saved.
    const res = await postChanges({
      changes: [
        { id: 'knot-tying', stock: { from: 12, to: 20 } },
        { id: 'no-such-honor', stock: { from: 0, to: 1 } },
      ],
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid' })
    expect((await rowOf('knot-tying')).stock).toBe(12)
  })

  it('refuses a foreign or missing Origin with 403', async () => {
    // Catches a cross-site page saving as the signed-in admin.
    const body = { changes: [{ id: 'knot-tying', stock: { from: 12, to: 20 } }] }
    const foreign = await postChanges(body, { headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' } })
    expect(foreign.status).toBe(403)
    expect(await foreign.json()).toEqual({ error: 'forbidden' })
    const missing = await postChanges(body, { headers: { 'Content-Type': 'application/json' } })
    expect(missing.status).toBe(403)
    expect((await rowOf('knot-tying')).stock).toBe(12)
  })

  it('refuses a non-JSON content type with 415', async () => {
    // Catches a text/plain form post (no preflight) being accepted.
    const res = await postChanges(
      { changes: [{ id: 'knot-tying', stock: { from: 12, to: 20 } }] },
      { headers: { Origin: 'https://admin.test', 'Content-Type': 'text/plain' } },
    )
    expect(res.status).toBe(415)
    expect(await res.json()).toEqual({ error: 'json-only' })
    expect((await rowOf('knot-tying')).stock).toBe(12)
  })

  it('refuses a body over 64 KB with 413', async () => {
    // Catches an unbounded body read.
    const res = await postChanges({ pad: 'x'.repeat(70 * 1024) })
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'too-large' })
  })

  it('refuses a declared Content-Length over 64 KB with 413 before reading', async () => {
    // Catches a body-size check that trusts only the stream and ignores the declared length.
    const res = await postChanges({ changes: [] }, { headers: { Origin: 'https://admin.test', 'Content-Type': 'application/json', 'Content-Length': String(70 * 1024) } })
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'too-large' })
  })

  it('refuses broken JSON and a body that fails validation with 400', async () => {
    // Catches a thrown SyntaxError becoming a 500 or an accepted loose shape.
    const broken = await call('/api/items/changes', {
      method: 'POST',
      headers: { Origin: 'https://admin.test', 'Content-Type': 'application/json' },
      body: '{"changes": [',
    })
    expect(broken.status).toBe(400)
    expect(await broken.json()).toEqual({ error: 'invalid' })
    const stockText = await postChanges({ changes: [{ id: 'knot-tying', stock: { from: 12, to: '20' } }] })
    expect(stockText.status).toBe(400)
  })

  it('answers 500 server with no SQL text when D1 fails, and logs neither body nor email', async () => {
    // Catches a leaked SQL error, or personal data and the request body reaching the logs.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = {
      prepare: () => {
        throw new Error('D1_ERROR: SELECT secret FROM honors admin@example.test')
      },
    } as unknown as D1Database
    const res = await postChanges(
      { changes: [{ id: 'knot-tying', stock: { from: 12, to: 20 } }] },
      {},
      { env: { DB: broken } },
    )
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ error: 'server' })
    expect(text).not.toMatch(/SELECT|D1_ERROR/)
    const logged = JSON.stringify(spy.mock.calls)
    expect(spy).toHaveBeenCalled() // The failure is logged...
    expect(logged).toContain('Error') // ...by class...
    expect(logged).not.toMatch(/admin@example|knot-tying|SELECT|secret/) // ...never by content.
  })

  it('answers 403 and logs the error class only when the identity lookup throws', async () => {
    // Catches an identity failure that opens the gate, or an email-bearing error reaching the logs.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ctx = {
      waitUntil: () => {},
      passThroughOnException: () => {},
      props: {},
      access: {
        aud: 'local-dev',
        getIdentity: async () => {
          throw new TypeError('lookup failed for admin@example.test')
        },
      },
    } as unknown as ExecutionContext
    const request = new Request('https://admin.test/api/items')
    const res = await createHandler(pages)(request as Parameters<ReturnType<typeof createHandler>>[0], { ...env, ACCESS_AUD: 'local-dev', ADMIN_EMAILS: 'admin@example.test' }, ctx)
    expect(res.status).toBe(403)
    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).toContain('TypeError') // Class only...
    expect(logged).not.toMatch(/admin@example|lookup failed/) // ...never the email.
  })
})
