// Migration 0005 tests: seeded 0001-0004 data goes through the subcategories migration with every honor pointed at its old honor area, nothing else touched, and a whole-file stop on an unknown category.

import { applyD1Migrations } from 'cloudflare:test' // Runs migration files on a database.
import { env } from 'cloudflare:workers' // The test bindings.
import { beforeEach, describe, expect, it } from 'vitest' // The test runner.

// The empty database these tests migrate by hand.
const db = env.MIGRATION_DB // The spare D1 binding.
// Migrations before and after the subcategories migration.
const OLD = env.TEST_MIGRATIONS.slice(0, 4) // 0001 to 0004.
const SUBCATEGORIES = env.TEST_MIGRATIONS.slice(4) // 0005 only.
// The nine honor areas in A-Z order; ids 1-9 follow this order.
const HONOR_AREAS = ['ADRA', 'Arts and Crafts', 'Health and Science', 'Household Arts', 'Nature', 'Outdoor Industries', 'Outreach', 'Recreation', 'Vocational'] // The old category names.
// The item columns compared before and after, in full except the two that move.
const KEPT = 'id, name, issued_by, skill_level, status, stock, price_cents, image, created_at, modified_at' // Every column but category and subcategory_id.
// The times of the honor with its own created_at and modified_at.
const OWN_TIMES = ", '2026-11-03T01:02:03.004Z', '2026-11-04T05:06:07.008Z'" // SQL tail for item().

/** Drops every table so each test starts from an empty database. */
async function reset(): Promise<void> { // Empties the database.
  for (const table of ['order_lines', 'orders', 'items', 'subcategories', 'clubs', 'settings', 'd1_migrations']) // Each table, children first.
    await db.exec(`DROP TABLE IF EXISTS ${table}`) // Children first, so no cascade or foreign key stops a drop.
}

/**
 * Reads rows as arrays of values, for before and after comparison.
 * @param sql The SELECT.
 * @return One array of values per row.
 */
async function rows(sql: string): Promise<unknown[][]> { // Rows as value arrays.
  return (await db.prepare(sql).raw()) as unknown[][] // One array per row.
}

/**
 * Seeds the 0004 schema: one item per honor area, a Club-added honor with its own times, an Accessories item, a Shirt item, an extra category item if asked, and one order with a line.
 * @param extraCategory A category outside the 11 known names to add one more item under, or null for none.
 */
async function seed(extraCategory: string | null = null): Promise<void> { // Fills the 0004 schema.
  /** Builds one items INSERT. @param id Row id. @param name Name. @param category Old category. @param status active or hidden. @param image Picture key or null. @param times Club times SQL, empty for the defaults. @param issuedBy GC or Club. @return The prepared INSERT. */
  const item = (id: string, name: string, category: string, status: string, image: string | null, times = '', issuedBy = 'GC') => // Builds one items INSERT.
    db.prepare(`INSERT INTO items (id, name, category, issued_by, skill_level, status, stock, price_cents, image${times ? ', created_at, modified_at' : ''}) VALUES ('${id}', '${name}', '${category}', '${issuedBy}', 2, '${status}', 5, 400, ${image === null ? 'NULL' : `'${image}'`}${times})`) // One prepared INSERT.
  await db.batch([ // One batch, so the seed is all or nothing.
    ...HONOR_AREAS.map((honorArea, index) => // One honor per honor area.
      item(`honor-${index + 1}`, `${honorArea} honor`, honorArea, index === 1 ? 'hidden' : 'active', index === 2 ? 'items/h.webp' : null, index === 3 ? OWN_TIMES : ''), // Varied status, picture and times.
    ),
    item('club-1', 'Club honor', 'Nature', 'hidden', null, OWN_TIMES, 'Club'), // The Club-added item, in the Nature area.
    item('scarf', 'Scarf', 'Accessories', 'active', null), // Stays as it is.
    item('shirt', 'Shirt', 'Shirt', 'active', null), // Becomes Shirts.
    ...(extraCategory === null ? [] : [item('odd', 'Odd', extraCategory, 'active', null)]), // The unknown category, if asked.
    db.prepare(`INSERT INTO orders (id, number, created_at, step, currency, total_cents, buyer_name, buyer_email, buyer_phone, club) VALUES (1, 'A1', '2026-11-01T00:00:00.000Z', 'paid', 'MYR', 800, 'Ana', 'ana@example.com', '0123', 'Gilead')`), // One order.
    db.prepare(`INSERT INTO order_lines (order_id, item_id, name, quantity, price_cents) VALUES (1, 'honor-5', 'Nature honor', 2, 400)`), // One line.
  ])
}

describe('migration 0005', () => { // The 0005 migration tests.
  beforeEach(async () => { // Fresh 0004 schema per test.
    await reset() // An empty database.
    await applyD1Migrations(db, OLD) // The schema as it is live today.
  })

  it('points each honor at its old honor area and moves it to Honors, keeping every other value', async () => { // Honors move.
    // Catches a category move done before the honor area lookup, which would point every honor at nothing, and any lost field value.
    await seed() // 0004 data.
    const before = await rows(`SELECT ${KEPT} FROM items WHERE id LIKE 'honor-%' ORDER BY id`) // Values before the move.
    await applyD1Migrations(db, SUBCATEGORIES) // Run 0005.
    expect(await rows(`SELECT ${KEPT} FROM items WHERE id LIKE 'honor-%' ORDER BY id`)).toEqual(before) // Nothing else changed.
    expect(await rows(`SELECT i.id, i.category, s.name FROM items i JOIN subcategories s ON s.id = i.subcategory_id WHERE i.id LIKE 'honor-%' ORDER BY i.id`)).toEqual( // Each honor joined to its subcategory.
      HONOR_AREAS.map((honorArea, index) => [`honor-${index + 1}`, 'Honors', honorArea]), // Each honor under its old honor area.
    )
    expect(await rows(`SELECT count(*) FROM items WHERE category = 'Honors' AND subcategory_id IS NULL`)).toEqual([[0]]) // None left without one.
  })

  it('moves a Club-added honor too and keeps its own times', async () => { // Club item.
    // Catches a move that depends on issued_by, or one that resets a Club-added item's times.
    await seed() // 0004 data.
    await applyD1Migrations(db, SUBCATEGORIES) // Run 0005.
    expect(await rows(`SELECT i.issued_by, i.category, s.name, i.created_at, i.modified_at FROM items i JOIN subcategories s ON s.id = i.subcategory_id WHERE i.id = 'club-1'`)).toEqual([ // The Club-added honor after the move.
      ['Club', 'Honors', 'Nature', '2026-11-03T01:02:03.004Z', '2026-11-04T05:06:07.008Z'], // Read from the migrated row.
    ])
  })

  it('leaves Accessories as it is and renames Shirt to Shirts, both without a subcategory', async () => { // Other categories.
    // Catches the Honors move catching other categories, or a Shirt left under the old name.
    await seed() // 0004 data.
    await applyD1Migrations(db, SUBCATEGORIES) // Run 0005.
    expect(await rows(`SELECT id, category, subcategory_id FROM items WHERE id IN ('scarf', 'shirt') ORDER BY id`)).toEqual([['scarf', 'Accessories', null], ['shirt', 'Shirts', null]]) // Both as expected.
  })

  it('creates exactly the nine honor areas as ids 1 to 9, A to Z, all under Honors', async () => { // The table.
    // Catches wrong ids (a live fill would then point at the wrong honor area), a wrong order or a wrong category.
    await seed() // 0004 data.
    await applyD1Migrations(db, SUBCATEGORIES) // Run 0005.
    expect(await rows('SELECT id, category, name FROM subcategories ORDER BY id')).toEqual(HONOR_AREAS.map((honorArea, index) => [index + 1, 'Honors', honorArea])) // Nine rows.
  })

  it('leaves modified_at untouched on every row', async () => { // No stamp.
    // Catches the migration stamping 422 rows, which would flood Recently changed.
    await seed() // 0004 data.
    const before = await rows('SELECT id, created_at, modified_at FROM items ORDER BY id') // Times before.
    await applyD1Migrations(db, SUBCATEGORIES) // Run 0005.
    expect(await rows('SELECT id, created_at, modified_at FROM items ORDER BY id')).toEqual(before) // Same times.
  })

  it('stops whole on an unknown category and leaves the database as seeded', async () => { // The guard.
    // Catches a half-moved catalogue: one unknown category must abort the file with no table, no column and no moved row.
    await seed('Spiritual Growth') // An item outside the 11 names.
    const before = await rows('SELECT * FROM items ORDER BY id') // Items before.
    await expect(applyD1Migrations(db, SUBCATEGORIES)).rejects.toThrow(/overflow/) // The guard's own integer overflow, not any error.
    expect(await rows(`SELECT name FROM sqlite_master WHERE name LIKE 'subcategories%'`)).toEqual([]) // No table or index.
    expect(await rows(`SELECT name FROM pragma_table_info('items') WHERE name = 'subcategory_id'`)).toEqual([]) // No column.
    expect(await rows('SELECT * FROM items ORDER BY id')).toEqual(before) // No row moved.
    expect(await rows(`SELECT count(*) FROM items WHERE category = 'Honors'`)).toEqual([[0]]) // None in Honors.
  })

  it('leaves orders and order lines untouched', async () => { // Buyer data.
    // Catches the migration touching buyer data or the lines.
    await seed() // 0004 data.
    await applyD1Migrations(db, SUBCATEGORIES) // Run 0005.
    expect(await rows('SELECT count(*) FROM orders')).toEqual([[1]]) // One order.
    expect(await rows('SELECT order_id, item_id, name, quantity, price_cents FROM order_lines')).toEqual([[1, 'honor-5', 'Nature honor', 2, 400]]) // The line.
    expect(await rows('SELECT number, buyer_name, total_cents FROM orders')).toEqual([['A1', 'Ana', 800]]) // The order.
  })

  it('leaves foreign keys valid and the seven items indexes in place', async () => { // Integrity.
    // Catches a dangling subcategory_id or an index lost with the move.
    await seed() // 0004 data.
    await applyD1Migrations(db, SUBCATEGORIES) // Run 0005.
    expect(await rows('PRAGMA foreign_key_check')).toEqual([]) // No violation.
    expect((await rows(`SELECT name FROM pragma_index_list('items') WHERE name LIKE 'items%' ORDER BY name`)).flat()).toEqual([ // The items index names.
      'items_category_created', 'items_category_modified', 'items_category_name', 'items_created', 'items_modified', 'items_name_nocase', 'items_status_name', // The seven.
    ])
  })
})
