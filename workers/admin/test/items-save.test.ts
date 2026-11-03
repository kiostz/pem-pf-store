// Tests the guarded save: all or nothing, refusing a stale view, and the HTTP guards around it.

import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHandler } from '../src/handler'
import { saveHonorChanges } from '../src/honors'
import { BACKFILL_TIME, call, fullRowOf, insertHonors, pages, postChanges, postTo, rowOf, seedHonors, wire } from './helpers'

beforeEach(async () => {
  await seedHonors([
    { id: 'knot-tying', name: 'Knot Tying', category: 'Outdoor', status: 'active', stock: 12 },
    { id: 'africa-lore', name: 'Africa Lore', category: 'Mission', status: 'hidden', stock: 0 },
  ])
})
afterEach(() => {
  vi.restoreAllMocks() // Spies never leak between tests.
  vi.useRealTimers() // Nor a frozen clock.
})

// The time a frozen-clock save stamps.
const NOW = '2026-11-03T09:30:15.123Z'

/**
 * Freezes the clock the Worker reads, so a save's modified time is known.
 * @return Nothing.
 */
function freezeClock(): void {
  vi.useFakeTimers({ toFake: ['Date'] }) // Only Date: D1 calls still run.
  vi.setSystemTime(new Date(NOW))
}

/**
 * Reads the honors of a save result that is a conflict or a save.
 * @param result The result.
 * @return Its honors.
 */
function honorsOf(result: Awaited<ReturnType<typeof saveHonorChanges>>) {
  if (result.kind === 'name-taken') throw new Error('unexpected name-taken') // A test bug.
  return result.honors
}

describe('POST /api/items/changes', () => {
  it('saves a stock and a status and returns the saved rows', async () => {
    // Catches a save that writes nothing, or answers with the old rows.
    freezeClock()
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
        wire({ id: 'africa-lore', name: 'Africa Lore', category: 'Mission', status: 'active', stock: 0, modifiedAt: NOW }),
        wire({ id: 'knot-tying', name: 'Knot Tying', category: 'Outdoor', status: 'active', stock: 20, modifiedAt: NOW }),
      ],
    })
    expect(await rowOf('knot-tying')).toEqual({ stock: 20, status: 'active' }) // Really stored.
    expect((await rowOf('africa-lore')).status).toBe('active')
  })

  it('refuses a stale stock with 409 and the current row, writing nothing', async () => {
    // Catches a save that overwrites a newer stock (a sale) with the admin's old view.
    const res = await postChanges({
      changes: [
        { id: 'knot-tying', stock: { from: 99, to: 5 } }, // The admin saw 99; it is 12.
        { id: 'africa-lore', status: { from: 'hidden', to: 'active' } }, // Valid beside it.
      ],
    })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: 'conflict',
      honors: [wire({ id: 'knot-tying', name: 'Knot Tying', category: 'Outdoor', status: 'active', stock: 12 })],
      deletedIds: [],
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
    const result = await saveHonorChanges(racing, NOW, [
      { id: 'knot-tying', stock: { from: 12, to: 20 } },
      { id: 'africa-lore', status: { from: 'hidden', to: 'active' } },
    ])
    expect(result.kind).toBe('conflict')
    expect(honorsOf(result)).toEqual([wire({ id: 'knot-tying', name: 'Knot Tying', category: 'Outdoor', status: 'active', stock: 3 })])
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
    const result = await saveHonorChanges(racing, NOW, [
      { id: 'knot-tying', status: { from: 'active', to: 'hidden' } },
      { id: 'africa-lore', stock: { from: 0, to: 5 } }, // Valid beside it.
    ])
    expect(result.kind).toBe('conflict')
    expect(honorsOf(result)).toEqual([wire({ id: 'knot-tying', name: 'Knot Tying', category: 'Outdoor', status: 'hidden', stock: 12 })])
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
    const result = await saveHonorChanges(blip, NOW, [
      { id: 'knot-tying', stock: { from: 12, to: 20 } },
      { id: 'africa-lore', status: { from: 'hidden', to: 'active' } },
    ])
    expect(result.kind).toBe('saved')
    expect(honorsOf(result).map((honor) => [honor.id, honor.stock, honor.status])).toEqual([
      ['africa-lore', 0, 'active'],
      ['knot-tying', 20, 'active'],
    ])
  })

  it('answers 409 with deletedIds for an id that is gone, writing nothing', async () => {
    // Catches a silent no-op UPDATE on a missing row reported as saved, or a 400 that hides another admin's delete.
    const res = await postChanges({
      changes: [
        { id: 'knot-tying', stock: { from: 12, to: 20 } },
        { id: 'no-such-honor', stock: { from: 0, to: 1 } },
      ],
    })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'conflict', honors: [], deletedIds: ['no-such-honor'] })
    expect((await rowOf('knot-tying')).stock).toBe(12)
  })

  it('rolls back to 409 with deletedIds when a row is deleted between the read and the write', async () => {
    // Catches a delete after the first read being lost: the UPDATE of a missing row changes nothing, so the rest would be written.
    const racing = {
      prepare: (sql: string) => env.DB.prepare(sql), // Reads go through.
      batch: async (statements: D1PreparedStatement[]) => {
        await env.DB.prepare('DELETE FROM honors WHERE id = ?').bind('africa-lore').run() // Another admin deletes it first.
        return env.DB.batch(statements)
      },
    } as unknown as D1Database
    const result = await saveHonorChanges(racing, NOW, [
      { id: 'knot-tying', stock: { from: 12, to: 20 } },
      { id: 'africa-lore', stock: { from: 0, to: 5 } },
    ])
    expect(result).toEqual({ kind: 'conflict', honors: [], deletedIds: ['africa-lore'] })
    expect((await rowOf('knot-tying')).stock).toBe(12) // Nothing written.
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

describe('name, category and price', () => {
  it('saves each new field and stamps modified_at, leaving created_at alone', async () => {
    // Catches a field that is validated but never written, and a save that forgets the modified time.
    freezeClock()
    const res = await postChanges({
      changes: [{ id: 'knot-tying', name: { from: 'Knot Tying', to: 'Knots' }, category: { from: 'Outdoor', to: 'Shirt' }, priceCents: { from: 400, to: 650 } }],
    })
    expect(res.status).toBe(200)
    expect(await fullRowOf('knot-tying')).toMatchObject({ name: 'Knots', category: 'Shirt', price_cents: 650, created_at: BACKFILL_TIME, modified_at: NOW })
    expect(((await res.json()) as { honors: { modifiedAt: string }[] }).honors[0].modifiedAt).toBe(NOW)
  })

  it('stamps one time on every row of one save', async () => {
    // Catches a clock read per row, which gives one save two times.
    freezeClock()
    await postChanges({ changes: [{ id: 'knot-tying', stock: { from: 12, to: 13 } }, { id: 'africa-lore', status: { from: 'hidden', to: 'active' } }] })
    expect((await fullRowOf('knot-tying'))!.modified_at).toBe(NOW)
    expect((await fullRowOf('africa-lore'))!.modified_at).toBe(NOW)
  })

  for (const [field, stale] of [['name', { from: 'Not Its Name', to: 'X' }], ['category', { from: 'Nature', to: 'Shirt' }], ['priceCents', { from: 999, to: 5 }]] as const) {
    it(`answers 409 with the current row and writes nothing when the ${field} was changed by someone else`, async () => {
      // Catches a missing per-field guard on ${field}: an old view would overwrite another admin's edit.
      freezeClock()
      const res = await postChanges({ changes: [{ id: 'knot-tying', [field]: stale, stock: { from: 12, to: 13 } }] })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: 'conflict', honors: [wire({ id: 'knot-tying', name: 'Knot Tying', category: 'Outdoor', stock: 12 })], deletedIds: [] })
      expect(await fullRowOf('knot-tying')).toMatchObject({ stock: 12, modified_at: BACKFILL_TIME }) // A 409 leaves the time alone.
    })
  }

  it('does not use modified_at as a guard: a sale moves stock without touching it', async () => {
    // Catches a guard on the time, which a sale never changes, so a stale stock would pass; and the reverse, a time-only difference blocking a save.
    await env.DB.prepare("UPDATE honors SET modified_at = '2026-11-02T00:00:00.000Z' WHERE id = 'knot-tying'").run() // Changed since the admin looked, in a field the admin is not editing.
    const res = await postChanges({ changes: [{ id: 'knot-tying', stock: { from: 12, to: 13 } }] })
    expect(res.status).toBe(200) // Per-field guards only.
  })

  it('rolls back to 409 when a name changes between the read and the write', async () => {
    // Catches the name guard being checked only at the first read.
    const racing = {
      prepare: (sql: string) => env.DB.prepare(sql),
      batch: async (statements: D1PreparedStatement[]) => {
        await env.DB.prepare("UPDATE honors SET name = 'Renamed' WHERE id = 'knot-tying'").run() // Another admin renames it.
        return env.DB.batch(statements)
      },
    } as unknown as D1Database
    const result = await saveHonorChanges(racing, NOW, [{ id: 'knot-tying', name: { from: 'Knot Tying', to: 'Knots' } }, { id: 'africa-lore', stock: { from: 0, to: 5 } }])
    expect(result.kind).toBe('conflict')
    expect((await fullRowOf('knot-tying'))!.name).toBe('Renamed')
    expect((await rowOf('africa-lore')).stock).toBe(0)
  })

  it('answers 409 name-taken for a name another item has, in any case, writing nothing', async () => {
    // Catches a rename onto an existing name, which would show two identical rows.
    const res = await postChanges({ changes: [{ id: 'knot-tying', name: { from: 'Knot Tying', to: 'africa lore' } }, { id: 'africa-lore', stock: { from: 0, to: 5 } }] })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'name-taken', ids: ['knot-tying'] })
    expect((await rowOf('africa-lore')).stock).toBe(0)
  })

  it('answers 409 name-taken with both ids for two renames to one name in one save, writing nothing', async () => {
    // Catches a 400 invalid for a case the page can reach (two rows renamed before one Save), which flags no row.
    const res = await postChanges({ changes: [{ id: 'knot-tying', name: { from: 'Knot Tying', to: 'Shared' } }, { id: 'africa-lore', name: { from: 'Africa Lore', to: 'shared' } }] })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'name-taken', ids: ['knot-tying', 'africa-lore'] })
    expect((await fullRowOf('knot-tying'))!.name).toBe('Knot Tying')
    expect((await fullRowOf('africa-lore'))!.name).toBe('Africa Lore')
  })

  it('refuses a swap of two names in one save with 409 name-taken, writing nothing', async () => {
    // Documents the ruling: the unique index is checked per statement, so a swap is refused and the admin renames through a temporary name in two saves; catches a swap that half-applies.
    const res = await postChanges({ changes: [{ id: 'knot-tying', name: { from: 'Knot Tying', to: 'Africa Lore' } }, { id: 'africa-lore', name: { from: 'Africa Lore', to: 'Knot Tying' } }] })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'name-taken', ids: ['knot-tying', 'africa-lore'] })
    expect((await fullRowOf('knot-tying'))!.name).toBe('Knot Tying')
    expect((await fullRowOf('africa-lore'))!.name).toBe('Africa Lore')
  })

  it('lets an item change only the case of its own name', async () => {
    // Catches the unique check seeing the item's own old name as a clash.
    const res = await postChanges({ changes: [{ id: 'knot-tying', name: { from: 'Knot Tying', to: 'KNOT TYING' } }] })
    expect(res.status).toBe(200)
  })

  it('gives name-taken to the later of two parallel renames to one name', async () => {
    // Catches the race the unique index exists for: both renames pass the first read.
    const [a, b] = await Promise.all([
      postChanges({ changes: [{ id: 'knot-tying', name: { from: 'Knot Tying', to: 'Shared' } }] }),
      postChanges({ changes: [{ id: 'africa-lore', name: { from: 'Africa Lore', to: 'shared' } }] }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    const taken = a.status === 409 ? a : b
    expect(((await taken.json()) as { error: string }).error).toBe('name-taken')
    const names = [(await fullRowOf('knot-tying'))!.name, (await fullRowOf('africa-lore'))!.name].map((n) => n.toLowerCase())
    expect(names.filter((n) => n === 'shared')).toHaveLength(1)
  })

  it('logs no name when a save fails', async () => {
    // Catches an item name in console.error: a name is catalogue text, but the rule is ids and classes only.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = { prepare: (sql: string) => env.DB.prepare(sql), batch: async () => { throw new Error('D1_ERROR: Knot Tying Knots') } } as unknown as D1Database
    const res = await postChanges({ changes: [{ id: 'knot-tying', name: { from: 'Knot Tying', to: 'Knots' } }] }, {}, { env: { DB: failing } })
    expect(res.status).toBe(500)
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/Knot/)
  })
})

describe('what leaves modified_at alone', () => {
  it('stamps a stock-only save and leaves rows outside the save alone', async () => {
    // Catches the time being set for rows the save did not name, or not set by a stock save.
    freezeClock()
    await postChanges({ changes: [{ id: 'knot-tying', stock: { from: 12, to: 14 } }] })
    expect((await fullRowOf('knot-tying'))!.modified_at).toBe(NOW)
    expect((await fullRowOf('africa-lore'))!.modified_at).toBe(BACKFILL_TIME) // Not in the save.
  })
})

describe('interruptions', () => {
  it('writes the value once and answers both 200 when the same save arrives twice at once', async () => {
    // Catches a double submit (two tabs, a retry racing its own first try) that applies a stock change twice, or shows the second as a conflict for an edit that did land.
    const body = { changes: [{ id: 'knot-tying', stock: { from: 12, to: 13 } }] }
    const [a, b] = await Promise.all([postChanges(body), postChanges(body)])
    expect([a.status, b.status]).toEqual([200, 200])
    expect((await rowOf('knot-tying')).stock).toBe(13) // 13, never 14
  })

  it('keeps the first admin\'s name and takes the second admin\'s price, then refuses the second admin\'s stale rename with nothing written', async () => {
    // Catches per-field guards that fail together or not at all: A renames, B (old view) sets a price, then B (old view) renames.
    expect((await postChanges({ changes: [{ id: 'knot-tying', name: { from: 'Knot Tying', to: 'Knots A' } }] })).status).toBe(200) // Tab A.
    const price = await postChanges({ changes: [{ id: 'knot-tying', priceCents: { from: 400, to: 650 } }] }) // Tab B, old view of the name, which it does not send.
    expect(price.status).toBe(200)
    expect(await fullRowOf('knot-tying')).toMatchObject({ name: 'Knots A', price_cents: 650 }) // Both survive.
    const stamped = (await fullRowOf('knot-tying'))!.modified_at
    const rename = await postChanges({ changes: [{ id: 'knot-tying', name: { from: 'Knot Tying', to: 'Knots B' } }] }) // Tab B, still the old name.
    expect(rename.status).toBe(409)
    expect(((await rename.json()) as { honors: { name: string }[] }).honors[0].name).toBe('Knots A') // The latest values for the flag.
    expect(await fullRowOf('knot-tying')).toMatchObject({ name: 'Knots A', modified_at: stamped }) // Nothing written, time unmoved.
  })

  it('answers 409 with deletedIds and writes nothing else when another admin deleted one of the rows', async () => {
    // Catches a save that applies the live rows and skips the deleted one, leaving the admin to think all saved.
    await insertHonors([{ id: 'camp-shirt', name: 'Camp Shirt', issuedBy: 'Club', stock: 0 }])
    expect((await postTo('/api/items/delete', { id: 'camp-shirt', seen: { name: 'Camp Shirt', category: 'Nature', priceCents: 400, status: 'active', stock: 0, modifiedAt: BACKFILL_TIME } })).status).toBe(200) // Tab A deletes.
    const res = await postChanges({ changes: [{ id: 'knot-tying', stock: { from: 12, to: 13 } }, { id: 'camp-shirt', stock: { from: 0, to: 5 } }] }) // Tab B, old view.
    expect(res.status).toBe(409)
    expect(((await res.json()) as { deletedIds: string[] }).deletedIds).toEqual(['camp-shirt'])
    expect((await rowOf('knot-tying')).stock).toBe(12) // The live row was not written either.
  })
})
