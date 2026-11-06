// Edge tests for saving the subcategory: a double click, a tab still on the old category names, a lost answer on a clear, and a race inside a two-item save, each leaving no half write.

import { env } from 'cloudflare:workers' // The test bindings.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // The test runner.
import { BACKFILL_TIME, fullRowOf, postChanges, postTo, racingAfterRead, seedItems, wire } from './helpers' // Shared test helpers.

// The time a frozen-clock save stamps.
const NOW = '2026-11-06T09:30:15.123Z' // One known instant.
// A later instant, for the second click.
const LATER = '2026-11-06T09:30:16.456Z' // One second after NOW.
// Migration 0005's ids for two honor areas.
const NATURE = 5 // Nature.
const RECREATION = 8 // Recreation.

/**
 * Builds a database whose write lands but whose batch answer is lost.
 * @return A D1 stand-in: `prepare` passes through, `batch` runs then throws.
 */
function lostAnswerDb(): D1Database { // The answer is lost after the write.
  return { prepare: (sql: string) => env.DB.prepare(sql), batch: async (statements: D1PreparedStatement[]) => { await env.DB.batch(statements); throw new Error('lost answer') } } as unknown as D1Database // The write lands, the answer is lost.
} // End of lostAnswerDb.

beforeEach(async () => { // Fresh rows per test.
  await seedItems([ // The rows the tests change.
    { id: 'knot-tying', name: 'Knot Tying', category: 'Honors', subcategoryId: NATURE }, // An honor in Nature.
    { id: 'bare-honor', name: 'Bare Honor', category: 'Honors' }, // An honor with none.
    { id: 'test-scarf', name: 'Test Scarf', category: 'Accessories' }, // An accessory with none.
  ]) // Seeded.
  vi.useFakeTimers({ toFake: ['Date'] }) // Only Date, so D1 still runs.
  vi.setSystemTime(new Date(NOW)) // The first save's stamp.
}) // End of beforeEach.
afterEach(() => { // Cleanup.
  vi.useRealTimers() // No frozen clock leaks.
  return env.DB.exec('DELETE FROM items') // The test rows go.
}) // End of afterEach.

describe('saving the subcategory twice, as a double click does', () => { // The double click.
  it('answers the second identical save 409 with the saved row and does not stamp modified_at again', async () => { // Second click.
    // catches: a second click that answers 500, overwrites silently, or stamps a new modified_at on a row that did not change.
    const change = { changes: [{ id: 'knot-tying', subcategoryId: { from: NATURE, to: RECREATION } }] } // The save the button sends.
    expect((await postChanges(change)).status).toBe(200) // The first click saves.
    vi.setSystemTime(new Date(LATER)) // A second later.
    const second = await postChanges(change) // The second click, with the same old from.
    expect(second.status).toBe(409) // Conflict, not 500.
    expect(await second.json()).toEqual({ error: 'conflict', items: [wire({ id: 'knot-tying', name: 'Knot Tying', subcategoryId: RECREATION, subcategory: 'Recreation', modifiedAt: NOW })], deletedIds: [] }) // The row as the first click left it.
    expect((await fullRowOf('knot-tying'))!.modified_at).toBe(NOW) // Not stamped again.
  }) // End of it.
}) // End of the double click tests.

describe('a tab still on the old category names', () => { // An old admin tab.
  it('answers 409 and writes nothing when its category from is an old honor area name', async () => { // Old from.
    // catches: a stale category from of Nature accepted against a row that is now Honors, which would overwrite it.
    const res = await postChanges({ changes: [{ id: 'knot-tying', category: { from: 'Nature', to: 'Shirts' } }] }) // The old tab's change.
    expect(res.status).toBe(409) // Conflict.
    expect(await res.json()).toEqual({ error: 'conflict', items: [wire({ id: 'knot-tying', name: 'Knot Tying', subcategoryId: NATURE, subcategory: 'Nature' })], deletedIds: [] }) // The current row.
    expect(await fullRowOf('knot-tying')).toMatchObject({ category: 'Honors', subcategory_id: NATURE, modified_at: BACKFILL_TIME }) // Nothing written.
  }) // End of it.

  it('answers 400 for an Add under an old honor area name and writes no row', async () => { // Old Add.
    // catches: an Add that still accepts an honor area as its category, which would store a category the shop no longer shows.
    const res = await postTo('/api/items', { name: 'Old Tab Honor', category: 'Nature', priceCents: 400 }) // The old tab's Add body.
    expect(res.status).toBe(400) // Invalid.
    expect(await res.json()).toEqual({ error: 'invalid' }) // The usual body.
    expect(await env.DB.prepare('SELECT count(*) AS n FROM items').first('n')).toBe(3) // Still the three seeded rows.
  }) // End of it.
}) // End of the old tab tests.

describe('a lost answer on a clear', () => { // Retries.
  it('answers saved when a subcategory clear landed and its answer was lost', async () => { // Clear retry.
    // catches: a landed clear (to null) shown as a failure, because null is compared like a value that is absent.
    const res = await postTo('/api/items/changes', { changes: [{ id: 'knot-tying', subcategoryId: { from: NATURE, to: null } }] }, {}, { env: { DB: lostAnswerDb() } as unknown as Partial<Env> }) // Through the handler.
    expect(res.status).toBe(200) // Saved, not 500.
    expect((await fullRowOf('knot-tying'))!.subcategory_id).toBeNull() // Landed.
  }) // End of it.

  it('answers saved with the subcategory cleared when a category move landed and its answer was lost', async () => { // Implicit clear retry.
    // catches: a retry of a category move answered as a failure, or an answer row that still names the old subcategory.
    const res = await postTo('/api/items/changes', { changes: [{ id: 'knot-tying', category: { from: 'Honors', to: 'Shirts' } }] }, {}, { env: { DB: lostAnswerDb() } as unknown as Partial<Env> }) // Through the handler.
    expect(res.status).toBe(200) // Saved.
    expect(await res.json()).toEqual({ items: [wire({ id: 'knot-tying', name: 'Knot Tying', category: 'Shirts', subcategoryId: null, subcategory: null, modifiedAt: NOW })] }) // The row, cleared.
  }) // End of it.
}) // End of the lost answer tests.

describe('a save of two items', () => { // All or nothing.
  it('writes neither when a fitting subcategory change sits beside a misfit', async () => { // A misfit stops the other.
    // catches: the fitting change written while the misfit is refused, a half-saved list.
    const res = await postChanges({ changes: [{ id: 'knot-tying', subcategoryId: { from: NATURE, to: RECREATION } }, { id: 'test-scarf', subcategoryId: { from: null, to: NATURE } }] }) // An accessory cannot have an honor area.
    expect(res.status).toBe(409) // Conflict.
    expect(await res.json()).toEqual({ error: 'conflict', items: [wire({ id: 'test-scarf', name: 'Test Scarf', category: 'Accessories' })], deletedIds: [] }) // Only the misfit's row.
    expect(await fullRowOf('knot-tying')).toMatchObject({ subcategory_id: NATURE, modified_at: BACKFILL_TIME }) // The fitting change was not written.
  }) // End of it.

  it('writes neither when the category of the second item moves after the read', async () => { // A race inside a two-item save.
    // catches: a batch that is not all or nothing, so the first item is saved while the raced one is refused.
    const racing = racingAfterRead(/json_each/, () => env.DB.exec("UPDATE items SET category = 'Shirts' WHERE id = 'bare-honor'")) // Another admin moves the second item.
    const res = await postTo('/api/items/changes', { changes: [{ id: 'knot-tying', subcategoryId: { from: NATURE, to: RECREATION } }, { id: 'bare-honor', subcategoryId: { from: null, to: NATURE } }] }, {}, { env: { DB: racing } as unknown as Partial<Env> }) // Our save, on the racing database.
    expect(res.status).toBe(409) // Conflict, not 500.
    expect(await res.json()).toEqual({ error: 'conflict', items: [wire({ id: 'bare-honor', name: 'Bare Honor', category: 'Shirts' })], deletedIds: [] }) // The raced row as it is now.
    expect(await fullRowOf('knot-tying')).toMatchObject({ subcategory_id: NATURE, modified_at: BACKFILL_TIME }) // The first item stayed as it was.
    expect((await fullRowOf('bare-honor'))!.subcategory_id).toBeNull() // Nothing written to the raced one.
  }) // End of it.
}) // End of the two-item tests.
