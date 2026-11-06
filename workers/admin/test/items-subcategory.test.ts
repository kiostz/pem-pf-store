// Tests the subcategory in the Admin API: reads carry it, a save sets, clears or refuses it with nothing written, a category change clears a misfit, and Add checks it.

import { env } from 'cloudflare:workers' // The test bindings.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // The test runner.
import { BACKFILL_TIME, call, fullRowOf, postChanges, postTo, racingAfterRead, seedItems, wire } from './helpers' // Shared test helpers.

// The time a frozen-clock save stamps.
const NOW = '2026-11-06T09:30:15.123Z' // One known instant.
// Migration 0005's ids for two honor areas.
const NATURE = 5 // Nature.
const RECREATION = 8 // Recreation.
// A Shirts subcategory the tests add themselves.
const YOUTH = 20 // Not in the migration.

beforeEach(async () => { // Fresh rows per test.
  await seedItems([]) // No items, so no foreign key holds a subcategory.
  await env.DB.exec("DELETE FROM subcategories WHERE id >= 20; INSERT INTO subcategories (id, category, name) VALUES (20, 'Shirts', 'Youth')") // One Shirts subcategory beside the nine.
  await seedItems([ // The rows the tests change.
    { id: 'knot-tying', name: 'Knot Tying', category: 'Honors', subcategoryId: NATURE }, // An honor in Nature.
    { id: 'bare-honor', name: 'Bare Honor', category: 'Honors' }, // An honor with none.
    { id: 'camp-shirt', name: 'Camp Shirt', category: 'Shirts' }, // A shirt with none.
    { id: 'test-scarf', name: 'Test Scarf', category: 'Accessories' }, // An accessory with none.
  ]) // Seeded.
  vi.useFakeTimers({ toFake: ['Date'] }) // Only Date, so D1 still runs.
  vi.setSystemTime(new Date(NOW)) // The save's stamp.
}) // End of beforeEach.
afterEach(() => { // Cleanup.
  vi.useRealTimers() // No frozen clock leaks.
  return env.DB.exec('DELETE FROM items; DELETE FROM subcategories WHERE id >= 20') // The test rows go.
}) // End of afterEach.

/**
 * Reads an item's stored subcategory and modified time.
 * @param id The item id.
 * @return The stored subcategory id and modified_at.
 */
async function stored(id: string): Promise<{ subcategory_id: number | null; modified_at: string }> { // Straight from D1.
  return (await env.DB.prepare('SELECT subcategory_id, modified_at FROM items WHERE id = ?').bind(id).first())! // The row exists.
} // End of stored.

/**
 * Reads the JSON body of a response.
 * @param res The response.
 * @return The parsed body.
 */
async function bodyOf(res: Response): Promise<Record<string, unknown>> { // The JSON.
  return (await res.json()) as Record<string, unknown> // An object body.
} // End of bodyOf.

describe('reads carry the subcategory', () => { // The read side.
  it('lists subcategoryId and its name for an honor, and null for an accessory', async () => { // The list.
    // catches: a read that leaves out the subcategory or joins its name wrongly, so the picker shows nothing.
    const res = await call('/api/items?sort=name') // The first page.
    const items = ((await bodyOf(res)).items as Array<Record<string, unknown>>) // The rows.
    expect(items.find((item) => item.id === 'knot-tying')).toMatchObject({ subcategoryId: NATURE, subcategory: 'Nature' }) // The honor.
    expect(items.find((item) => item.id === 'test-scarf')).toMatchObject({ subcategoryId: null, subcategory: null }) // The accessory.
  }) // End of it.

  it('filters the list by category Honors and refuses the old name Nature', async () => { // The filter.
    // catches: a filter that still takes an old category name, or one that ignores Honors.
    const honors = ((await bodyOf(await call('/api/items?category=Honors'))).items as Array<{ id: string }>).map((item) => item.id) // The ids.
    expect(honors).toEqual(['bare-honor', 'knot-tying']) // Both honors, A-Z.
    expect((await call('/api/items?category=Nature')).status).toBe(400) // An old name.
    expect((await call('/api/items?category=Shirt')).status).toBe(400) // The singular.
  }) // End of it.
}) // End of the read tests.

describe('a save of the subcategory', () => { // The save side.
  it('sets a fitting subcategory, answers its name and stamps modified_at', async () => { // The happy path.
    // catches: a save that writes the id but not modified_at, or answers the old name.
    const res = await postChanges({ changes: [{ id: 'knot-tying', subcategoryId: { from: NATURE, to: RECREATION } }] }) // Nature to Recreation.
    expect(res.status).toBe(200) // Saved.
    expect(await res.json()).toEqual({ items: [wire({ id: 'knot-tying', name: 'Knot Tying', subcategoryId: RECREATION, subcategory: 'Recreation', modifiedAt: NOW })] }) // The saved row.
    expect(await stored('knot-tying')).toEqual({ subcategory_id: RECREATION, modified_at: NOW }) // Really stored.
  }) // End of it.

  it('clears the subcategory with to null', async () => { // The clear.
    // catches: a clear that is refused as a bad id, or leaves the old id behind.
    const res = await postChanges({ changes: [{ id: 'knot-tying', subcategoryId: { from: NATURE, to: null } }] }) // Clear.
    expect(res.status).toBe(200) // Saved.
    expect((await stored('knot-tying')).subcategory_id).toBeNull() // Cleared.
  }) // End of it.

  it('answers 409 conflict with the current row when from is stale', async () => { // Another admin moved it.
    // catches: a save that overwrites a subcategory another admin changed.
    const res = await postChanges({ changes: [{ id: 'knot-tying', subcategoryId: { from: RECREATION, to: 1 } }] }) // The admin saw Recreation.
    expect(res.status).toBe(409) // Conflict.
    expect(await res.json()).toEqual({ error: 'conflict', items: [wire({ id: 'knot-tying', name: 'Knot Tying', subcategoryId: NATURE, subcategory: 'Nature' })], deletedIds: [] }) // The current row.
    expect((await stored('knot-tying')).subcategory_id).toBe(NATURE) // Unchanged.
  }) // End of it.

  it('answers 409 conflict with the full current row, subcategory included, when a stock from is stale', async () => { // The stock path.
    // catches: a conflict row on the stock path that drops subcategoryId and subcategory, so the page reloads it without its subcategory.
    const res = await postChanges({ changes: [{ id: 'knot-tying', stock: { from: 99, to: 1 } }] }) // The admin saw 99, the row holds 0.
    expect(res.status).toBe(409) // Conflict.
    expect(await res.json()).toEqual({ error: 'conflict', items: [wire({ id: 'knot-tying', name: 'Knot Tying', category: 'Honors', stock: 0, subcategoryId: NATURE, subcategory: 'Nature' })], deletedIds: [] }) // The full current row.
    expect((await stored('knot-tying')).subcategory_id).toBe(NATURE) // Nothing written.
  }) // End of it.

  it('answers 409 conflict for a subcategory of another category or an unknown id, writing nothing in the same save', async () => { // Misfits.
    // catches: a Shirts subcategory stored on an honor, a dangling id, or a partial write of the other items.
    for (const to of [YOUTH, 999]) { // Another category's id, then an unknown one.
      const res = await postChanges({ changes: [{ id: 'bare-honor', subcategoryId: { from: null, to } }, { id: 'test-scarf', status: { from: 'active', to: 'hidden' } }] }) // Two items in one save.
      expect(res.status, String(to)).toBe(409) // Conflict.
      expect(await res.json(), String(to)).toEqual({ error: 'conflict', items: [wire({ id: 'bare-honor', name: 'Bare Honor' })], deletedIds: [] }) // Only the misfit's current row.
      expect((await stored('bare-honor')).subcategory_id, String(to)).toBeNull() // Unchanged.
      expect((await fullRowOf('test-scarf'))!.status, String(to)).toBe('active') // The other item stayed unwritten.
    } // End of loop.
  }) // End of it.

  it('clears the subcategory when the category changes without a subcategory change', async () => { // Honors to Shirts.
    // catches: a Shirts item that still reads "Nature", or a category change blocked by its old subcategory.
    const res = await postChanges({ changes: [{ id: 'knot-tying', category: { from: 'Honors', to: 'Shirts' } }] }) // Honors to Shirts.
    expect(res.status).toBe(200) // Saved.
    expect(await res.json()).toEqual({ items: [wire({ id: 'knot-tying', name: 'Knot Tying', category: 'Shirts', subcategoryId: null, subcategory: null, modifiedAt: NOW })] }) // Cleared.
  }) // End of it.

  it('leaves NULL alone on a category-only move from Shirts to Honors, and keeps it on a stock-only save', async () => { // NULL stays NULL.
    // catches: a category-only move that invents a subcategory, or a stock-only save that clears one.
    expect((await postChanges({ changes: [{ id: 'camp-shirt', category: { from: 'Shirts', to: 'Honors' } }] })).status).toBe(200) // Shirts to Honors.
    expect((await stored('camp-shirt')).subcategory_id).toBeNull() // Still none.
    expect((await postChanges({ changes: [{ id: 'knot-tying', stock: { from: 0, to: 4 } }] })).status).toBe(200) // A stock-only save.
    expect((await stored('knot-tying')).subcategory_id).toBe(NATURE) // Kept.
  }) // End of it.

  it('keeps a subcategory that still fits the new category when only the category is saved', async () => { // The THEN arm of the clear.
    // catches: a clear that is unconditional, which would drop a fitting subcategory on every category save.
    await seedItems([{ id: 'odd-shirt', name: 'Odd Shirt', category: 'Shirts', subcategoryId: NATURE }]) // A mismatched pair, as hand SQL may leave one.
    const res = await postChanges({ changes: [{ id: 'odd-shirt', category: { from: 'Shirts', to: 'Honors' } }] }) // Category only, to where Nature fits.
    expect(res.status).toBe(200) // Saved.
    expect((await stored('odd-shirt')).subcategory_id).toBe(NATURE) // Kept.
  }) // End of it.

  it('saves a category change together with a subcategory of the new category', async () => { // Both in one change.
    // catches: a belongs check against the old category, which would refuse a valid move.
    const res = await postChanges({ changes: [{ id: 'knot-tying', category: { from: 'Honors', to: 'Shirts' }, subcategoryId: { from: NATURE, to: YOUTH } }] }) // Move and set.
    expect(res.status).toBe(200) // Saved.
    expect(await stored('knot-tying')).toMatchObject({ subcategory_id: YOUTH }) // The new one.
    expect(((await bodyOf(res)).items as Array<Record<string, unknown>>)[0]).toMatchObject({ category: 'Shirts', subcategory: 'Youth' }) // The row says so.
  }) // End of it.

  it('answers 409 for a category change together with a subcategory that does not fit it', async () => { // Both, but a misfit.
    // catches: a belongs check that ignores the category being saved in the same change.
    const res = await postChanges({ changes: [{ id: 'knot-tying', category: { from: 'Honors', to: 'Shirts' }, subcategoryId: { from: NATURE, to: RECREATION } }] }) // Recreation is an honor area.
    expect(res.status).toBe(409) // Conflict.
    expect(await res.json()).toEqual({ error: 'conflict', items: [wire({ id: 'knot-tying', name: 'Knot Tying', subcategoryId: NATURE, subcategory: 'Nature' })], deletedIds: [] }) // The current row, not name-taken.
    expect(await fullRowOf('knot-tying')).toMatchObject({ category: 'Honors', subcategory_id: NATURE }) // Nothing written.
  }) // End of it.

  it('answers saved when the write landed but its answer was lost', async () => { // allApplied.
    // catches: a landed save shown as a failure after a lost batch answer.
    /** A database whose write lands but whose batch answer is lost: `prepare` passes through, `batch` runs then throws. */
    const lost = { prepare: (sql: string) => env.DB.prepare(sql), batch: async (statements: D1PreparedStatement[]) => { await env.DB.batch(statements); throw new Error('lost answer') } } as unknown as D1Database // The write lands, the answer is lost.
    const res = await postTo('/api/items/changes', { changes: [{ id: 'knot-tying', subcategoryId: { from: NATURE, to: RECREATION } }] }, {}, { env: { DB: lost } as unknown as Partial<Env> }) // Through the handler.
    expect(res.status).toBe(200) // Saved, not 500.
    expect((await stored('knot-tying')).subcategory_id).toBe(RECREATION) // Landed.
  }) // End of it.

  it('answers 409 conflict, not 500, when the category moves between the read and the write', async () => { // The race.
    // catches: a belongs check that only runs before the write, so a lost race surfaces as a 500.
    const racing = racingAfterRead(/json_each/, () => env.DB.exec("UPDATE items SET category = 'Shirts' WHERE id = 'bare-honor'")) // Another admin moves it after the read.
    const res = await postTo('/api/items/changes', { changes: [{ id: 'bare-honor', subcategoryId: { from: null, to: NATURE } }] }, {}, { env: { DB: racing } as unknown as Partial<Env> }) // Our save, on the racing database.
    expect(res.status).toBe(409) // Conflict.
    expect(await res.json()).toEqual({ error: 'conflict', items: [wire({ id: 'bare-honor', name: 'Bare Honor', category: 'Shirts' })], deletedIds: [] }) // The row as the race left it.
    expect(await fullRowOf('bare-honor')).toMatchObject({ category: 'Shirts', subcategory_id: null }) // Nothing written.
  }) // End of it.

  it('refuses the old names Shirt and Nature as a category to', async () => { // Validation.
    // catches: the old category names still accepted after the rename.
    for (const to of ['Shirt', 'Nature']) expect((await postChanges({ changes: [{ id: 'bare-honor', category: { from: 'Honors', to } }] })).status, to).toBe(400) // Each is refused.
  }) // End of it.
}) // End of the save tests.

describe('POST /api/items with a subcategory', () => { // The Add side.
  /**
   * Posts an Add.
   * @param over Fields that differ from a valid Test Cap in Shirts.
   * @return The response.
   */
  const add = (over: Record<string, unknown> = {}) => postTo('/api/items', { name: 'Test Cap', category: 'Shirts', priceCents: 400, ...over }) // The Add request.

  it('adds with a fitting subcategoryId and answers it with its name', async () => { // The happy path.
    // catches: an Add that drops the subcategory the sheet sent.
    const res = await add({ subcategoryId: YOUTH }) // A Shirts subcategory.
    expect(res.status).toBe(201) // Created.
    expect(await res.json()).toEqual({ item: wire({ id: 'test-cap', name: 'Test Cap', category: 'Shirts', subcategoryId: YOUTH, subcategory: 'Youth', status: 'hidden', clubAdded: true, createdAt: NOW, modifiedAt: NOW }) }) // The new row.
  }) // End of it.

  it('answers 400 and writes no row for a subcategory that does not fit or does not exist', async () => { // Misfits.
    // catches: an Add that stores a mismatched pair or answers 500 on the foreign key.
    for (const subcategoryId of [NATURE, 999]) { // Another category's, then unknown.
      const res = await add({ subcategoryId }) // The request.
      expect(res.status, String(subcategoryId)).toBe(400) // Invalid.
      expect(await res.json(), String(subcategoryId)).toEqual({ error: 'invalid' }) // The usual body.
      expect(await fullRowOf('test-cap'), String(subcategoryId)).toBeNull() // No row.
    } // End of loop.
  }) // End of it.

  it('stores null when subcategoryId is absent, and refuses the old name Shirt', async () => { // The defaults.
    // catches: an absent field read as 0 or undefined, or the singular name still accepted.
    expect((await add()).status).toBe(201) // No subcategory.
    expect((await fullRowOf('test-cap'))!.subcategory_id).toBeNull() // Null.
    expect((await add({ name: 'Other Cap', category: 'Shirt' })).status).toBe(400) // The old name.
  }) // End of it.
}) // End of the Add tests.

describe('Delete with a subcategory', () => { // The delete side.
  it('still deletes a Club-added item that has a subcategory, with the same guard', async () => { // Delete is unchanged.
    // catches: a delete broken by the foreign key, or a guard that now wants the subcategory.
    await seedItems([{ id: 'club-honor', name: 'Club Honor', issuedBy: 'Club', subcategoryId: NATURE, modifiedAt: BACKFILL_TIME }]) // A Club-added honor.
    const res = await postTo('/api/items/delete', { id: 'club-honor', seen: { name: 'Club Honor', category: 'Honors', priceCents: 400, status: 'active', stock: 0, modifiedAt: BACKFILL_TIME } }) // As the page sends.
    expect(res.status).toBe(200) // Deleted.
    expect(await fullRowOf('club-honor')).toBeNull() // Gone.
  }) // End of it.
}) // End of the Delete tests.
