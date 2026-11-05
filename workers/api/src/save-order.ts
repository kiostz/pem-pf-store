// Saves an order in D1: checks stock, then writes the order, its lines and the lowered stock in one guarded batch, so no order is lost, doubled or half-written.

import type { OrderRequest, SavedOrder, StockRefusalLine } from './api-types'
import { makeOrderNumber } from './order-number'

const ATTEMPTS = 3 // Tries for a free order number (or a lost race) before giving up.
const IN_CHUNK = 90 // Ids per lookup statement; D1 allows 100 bound values.

// What saveOrder gives back.
export type SaveResult =
  | { kind: 'saved' | 'repeat'; order: SavedOrder; emailOn: boolean } // A new order, or the one a repeated request id made.
  | { kind: 'refused'; lines: StockRefusalLine[] } // Lines that cannot be filled; nothing written.

/**
 * The club text stored on the order and in the email body.
 * @param club The club from the request.
 * @return The name, or "Other: <name>" when the buyer typed it.
 */
export function clubBodyText(club: OrderRequest['club']): string {
  return club.typed ? `Other: ${club.name}` : club.name // Flags a hand-typed club.
}

/**
 * Reads a saved order and its lines by request id.
 * @param db The database.
 * @param requestId The shop's request id.
 * @return The order, or null when none has that id.
 */
export async function findByRequestId(db: D1Database, requestId: string): Promise<SavedOrder | null> {
  const row = await db
    .prepare('SELECT id, number, created_at, currency, total_cents, club FROM orders WHERE request_id = ?')
    .bind(requestId)
    .first<{ id: number; number: string; created_at: string; currency: string; total_cents: number; club: string }>() // At most one.
  if (row === null) return null // Not saved.
  const { results } = await db
    .prepare('SELECT honor_id, name, quantity, price_cents FROM order_lines WHERE order_id = ? ORDER BY rowid')
    .bind(row.id)
    .all<{ honor_id: string; name: string; quantity: number; price_cents: number }>() // Lines in insert order.
  return {
    number: row.number, // The order number.
    createdAt: row.created_at, // ISO UTC.
    currency: row.currency, // Three letters.
    totalCents: row.total_cents, // Whole cents.
    club: row.club, // The stored club text.
    lines: results.map((line) => ({ honorId: line.honor_id, name: line.name, quantity: line.quantity, priceCents: line.price_cents })), // Camel case for the API.
  }
}

/**
 * Lists every line that cannot be filled right now.
 * @param db The database.
 * @param lines The requested lines.
 * @return The short lines in request order; stock is null for a Hidden or missing item.
 */
async function findShort(db: D1Database, lines: OrderRequest['lines']): Promise<StockRefusalLine[]> {
  const stock = new Map<string, number>() // Active honors and their stock.
  const statements: D1PreparedStatement[] = [] // One lookup per chunk of ids.
  for (let i = 0; i < lines.length; i += IN_CHUNK) {
    const ids = lines.slice(i, i + IN_CHUNK).map((line) => line.honorId) // This chunk.
    statements.push(db.prepare(`SELECT id, stock FROM honors WHERE status = 'active' AND id IN (${ids.map(() => '?').join(',')})`).bind(...ids)) // Active only.
  }
  for (const result of await db.batch<{ id: string; stock: number }>(statements)) for (const row of result.results) stock.set(row.id, row.stock) // Collect.
  const short: StockRefusalLine[] = [] // The answer.
  for (const line of lines) {
    const left = stock.get(line.honorId) // Undefined when Hidden or unknown.
    if (left === undefined) short.push({ honorId: line.honorId, stock: null }) // Not for sale.
    else if (left < line.quantity) short.push({ honorId: line.honorId, stock: left }) // Not enough.
  }
  return short // Empty when every line can be filled.
}

/**
 * Writes one order, its lines and the lowered stock in one D1 batch (one transaction).
 * One `db.batch()` counts as one query toward D1's per-call limit, however many statements it holds (https://developers.cloudflare.com/d1/platform/limits/), so a 500-line order (1,002 statements) is still one call; the local runtime does not enforce that limit.
 * The SQL itself guards the write: stock below 0 breaks the CHECK, and a Hidden or missing item gives a NULL name that breaks NOT NULL, so the whole batch rolls back.
 * @param db The database.
 * @param request The validated request.
 * @param number The order number to use.
 * @param now The moment of the order.
 * @param currency The currency from settings.
 * @return Resolves when committed; rejects, with nothing written, when any guard trips.
 */
export async function insertOrderRows(
  db: D1Database,
  request: OrderRequest,
  number: string,
  now: Date,
  currency: string,
): Promise<void> {
  const statements: D1PreparedStatement[] = [
    db
      .prepare('INSERT INTO orders (number, created_at, currency, total_cents, buyer_name, buyer_email, buyer_phone, club, request_id) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)')
      .bind(number, now.toISOString(), currency, request.name, request.email, request.phone, clubBodyText(request.club), request.requestId), // The total is set below.
  ] // The order first.
  for (const line of request.lines) {
    statements.push(
      db.prepare("UPDATE honors SET stock = stock - ? WHERE id = ? AND status = 'active'").bind(line.quantity, line.honorId), // The CHECK refuses stock below 0.
      db
        .prepare("INSERT INTO order_lines (order_id, honor_id, name, quantity, price_cents) VALUES ((SELECT id FROM orders WHERE number = ?), ?, (SELECT name FROM honors WHERE id = ? AND status = 'active'), ?, (SELECT price_cents FROM honors WHERE id = ? AND status = 'active'))")
        .bind(number, line.honorId, line.honorId, line.quantity, line.honorId), // A Hidden or missing item gives NULL and NOT NULL refuses it.
    )
  }
  statements.push(
    db
      .prepare('UPDATE orders SET total_cents = (SELECT COALESCE(SUM(price_cents * quantity), 0) FROM order_lines WHERE order_id = orders.id) WHERE number = ?')
      .bind(number), // Total from the saved prices.
  )
  await db.batch(statements) // All or nothing.
}

/**
 * Saves an order, or returns the one an earlier send of the same request id made, or says which lines are short.
 * @param db The database.
 * @param request The validated request.
 * @param now The moment of the order.
 * @param randomValues Random bytes for the order number; the runtime's by default.
 * @return Saved, repeat or refused. Throws when D1 fails or no free number is found in three tries.
 */
export async function saveOrder(
  db: D1Database,
  request: OrderRequest,
  now: Date,
  randomValues?: (array: Uint8Array<ArrayBuffer>) => Uint8Array,
): Promise<SaveResult> {
  const settings = await db.prepare('SELECT currency, order_email_on FROM settings WHERE id = 1').first<{ currency: string; order_email_on: number }>() // Currency and email switch.
  if (settings === null) throw new Error('settings row missing') // A broken database is a server error.
  const emailOn = settings.order_email_on === 1 // The admin's switch.
  const earlier = await findByRequestId(db, request.requestId) // A repeat send?
  if (earlier !== null) return { kind: 'repeat', order: earlier, emailOn: false } // Answer with the saved order; no second email.
  const short = await findShort(db, request.lines) // The normal refusal path.
  if (short.length > 0) return { kind: 'refused', lines: short } // Nothing written.
  let lastError: unknown = new Error('no attempt made') // Kept for the final throw.
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const number = makeOrderNumber(now, randomValues) // A new number each try.
    try {
      await insertOrderRows(db, request, number, now, settings.currency) // The guarded write.
      const order = await findByRequestId(db, request.requestId) // Read back what D1 holds.
      if (order === null) throw new Error('saved order not found') // Cannot happen after a commit.
      return { kind: 'saved', order, emailOn } // Done.
    } catch (error) {
      lastError = error // Remember it.
      const raced = await findByRequestId(db, request.requestId) // Did a simultaneous send of this request win?
      if (raced !== null) return { kind: 'repeat', order: raced, emailOn: false } // Then this is a repeat.
      const nowShort = await findShort(db, request.lines) // Did stock change under us?
      if (nowShort.length > 0) return { kind: 'refused', lines: nowShort } // Nothing written.
    }
  }
  throw lastError // Number clashes or a database fault.
}
