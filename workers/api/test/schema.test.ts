// Schema tests: every CHECK, type rule, unique key and cascade the later endpoints lean on, run against the real migrations.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

// Short name for the test database.
const db = env.DB

// Reason texts SQLite gives for each kind of refusal.
const CHECK = 'CHECK constraint failed'
const UNIQUE = 'UNIQUE constraint failed'
const FOREIGN_KEY = 'FOREIGN KEY constraint failed'
const TYPE = 'cannot store' // STRICT tables refuse a value of the wrong type.

// A row every table accepts; each test changes one field of it.
const validHonor = {
  id: 'knots',
  name: 'Knots',
  category: 'Nature',
  issued_by: 'General Conference',
  skill_level: null,
  status: 'active',
  stock: 0,
  price_cents: 400,
  image: null,
}
const validClub = {
  name: 'Gilead',
  area: null,
  language: null,
  location: null,
  church_name: null,
  position: 1,
}
const validSettings = {
  id: 1,
  currency: 'MYR',
  default_price_cents: 400,
  order_email_on: 1,
}
const validOrder = {
  number: 'A1',
  created_at: '2026-11-01T00:00:00.000Z',
  step: 'new',
  currency: 'MYR',
  total_cents: 800,
  buyer_name: 'Ana',
  buyer_email: 'ana@example.com',
  buyer_phone: '0123',
  club: 'Gilead',
  personal_data_removed_at: null,
}

/**
 * Inserts one row built from an object, using its keys as the columns.
 * @param table The table name (from test code only).
 * @param row Column names and values.
 * @return The error text if D1 refused the insert, or null when it went through.
 */
async function tryInsert(
  table: string,
  row: Record<string, unknown>,
): Promise<string | null> {
  const columns = Object.keys(row) // Column list.
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})` // One placeholder per column.
  return tryRun(sql, Object.values(row))
}

/**
 * Inserts a setup row and fails the test at once if D1 refuses it.
 * @param table The table name (from test code only).
 * @param row Column names and values.
 */
async function mustInsert(
  table: string,
  row: Record<string, unknown>,
): Promise<void> {
  const refusal = await tryInsert(table, row) // Null when accepted.
  if (refusal !== null)
    throw new Error(`setup insert into ${table} refused: ${refusal}`) // A broken setup must not let a test pass.
}

/**
 * Runs one statement and returns why D1 refused it.
 * @param sql The statement to run.
 * @param values The bound values.
 * @return The SQLite error text, or null when the statement went through.
 */
async function tryRun(
  sql: string,
  values: unknown[] = [],
): Promise<string | null> {
  try {
    await db
      .prepare(sql)
      .bind(...values)
      .run() // Any constraint failure throws.
    return null // The statement went through.
  } catch (error) {
    return String((error as Error).cause ?? error) // D1 puts the SQLite reason in the cause.
  }
}

/**
 * Inserts an order and returns its id.
 * @param overrides Fields that differ from the valid order.
 * @return The new order's id.
 */
async function insertOrder(
  overrides: Record<string, unknown> = {},
): Promise<number> {
  const row = { ...validOrder, ...overrides } // The order to write.
  const columns = Object.keys(row) // Column list.
  const result = await db
    .prepare(
      `INSERT INTO orders (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) RETURNING id`,
    )
    .bind(...Object.values(row))
    .first<{ id: number }>() // The generated id.
  return result!.id // Always present after a successful insert.
}

// Start every test with empty tables.
beforeEach(async () => {
  await db.batch([
    db.prepare('DELETE FROM order_lines'),
    db.prepare('DELETE FROM orders'),
    db.prepare('DELETE FROM clubs'),
    db.prepare('DELETE FROM honors'),
    db.prepare('DELETE FROM settings'),
  ])
})

describe('honors', () => {
  it('accepts a valid row and a picture path that is not patches/<id>.webp', async () => {
    // Catches a base row that is itself invalid (every refusal below would pass for the wrong reason) and an image CHECK tied to the id.
    expect(await tryInsert('honors', validHonor)).toBeNull()
    expect(
      await tryInsert('honors', {
        ...validHonor,
        id: 'other',
        image: 'honors/other-2.webp',
        skill_level: 3,
      }),
    ).toBeNull()
  })

  it.each([
    ['empty name', { name: '' }, CHECK],
    ['empty category', { category: '' }, CHECK],
    ['empty issued_by', { issued_by: '' }, CHECK],
    ['skill level 0', { skill_level: 0 }, CHECK],
    ['skill level 4', { skill_level: 4 }, CHECK],
    ['fractional skill level', { skill_level: 1.5 }, TYPE],
    ['unknown status', { status: 'deleted' }, CHECK],
    ['stock -1', { stock: -1 }, CHECK],
    ['text stock', { stock: 'abc' }, TYPE],
    ['fractional stock', { stock: 1.5 }, TYPE],
    ['price -1', { price_cents: -1 }, CHECK],
    ['fractional price', { price_cents: 400.5 }, TYPE],
    ['empty image path', { image: '' }, CHECK],
  ])('refuses %s', async (_label, change, reason) => {
    // Catches a CHECK or type rule that is missing or mistyped.
    expect(await tryInsert('honors', { ...validHonor, ...change })).toContain(
      reason,
    )
  })

  it('undoes the first update of a batch when the second one underflows stock', async () => {
    // Catches an order that is half applied: the first honor loses stock while the second fails.
    await mustInsert('honors', { ...validHonor, id: 'first', stock: 5 })
    await mustInsert('honors', { ...validHonor, id: 'second', stock: 0 })
    await expect(
      db.batch([
        db
          .prepare('UPDATE honors SET stock = stock - 2 WHERE id = ?')
          .bind('first'),
        db
          .prepare('UPDATE honors SET stock = stock - 1 WHERE id = ?')
          .bind('second'),
      ]),
    ).rejects.toThrow() // The second update breaks the CHECK.
    const row = await db
      .prepare('SELECT stock FROM honors WHERE id = ?')
      .bind('first')
      .first<{ stock: number }>()
    expect(row!.stock).toBe(5) // A half-applied order would leave 3.
  })

  it('refuses to update a stock to text', async () => {
    // Catches a text stock slipping past stock >= 0 (text sorts above every number).
    await mustInsert('honors', validHonor)
    expect(
      await tryRun(`UPDATE honors SET stock = 'abc' WHERE id = 'knots'`),
    ).toContain(TYPE)
  })
})

describe('settings', () => {
  it('accepts the valid row', async () => {
    // Catches an invalid base row behind the refusals below.
    expect(await tryInsert('settings', validSettings)).toBeNull()
  })

  it.each([
    ['a second row', { id: 2 }, CHECK],
    ['lower-case currency', { currency: 'myr' }, CHECK],
    ['four-letter currency', { currency: 'MYRR' }, CHECK],
    ['two-letter currency', { currency: 'MY' }, CHECK],
    ['default price -1', { default_price_cents: -1 }, CHECK],
    ['fractional default price', { default_price_cents: 400.5 }, TYPE],
    ['email switch 2', { order_email_on: 2 }, CHECK],
    ['text email switch', { order_email_on: 'yes' }, TYPE],
  ])('refuses %s', async (_label, change, reason) => {
    // Catches a missing single-row, currency, price or switch rule.
    await mustInsert('settings', validSettings)
    const row = { ...validSettings, ...change } // The row to try.
    if (!('id' in change)) await db.prepare('DELETE FROM settings').run() // Only the id test needs the first row to stay.
    expect(await tryInsert('settings', row)).toContain(reason)
  })
})

describe('clubs', () => {
  it('accepts a valid row', async () => {
    // Catches an invalid base row behind the refusals below.
    expect(await tryInsert('clubs', validClub)).toBeNull()
  })

  it.each([
    ['an empty name', { name: '' }, CHECK],
    ['the name Other', { name: 'Other' }, CHECK],
    ['the name OTHER', { name: 'OTHER' }, CHECK],
    ['a padded name', { name: ' Panda' }, CHECK],
    ['an empty area', { area: '' }, CHECK],
    ['an empty language', { language: '' }, CHECK],
    ['an empty location', { location: '' }, CHECK],
    ['an empty church name', { church_name: '' }, CHECK],
    ['a text position', { position: 'first' }, TYPE],
    ['a fractional position', { position: 1.5 }, TYPE],
  ])('refuses %s', async (_label, change, reason) => {
    // Catches a missing club-name or optional-field rule.
    expect(await tryInsert('clubs', { ...validClub, ...change })).toContain(
      reason,
    )
  })

  it('refuses a repeated club name', async () => {
    // Catches two clubs with the same name in the picker.
    await mustInsert('clubs', validClub)
    expect(await tryInsert('clubs', { ...validClub, position: 2 })).toContain(
      UNIQUE,
    )
  })
})

describe('orders', () => {
  it('accepts a valid row', async () => {
    // Catches an invalid base row behind the refusals below.
    expect(await tryInsert('orders', validOrder)).toBeNull()
  })

  it.each([
    ['an unknown step', { step: 'shipped' }, CHECK],
    ['lower-case currency', { currency: 'myr' }, CHECK],
    ['four-letter currency', { currency: 'MYRR' }, CHECK],
    ['total -1', { total_cents: -1 }, CHECK],
    ['fractional total', { total_cents: 1.5 }, TYPE],
    ['a date-only created_at', { created_at: '2026-11-01' }, CHECK],
    ['a day-first created_at', { created_at: '1/11/2026' }, CHECK],
    [
      'a created_at without milliseconds',
      { created_at: '2026-11-01T00:00:00Z' },
      CHECK,
    ],
    [
      'a created_at with a space',
      { created_at: '2026-11-01 00:00:00.000' },
      CHECK,
    ],
    [
      'an impossible created_at',
      { created_at: '2026-13-45T00:00:00.000Z' },
      CHECK,
    ],
    [
      'a removed order that keeps the name',
      {
        personal_data_removed_at: '2026-11-02T00:00:00.000Z',
        buyer_email: null,
        buyer_phone: null,
      },
      CHECK,
    ],
    [
      'a removed order that keeps the email',
      {
        personal_data_removed_at: '2026-11-02T00:00:00.000Z',
        buyer_name: null,
        buyer_phone: null,
      },
      CHECK,
    ],
    [
      'a removed order that keeps the phone',
      {
        personal_data_removed_at: '2026-11-02T00:00:00.000Z',
        buyer_name: null,
        buyer_email: null,
      },
      CHECK,
    ],
  ])('refuses %s', async (_label, change, reason) => {
    // Catches a missing step, money, date-format or personal-data rule.
    expect(await tryInsert('orders', { ...validOrder, ...change })).toContain(
      reason,
    )
  })

  it('refuses a repeated order number', async () => {
    // Catches two orders sharing one number.
    await mustInsert('orders', validOrder)
    expect(await tryInsert('orders', validOrder)).toContain(UNIQUE)
  })

  it('keeps the lines, total and club when the buyer fields are cleared', async () => {
    // Catches a removal that loses sales history along with the personal data.
    const orderId = await insertOrder()
    await mustInsert('order_lines', {
      order_id: orderId,
      honor_id: 'h',
      name: 'H',
      quantity: 2,
      price_cents: 400,
    })
    expect(
      await tryRun(
        `UPDATE orders SET buyer_name = NULL, buyer_email = NULL, buyer_phone = NULL, personal_data_removed_at = '2026-11-02T00:00:00.000Z' WHERE id = ?`,
        [orderId],
      ),
    ).toBeNull() // Clearing the buyer fields is allowed.
    const order = await db
      .prepare('SELECT total_cents, club, buyer_email FROM orders WHERE id = ?')
      .bind(orderId)
      .first()
    const lines = await db
      .prepare('SELECT quantity FROM order_lines WHERE order_id = ?')
      .bind(orderId)
      .all()
    expect(order).toEqual({
      total_cents: 800,
      club: 'Gilead',
      buyer_email: null,
    })
    expect(lines.results).toHaveLength(1) // A removal that dropped lines would lose sales history.
  })

  it('refuses to mark a removal while buyer data remains', async () => {
    // Catches the removal date being set without clearing the buyer fields.
    const orderId = await insertOrder()
    expect(
      await tryRun(
        `UPDATE orders SET personal_data_removed_at = '2026-11-02T00:00:00.000Z' WHERE id = ?`,
        [orderId],
      ),
    ).toContain(CHECK)
  })

  it('deletes the lines of a deleted order', async () => {
    // Catches orphan lines staying behind a deleted order.
    const orderId = await insertOrder()
    await mustInsert('order_lines', {
      order_id: orderId,
      honor_id: 'h',
      name: 'H',
      quantity: 1,
      price_cents: 400,
    })
    await db.prepare('DELETE FROM orders WHERE id = ?').bind(orderId).run()
    const lines = await db
      .prepare('SELECT 1 FROM order_lines WHERE order_id = ?')
      .bind(orderId)
      .all()
    expect(lines.results).toHaveLength(0) // Orphan lines would stay forever.
  })
})

describe('order lines', () => {
  it('accepts a valid row', async () => {
    // Catches an invalid base row behind the refusals below.
    const orderId = await insertOrder()
    expect(
      await tryInsert('order_lines', {
        order_id: orderId,
        honor_id: 'h',
        name: 'H',
        quantity: 99,
        price_cents: 0,
      }),
    ).toBeNull()
  })

  it.each([
    ['quantity 0', { quantity: 0 }, CHECK],
    ['quantity 100', { quantity: 100 }, CHECK],
    ['fractional quantity', { quantity: 1.5 }, TYPE],
    ['price -1', { price_cents: -1 }, CHECK],
    ['fractional price', { price_cents: 400.5 }, TYPE],
    ['a missing order', { order_id: 999 }, FOREIGN_KEY],
  ])('refuses %s', async (_label, change, reason) => {
    // Catches a missing quantity, price or foreign-key rule.
    const orderId = await insertOrder()
    expect(
      await tryInsert('order_lines', {
        order_id: orderId,
        honor_id: 'h',
        name: 'H',
        quantity: 1,
        price_cents: 400,
        ...change,
      }),
    ).toContain(reason)
  })

  it('refuses the same honor twice on one order', async () => {
    // Catches a double line that would double-count stock.
    const orderId = await insertOrder()
    const line = {
      order_id: orderId,
      honor_id: 'h',
      name: 'H',
      quantity: 1,
      price_cents: 400,
    } // The line to repeat.
    await mustInsert('order_lines', line)
    expect(await tryInsert('order_lines', line)).toContain(UNIQUE)
  })
})

describe('orders.request_id', () => {
  it('refuses a second order with the same request id but allows many without one', async () => {
    // Catches a missing UNIQUE index (a repeat send would order twice) or one that also blocks old orders with no request id.
    expect(await tryInsert('orders', { ...validOrder, number: 'R1', request_id: '00000000-0000-4000-8000-000000000001' })).toBeNull() // First.
    expect(await tryInsert('orders', { ...validOrder, number: 'R2', request_id: '00000000-0000-4000-8000-000000000001' })).toContain(UNIQUE) // Same id.
    expect(await tryInsert('orders', { ...validOrder, number: 'R3' })).toBeNull() // No id.
    expect(await tryInsert('orders', { ...validOrder, number: 'R4' })).toBeNull() // No id either.
  })
})
