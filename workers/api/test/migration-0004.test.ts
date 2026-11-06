// Migration 0004 tests: old-schema data (migrations 0001-0003) goes through the honors-to-items and orders rebuild without losing a row, a line or a line's order.

import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

// The empty database these tests migrate by hand.
const db = env.MIGRATION_DB
// Migrations before and after the rebuild.
const OLD = env.TEST_MIGRATIONS.slice(0, 3)
const REBUILD = env.TEST_MIGRATIONS.slice(3, 4) // Only 0004; later migrations are tested in their own files.

/** Drops every table so each test starts from an empty database. */
async function reset(): Promise<void> {
  for (const table of ['order_lines', 'orders', 'honors', 'items', 'subcategories', 'clubs', 'settings', 'd1_migrations', 'orders_copy', 'order_lines_copy']) // Children first.
    await db.exec(`DROP TABLE IF EXISTS ${table}`) // Children first, so no cascade runs.
}

/**
 * Seeds the old schema: 4 honors, 4 orders and their lines.
 * @param buyerPhone The phone of order 4; null makes the migration refuse.
 */
async function seed(buyerPhone: string | null = '0123'): Promise<void> {
  /** Builds one honors INSERT. @param id Row id. @param name Name. @param status active or hidden. @param image Picture key or null. @param extra Club times SQL, empty for the defaults. @return The INSERT text. */
  const honor = (id: string, name: string, status: string, image: string | null, extra = '') =>
    `INSERT INTO honors (id, name, category, issued_by, skill_level, status, stock, price_cents, image${extra ? ', created_at, modified_at' : ''}) VALUES ('${id}', '${name}', 'Nature', 'GC', 2, '${status}', 5, 400, ${image === null ? 'NULL' : `'${image}'`}${extra})`
  await db.batch([
    db.prepare(honor('knots', 'Knots', 'active', null)),
    db.prepare(honor('camp', 'Camping', 'hidden', null)),
    db.prepare(honor('pic', 'Picture', 'active', 'pictures/pic.webp')),
    db.prepare(honor('club', 'Club made', 'active', null, ", '2026-11-03T01:02:03.004Z', '2026-11-04T05:06:07.008Z'")),
  ])
  /** Builds one orders INSERT. @param id Order id. @param number Order number. @param request Request id or null. @param phone Buyer phone or null. @return The prepared INSERT. */
  const order = (id: number, number: string, request: string | null, phone: string | null) =>
    db.prepare(`INSERT INTO orders (id, number, created_at, step, currency, total_cents, buyer_name, buyer_email, buyer_phone, club, request_id) VALUES (${id}, '${number}', '2026-11-0${id}T00:00:00.000Z', 'paid', 'MYR', 1200, 'Ana', 'ana@example.com', ${phone === null ? 'NULL' : `'${phone}'`}, 'Gilead', ${request === null ? 'NULL' : `'${request}'`})`)
  /** Builds one order_lines INSERT. @param order Order id. @param item Item id. @param name Line name. @param quantity Line quantity. @return The prepared INSERT. */
  const line = (order: number, item: string, name: string, quantity: number) =>
    db.prepare(`INSERT INTO order_lines (order_id, honor_id, name, quantity, price_cents) VALUES (${order}, '${item}', '${name}', ${quantity}, 400)`)
  await db.batch([
    order(1, 'A1', 'req-1', '0123'),
    order(2, 'A2', null, '0123'),
    order(3, 'A3', 'req-3', '0123'),
    order(4, 'A4', null, buyerPhone),
    line(1, 'pic', 'Picture', 1), // Inserted out of name order on purpose.
    line(1, 'camp', 'Camping', 2),
    line(1, 'knots', 'Knots', 3),
    line(2, 'gone', 'Deleted honor', 1), // Its honor no longer exists.
    line(3, 'club', 'Club made', 4),
    line(4, 'knots', 'Knots', 1),
  ])
}

/**
 * Reads rows as arrays of values, for before and after comparison.
 * @param sql The SELECT.
 * @return One array of values per row.
 */
async function rows(sql: string): Promise<unknown[][]> {
  return (await db.prepare(sql).raw()) as unknown[][]
}

describe('migration 0004', () => {
  beforeEach(async () => {
    await reset()
    await applyD1Migrations(db, OLD) // The schema as it is live today.
  })

  it('keeps every item row and value', async () => {
    // Catches an items table that loses a row or a column value (picture, club times).
    await seed()
    const before = await rows('SELECT id, name, category, issued_by, skill_level, status, stock, price_cents, image, created_at, modified_at FROM honors ORDER BY id')
    await applyD1Migrations(db, REBUILD)
    const after = await rows('SELECT id, name, category, issued_by, skill_level, status, stock, price_cents, image, created_at, modified_at FROM items ORDER BY id')
    expect(after).toHaveLength(4)
    expect(after).toEqual(before)
    expect(after.find((r) => r[0] === 'club')?.[9]).toBe('2026-11-03T01:02:03.004Z') // A club-added item keeps its own times.
  })

  it('keeps every order and order line, with honor_id read as item_id', async () => {
    // Catches order values changing in the rebuild.
    await seed()
    const orderSql = (extra: string) => `SELECT id, number, created_at, step, currency, total_cents, buyer_name, buyer_email, buyer_phone, club, request_id FROM orders ORDER BY id${extra}`
    const ordersBefore = await rows(orderSql(''))
    const linesBefore = await rows('SELECT order_id, honor_id, name, quantity, price_cents FROM order_lines ORDER BY order_id, rowid')
    await applyD1Migrations(db, REBUILD)
    expect(await rows(orderSql(''))).toEqual(ordersBefore)
    expect(await rows('SELECT order_id, item_id, name, quantity, price_cents FROM order_lines ORDER BY order_id, rowid')).toEqual(linesBefore)
    expect(ordersBefore[1][10]).toBeNull() // The order without a request id stays NULL.
  })

  it('loses no order line to the cascade when the parent table is dropped', async () => {
    // Catches the drop-parent-with-a-child trap: dropping orders while order_lines still exists deletes every line.
    await seed()
    await applyD1Migrations(db, REBUILD)
    expect(await rows('SELECT count(*) FROM order_lines')).toEqual([[6]])
    expect(await rows('SELECT order_id, count(*) FROM order_lines GROUP BY order_id ORDER BY order_id')).toEqual([[1, 3], [2, 1], [3, 1], [4, 1]])
  })

  it('keeps the order of the lines inside each order', async () => {
    // Catches lines coming back in another order (the confirmation and the admin sort by rowid).
    await seed()
    await applyD1Migrations(db, REBUILD)
    expect(await rows('SELECT item_id FROM order_lines WHERE order_id = 1 ORDER BY rowid')).toEqual([['pic'], ['camp'], ['knots']])
  })

  it('keeps ids and gives the next order an id above the highest', async () => {
    // Catches renumbered orders, which would detach their lines.
    await seed()
    await applyD1Migrations(db, REBUILD)
    expect(await rows('SELECT id FROM orders ORDER BY id')).toEqual([[1], [2], [3], [4]])
    expect(await rows('SELECT DISTINCT order_id FROM order_lines ORDER BY order_id')).toEqual([[1], [2], [3], [4]])
    await db.prepare(`INSERT INTO orders (number, created_at, currency, total_cents, buyer_name, buyer_email, buyer_phone, club) VALUES ('A5', '2026-11-05T00:00:00.000Z', 'MYR', 0, 'a', 'b', 'c', 'G')`).run()
    expect(await rows(`SELECT id FROM orders WHERE number = 'A5'`)).toEqual([[5]])
  })

  it('leaves foreign keys valid and the cascade working', async () => {
    // Catches a rebuilt order_lines that no longer points at orders or no longer cascades.
    await seed()
    await applyD1Migrations(db, REBUILD)
    expect(await rows('PRAGMA foreign_key_check')).toEqual([])
    await db.prepare('DELETE FROM orders WHERE id = 1').run()
    expect(await rows('SELECT order_id, count(*) FROM order_lines GROUP BY order_id ORDER BY order_id')).toEqual([[2, 1], [3, 1], [4, 1]]) // Only order 1's lines went.
  })

  it('leaves the new schema shape', async () => {
    // Catches leftover honor names, copy tables, the removal column or lost indexes and rules.
    await seed()
    await applyD1Migrations(db, REBUILD)
    expect(await rows(`SELECT name FROM sqlite_master WHERE name LIKE '%honor%' OR name LIKE '%\\_copy' ESCAPE '\\'`)).toEqual([])
    expect(await rows(`SELECT name FROM pragma_table_info('orders') WHERE name = 'personal_data_removed_at'`)).toEqual([])
    expect((await rows(`SELECT name FROM pragma_index_list('items') WHERE name LIKE 'items%' ORDER BY name`)).flat()).toEqual([
      'items_category_created', 'items_category_modified', 'items_category_name', 'items_created', 'items_modified', 'items_name_nocase', 'items_status_name',
    ])
    expect((await rows(`SELECT name FROM pragma_index_list('orders') WHERE name LIKE 'orders_%' ORDER BY name`)).flat()).toEqual(['orders_created_at', 'orders_request_id'])
    const insertOrder = (number: string) => db.prepare(`INSERT INTO orders (number, created_at, currency, total_cents, buyer_name, buyer_email, buyer_phone, club, request_id) VALUES ('${number}', '2026-11-05T00:00:00.000Z', 'MYR', 0, 'a', 'b', 'c', 'G', 'req-1')`).run()
    await expect(insertOrder('X1')).rejects.toThrow('UNIQUE') // The request id stays unique.
    await expect(db.prepare(`UPDATE items SET stock = -1 WHERE id = 'knots'`).run()).rejects.toThrow('CHECK')
    await expect(db.prepare(`UPDATE items SET name = 'KNOTS' WHERE id = 'camp'`).run()).rejects.toThrow('UNIQUE') // Case-only duplicate name.
  })

  it('changes nothing when an order has no buyer phone', async () => {
    // Catches a half-done migration: a NULL buyer field must make 0004 fail whole, leaving the old tables as seeded.
    await seed(null)
    const before = await rows('SELECT id, buyer_phone FROM orders ORDER BY id')
    await expect(applyD1Migrations(db, REBUILD)).rejects.toThrow()
    expect(await rows('SELECT count(*) FROM honors')).toEqual([[4]])
    expect(await rows('SELECT id, buyer_phone FROM orders ORDER BY id')).toEqual(before)
    expect(await rows(`SELECT count(*) FROM pragma_table_info('orders') WHERE name = 'personal_data_removed_at'`)).toEqual([[1]])
    expect(await rows('SELECT count(*) FROM order_lines')).toEqual([[6]])
    expect(await rows(`SELECT name FROM sqlite_master WHERE name LIKE '%\\_copy' ESCAPE '\\' OR name = 'items'`)).toEqual([])
  })

  it('keeps line order across orders when lines were deleted and interleaved before the rebuild', async () => {
    // Catches copy-back that renumbers or regroups lines instead of keeping each old rowid (a gap left by a deleted line, lines of two orders interleaved).
    await seed()
    await db.prepare(`INSERT INTO order_lines (order_id, honor_id, name, quantity, price_cents) VALUES (3, 'zeta', 'Zeta', 1, 400)`).run() // Order 3 gets a late line after order 4's.
    await db.prepare(`DELETE FROM order_lines WHERE order_id = 1 AND honor_id = 'camp'`).run() // Leaves a rowid gap inside order 1.
    const before = await rows('SELECT rowid, order_id, honor_id FROM order_lines ORDER BY rowid')
    await applyD1Migrations(db, REBUILD)
    expect(await rows('SELECT rowid, order_id, item_id FROM order_lines ORDER BY rowid')).toEqual(before) // Same rowids, same sequence.
  })

  it('refuses an order whose personal data was already removed and leaves every table as seeded', async () => {
    // Catches a migration that silently drops or blanks a removed-buyer order: its NULL buyer fields must stop 0004 whole, as the live check U3 expects.
    await seed()
    await db.prepare(`UPDATE orders SET buyer_name = NULL, buyer_email = NULL, buyer_phone = NULL, personal_data_removed_at = '2026-11-05T00:00:00.000Z' WHERE id = 2`).run()
    await expect(applyD1Migrations(db, REBUILD)).rejects.toThrow()
    expect(await rows('SELECT id, buyer_name, personal_data_removed_at FROM orders ORDER BY id')).toEqual([[1, 'Ana', null], [2, null, '2026-11-05T00:00:00.000Z'], [3, 'Ana', null], [4, 'Ana', null]])
    expect(await rows('SELECT count(*) FROM order_lines')).toEqual([[6]])
    expect(await rows('SELECT count(*) FROM honors')).toEqual([[4]])
  })
})
