// Admin order reads and the guarded step change, including the cancel that puts stock back in the same transaction.

import type { AdminOrder, AdminOrderPage, OrderStep, StepChange, StepResult } from './admin-types' // The shared shapes.
import { encodeOrderCursor, type OrderQuery } from './order-query' // The checked query and the cursor codec.

const PAGE_SIZE = 50 // Rows per page; one more is read to know whether another page exists.

interface RawOrder { // An order as D1 returns it.
  id: number // Row id.
  number: string // Order number.
  createdAt: string // ISO time.
  step: OrderStep // Where the order stands.
  currency: string // Currency code.
  totalCents: number // Total in cents.
  club: string // The club it belongs to.
  name: string // Buyer name; NOT NULL in D1.
  email: string // Buyer email; NOT NULL in D1.
  phone: string // Buyer phone; NOT NULL in D1.
}

interface RawLine { // A line as D1 returns it; `inShop` is 0 or 1.
  orderId: number // The order's row id.
  itemId: string // The item sold.
  name: string // Name when ordered.
  quantity: number // How many were ordered.
  priceCents: number // Price in cents when ordered.
  inShop: number // 1 while the item still exists.
}

/**
 * Builds the SQL and bound values of one page of orders, or of one order by number.
 * @param query The checked query.
 * @return The statement text and its values; a list page reads 51 rows in the order of `orders_created_at`.
 */
export function orderPageSql(query: OrderQuery): { sql: string; params: (string | number)[] } {
  const columns = 'id, number, created_at AS createdAt, step, currency, total_cents AS totalCents, club, buyer_name AS name, buyer_email AS email, buyer_phone AS phone' // What the admin sees.
  if (query.number !== null) return { sql: `SELECT ${columns} FROM orders WHERE number = ? LIMIT 1`, params: [query.number] } // The unique index.
  const where: string[] = [] // AND-ed conditions.
  const params: (string | number)[] = [] // Their values, in order.
  if (query.step !== null) { // The step filter.
    where.push('step = ?') // The step condition.
    params.push(query.step) // Its value.
  }
  if (query.cursor !== null) { // Continue after (time, id), newest first.
    where.push('created_at <= ?', '(created_at < ? OR (created_at = ? AND id < ?))') // The first line bounds the index range.
    params.push(query.cursor.createdAt, query.cursor.createdAt, query.cursor.createdAt, query.cursor.id) // Checked by decodeOrderCursor.
  }
  const clause = where.length === 0 ? '' : ` WHERE ${where.join(' AND ')}` // No WHERE when nothing filters.
  return { sql: `SELECT ${columns} FROM orders${clause} ORDER BY created_at DESC, id DESC LIMIT ${PAGE_SIZE + 1}`, params } // Values only ever bound, never joined in.
}

/**
 * Turns raw rows into the API shape.
 * @param rows The order rows.
 * @param lines The lines of those orders.
 * @return The orders in the rows' order.
 */
function toOrders(rows: RawOrder[], lines: RawLine[]): AdminOrder[] {
  return rows.map((row) => {
    const own = lines.filter((line) => line.orderId === row.id) // This order's lines, in the order they were saved.
    return { // The API shape of one order.
      number: row.number, // As stored.
      createdAt: row.createdAt, // As stored.
      step: row.step, // As stored.
      currency: row.currency, // As stored.
      totalCents: row.totalCents, // As stored.
      itemCount: own.reduce((sum, line) => sum + line.quantity, 0), // Quantity, not lines.
      club: row.club, // As stored.
      buyer: { name: row.name, email: row.email, phone: row.phone }, // Always present: the columns are NOT NULL.
      lines: own.map((line) => ({ itemId: line.itemId, name: line.name, quantity: line.quantity, priceCents: line.priceCents, inShop: line.inShop === 1 })), // The lines with the live flag.
    }
  })
}

/**
 * Reads one page of orders with their lines in one D1 batch of two statements.
 * @param db The D1 database.
 * @param query The checked query.
 * @return Up to 50 orders, newest first, and a cursor for the next page, or null at the end.
 */
export async function readOrderPage(db: D1Database, query: OrderQuery): Promise<AdminOrderPage> {
  const { sql, params } = orderPageSql(query) // The page statement.
  const [orderResult, lineResult] = await db.batch<RawOrder | RawLine>([
    db.prepare(sql).bind(...params), // The orders.
    db // The lines statement over the same page.
      .prepare(`SELECT l.order_id AS orderId, l.item_id AS itemId, l.name, l.quantity, l.price_cents AS priceCents, h.id IS NOT NULL AS inShop FROM order_lines l LEFT JOIN items h ON h.id = l.item_id WHERE l.order_id IN (SELECT id FROM (${sql} )) ORDER BY l.order_id, l.rowid`)
      .bind(...params), // The lines of the same page, so there is no N+1.
  ])
  const rows = orderResult.results as RawOrder[] // Up to 51.
  const pageRows = rows.slice(0, PAGE_SIZE) // The page itself.
  const last = pageRows[pageRows.length - 1] // The row the next page follows.
  const orders = toOrders(pageRows, lineResult.results as RawLine[]) // The API shape.
  if (rows.length <= PAGE_SIZE || last === undefined) return { orders, nextCursor: null } // That was the end.
  return { orders, nextCursor: encodeOrderCursor({ createdAt: last.createdAt, id: last.id }) } // More follow.
}

/**
 * Reads one order by number.
 * @param db The D1 database.
 * @param number The upper-case order number.
 * @return The order, or null when there is none.
 */
async function readOrder(db: D1Database, number: string): Promise<AdminOrder | null> {
  const { orders } = await readOrderPage(db, { step: null, number, cursor: null }) // The lookup.
  return orders[0] ?? null // At most one.
}

/**
 * Changes an order's step, guarded by the step the admin saw; a cancel can put stock back in the same transaction.
 * The restock and the step update both carry the `step = from` guard and sit in one `db.batch()`, so a restock never happens without the cancel, and never twice.
 * @param db The D1 database.
 * @param change The checked change.
 * @return `changed` with the quantity restocked, `conflict` with the current order (nothing written), or `not-found`.
 */
export async function changeOrderStep(db: D1Database, change: StepChange): Promise<StepResult> {
  const current = await readOrder(db, change.number) // The order as it is.
  if (current === null) return { kind: 'not-found' } // No such order.
  if (current.step !== change.from) return { kind: 'conflict', order: current } // Stale before any write.
  const orderId = '(SELECT id FROM orders WHERE number = ?1 AND step = ?2)' // The order, only while it is still at `from`.
  const results = await db.batch<{ restocked: number }>([ // The restock select, the restock update and the step update in one transaction.
    db.prepare(`SELECT COALESCE(SUM(l.quantity), 0) AS restocked FROM order_lines l JOIN items h ON h.id = l.item_id WHERE l.order_id = ${orderId} AND ?3 = 1`).bind(change.number, change.from, change.restock ? 1 : 0), // Quantity that will go back: lines whose item still exists.
    db // The restock update.
      .prepare(`UPDATE items SET stock = stock + (SELECT l.quantity FROM order_lines l WHERE l.order_id = ${orderId} AND l.item_id = items.id) WHERE ?3 = 1 AND id IN (SELECT item_id FROM order_lines WHERE order_id = ${orderId})`)
      .bind(change.number, change.from, change.restock ? 1 : 0), // Never touches modified_at or status; Hidden items too.
    db.prepare('UPDATE orders SET step = ?3 WHERE number = ?1 AND step = ?2').bind(change.number, change.from, change.to), // The step guard.
  ])
  if (results[2].meta.changes !== 1) { // Another admin got there first.
    const now = await readOrder(db, change.number) // Why not.
    return now === null ? { kind: 'not-found' } : { kind: 'conflict', order: now } // Nothing was written.
  }
  const order = await readOrder(db, change.number) // The order as saved.
  if (order === null) throw new Error('order-missing') // Cannot happen after a commit.
  return { kind: 'changed', order, restocked: results[0].results[0]?.restocked ?? 0 } // Quantity put back.
}
