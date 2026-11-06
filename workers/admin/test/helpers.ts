// Test helpers: calls the Admin Worker handler with a controllable Access context, env and the real test database.

import { env } from 'cloudflare:workers'
import { createHandler } from '../src/handler'

// Stand-in page files, so tests never import the built ui-dist.
export const pages = { html: '<!doctype html><title>PAGE</title>', js: 'JS-BODY', css: 'CSS-BODY' }

// The handler under test.
const handler = createHandler(pages)

// How a test shapes the Access context and env of one call.
export interface CallOptions {
  access?: 'none' | { aud?: string; email?: string | null; throws?: boolean } // Absent ctx.access, or its aud, identity email and whether the lookup throws.
  env?: Partial<Env> // Env overrides, such as ADMIN_EMAILS or a failing DB.
}

/**
 * Sends one request through the Admin Worker's handler.
 * @param path Path and query, for example `/api/items`.
 * @param init Request options (method, headers, body).
 * @param options The Access context and env overrides; defaults to a signed-in admin.
 * @return The Worker's response.
 */
export async function call(path: string, init: RequestInit = {}, options: CallOptions = {}): Promise<Response> {
  const request = new Request(`https://admin.test${path}`, init) // The host decides the own origin.
  const testEnv = { ...env, ACCESS_AUD: 'local-dev', ADMIN_EMAILS: 'admin@example.test, second@example.test', ...options.env } // Same as .dev.vars.
  const access = options.access === 'none' ? undefined : (options.access ?? {}) // Signed in unless told otherwise.
  const ctx = {
    waitUntil: () => {}, // Unused.
    passThroughOnException: () => {}, // Unused.
    props: {},
    ...(access === undefined
      ? {}
      : {
          access: {
            aud: access.aud ?? 'local-dev', // Matches ACCESS_AUD by default.
            getIdentity: async () => {
              if (access.throws) throw new Error('lookup failed') // The identity call fails.
              return access.email === null ? undefined : { email: access.email ?? 'admin@example.test' } // No identity when null.
            },
          },
        }),
  } as unknown as ExecutionContext // The test ctx carries only what the handler reads.
  return handler(request as Parameters<typeof handler>[0], testEnv, ctx) // Same entry as the live Worker; the cast adds the cf field Cloudflare sets.
}

/**
 * Sends a JSON POST as the page would: own origin and JSON.
 * @param path The route path.
 * @param body The value to send as JSON.
 * @param init Header or body overrides.
 * @param options The Access context and env overrides.
 * @return The Worker's response.
 */
export function postTo(path: string, body: unknown, init: RequestInit = {}, options: CallOptions = {}): Promise<Response> {
  return call(
    path,
    {
      method: 'POST',
      headers: { Origin: 'https://admin.test', 'Content-Type': 'application/json' }, // What the page sends.
      body: JSON.stringify(body),
      ...init, // A test may replace any of them.
    },
    options,
  )
}

/**
 * Sends a save request as the page would.
 * @param body The value to send as JSON.
 * @param init Header or body overrides.
 * @param options The Access context and env overrides.
 * @return The Worker's response.
 */
export function postChanges(body: unknown, init: RequestInit = {}, options: CallOptions = {}): Promise<Response> {
  return postTo('/api/items/changes', body, init, options) // The save route.
}

// The time every seeded row carries unless a test says otherwise (the migration's backfill value).
export const BACKFILL_TIME = '2026-11-01T00:00:00.000Z'

// An item row to seed.
export interface SeedItem {
  id: string
  name?: string
  category?: string
  status?: 'active' | 'hidden'
  stock?: number
  priceCents?: number
  issuedBy?: string
  createdAt?: string
  modifiedAt?: string
  image?: string | null // The picture key, if any.
}

/**
 * Replaces every item in the test database with the given rows.
 * @param items The rows to insert; missing fields get defaults.
 * @return Nothing.
 */
export async function seedItems(items: SeedItem[]): Promise<void> {
  await env.DB.prepare('DELETE FROM items').run() // Start clean.
  await insertItems(items) // Then the rows.
}

/**
 * Adds items without clearing the table, in one batch.
 * @param items The rows to insert; missing fields get defaults.
 * @return Nothing.
 */
export async function insertItems(items: SeedItem[]): Promise<void> {
  if (items.length === 0) return // Nothing to batch.
  await env.DB.batch(
    items.map((item) =>
      env.DB.prepare(
        'INSERT INTO items (id, name, category, issued_by, status, stock, price_cents, created_at, modified_at, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        item.id,
        item.name ?? item.id,
        item.category ?? 'Nature',
        item.issuedBy ?? 'General Conference',
        item.status ?? 'active',
        item.stock ?? 0,
        item.priceCents ?? 400,
        item.createdAt ?? BACKFILL_TIME,
        item.modifiedAt ?? BACKFILL_TIME,
        item.image ?? null,
      ),
    ),
  ) // One transaction.
}

/**
 * Reads one item's stock and status straight from the database.
 * @param id The item id.
 * @return Its stock and status.
 */
export async function rowOf(id: string): Promise<{ stock: number; status: string }> {
  const row = await env.DB.prepare('SELECT stock, status FROM items WHERE id = ?').bind(id).first<{ stock: number; status: string }>() // One row.
  if (row === null) throw new Error(`no item ${id}`) // A test bug.
  return row
}

/**
 * Reads every stored column a test cares about, straight from the database.
 * @param id The item id.
 * @return The row, or null when it does not exist.
 */
export async function fullRowOf(id: string): Promise<{ name: string; category: string; price_cents: number; status: string; stock: number; issued_by: string; created_at: string; modified_at: string } | null> {
  return env.DB.prepare('SELECT name, category, price_cents, status, stock, issued_by, created_at, modified_at FROM items WHERE id = ?').bind(id).first() // Null when absent.
}

/**
 * Builds the JSON an `AdminItem` has on the wire.
 * @param over Fields that differ from a default seeded row called `id`.
 * @return The expected item.
 */
export function wire(over: Record<string, unknown> & { id: string }): Record<string, unknown> {
  return { name: over.id, category: 'Nature', status: 'active', stock: 0, priceCents: 400, clubAdded: false, createdAt: BACKFILL_TIME, modifiedAt: BACKFILL_TIME, image: null, ...over } // Seed defaults plus overrides.
}

/**
 * Reads one item's stored picture key straight from the database.
 * @param id The item id.
 * @return The key, or null when it has none or the row is gone.
 */
export async function imageOf(id: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT image FROM items WHERE id = ?').bind(id).first<{ image: string | null }>() // One row.
  return row?.image ?? null // No row or no picture.
}

// A made-up order to seed; missing fields get defaults.
export interface SeedOrder {
  id?: number // The row id; the database picks one when absent.
  number: string // The order number.
  createdAt?: string // ISO UTC time with milliseconds.
  step?: 'new' | 'paid' | 'handed_out' | 'cancelled' // Defaults to new.
  club?: string // Defaults to Gilead.
  lines?: { itemId: string; name?: string; quantity?: number; priceCents?: number }[] // Defaults to one line of item-1.
}

// The made-up buyer every seeded order carries; tests grep for these values in logs and errors.
export const BUYER = { name: 'Ana Tester', email: 'ana@example.com', phone: '+60 12-345 6789' }

/**
 * Builds a valid order number from a counter.
 * @param n A counter from 0 to 960.
 * @return A number such as PF-20261105-223A.
 */
export function orderNumber(n: number): string {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' // The shop's 31 characters.
  return `PF-20261105-22${alphabet[Math.floor(n / 31)]}${alphabet[n % 31]}` // Two fixed characters then the counter.
}

/**
 * Replaces every order and order line with the given made-up orders, in one batch.
 * @param orders The orders to insert.
 * @return Nothing.
 */
export async function seedOrders(orders: SeedOrder[]): Promise<void> {
  const statements = [env.DB.prepare('DELETE FROM order_lines'), env.DB.prepare('DELETE FROM orders')] // Start clean.
  for (const order of orders) { // One insert per order, then its lines.
    const lines = order.lines ?? [{ itemId: 'item-1' }] // One default line.
    const total = lines.reduce((sum, line) => sum + (line.priceCents ?? 400) * (line.quantity ?? 1), 0) // The stored total.
    statements.push( // The order row.
      env.DB.prepare('INSERT INTO orders (id, number, created_at, step, currency, total_cents, buyer_name, buyer_email, buyer_phone, club) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind( // Every column.
        order.id ?? null, order.number, order.createdAt ?? '2026-11-05T01:00:00.000Z', order.step ?? 'new', 'MYR', total, // Id, number, time, step, currency, total.
        BUYER.name, BUYER.email, BUYER.phone, order.club ?? 'Gilead', // Buyer and club.
      ),
    )
    for (const line of lines) statements.push(env.DB.prepare('INSERT INTO order_lines (order_id, item_id, name, quantity, price_cents) VALUES ((SELECT id FROM orders WHERE number = ?), ?, ?, ?, ?)').bind(order.number, line.itemId, line.name ?? line.itemId, line.quantity ?? 1, line.priceCents ?? 400)) // One insert per line.
  }
  await env.DB.batch(statements) // One transaction.
}

/**
 * Reads an order's step straight from the database.
 * @param number The order number.
 * @return The step.
 */
export async function stepOf(number: string): Promise<string> {
  const row = await env.DB.prepare('SELECT step FROM orders WHERE number = ?').bind(number).first<{ step: string }>() // One row.
  if (row === null) throw new Error('no order') // A test bug.
  return row.step // The step text.
}

// A club row to seed; missing fields get defaults.
export interface SeedClub {
  id: number // The row id.
  name?: string // Defaults to `Club <id>`.
  area?: string | null // Defaults to null.
  language?: string | null // Defaults to null.
  location?: string | null // Defaults to null.
  churchName?: string | null // Defaults to null.
  position?: number // Defaults to the id.
}

/**
 * Replaces every club in the test database with the given rows, in one batch.
 * @param clubs The rows to insert.
 * @return Nothing.
 */
export async function seedClubs(clubs: SeedClub[]): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM clubs'), // Start clean.
    ...clubs.map((club) => env.DB.prepare('INSERT INTO clubs (id, name, area, language, location, church_name, position) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(club.id, club.name ?? `Club ${club.id}`, club.area ?? null, club.language ?? null, club.location ?? null, club.churchName ?? null, club.position ?? club.id)), // One insert each.
  ]) // One transaction.
}

/**
 * Reads every club row as stored, in id order, for before/after comparisons.
 * @return The raw rows.
 */
export async function clubRows(): Promise<Record<string, unknown>[]> {
  return (await env.DB.prepare('SELECT * FROM clubs ORDER BY id').all()).results // Every column.
}

/**
 * Builds the JSON an `AdminClub` has on the wire.
 * @param id The row id.
 * @param over Fields that differ from the seeded defaults.
 * @return The expected club.
 */
export function clubWire(id: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, name: `Club ${id}`, area: null, language: null, location: null, churchName: null, ...over } // Seed defaults plus overrides.
}

// A club's four optional fields (no name), all blank.
export const BLANK = { area: null, language: null, location: null, churchName: null }

/**
 * Builds a database stand-in that runs a change right after the first read whose SQL matches, so a test can lose a race between a read and the write after it.
 * @param pattern The SQL of the read to follow.
 * @param change What another admin does in that gap.
 * @return A database for `CallOptions.env.DB`; every other statement and `batch` pass through.
 */
export function racingAfterRead(pattern: RegExp, change: () => Promise<unknown>): D1Database {
  let fired = false // The change happens once.
  /**
   * Wraps a prepared statement so its first matching read or write fires the change.
   * @param statement The real prepared statement.
   * @return A statement that keeps following after `bind` and settles on a read, `run` or `raw`.
   */
  const follow = (statement: D1PreparedStatement): D1PreparedStatement => ({
    bind: (...values: unknown[]) => follow(statement.bind(...values)), // Keep following after the values are bound.
    all: async () => settle(await statement.all()), // A list read.
    first: async (column?: string) => settle(await (column === undefined ? statement.first() : statement.first(column))), // A one-row read.
    run: async () => settle(await statement.run()), // A matched write also fires the change, after it runs.
    raw: async (...args: unknown[]) => settle(await (statement.raw as (...a: unknown[]) => Promise<unknown>)(...args)), // Raw rows pass through.
  }) as unknown as D1PreparedStatement
  /**
   * Fires the change once, after the first matching statement (read, `run` or `raw`) has its result.
   * @param result What the statement returned.
   * @return The same result, unchanged by the change that fires after it.
   */
  const settle = async <T,>(result: T): Promise<T> => {
    if (!fired) { fired = true; await change() } // The other admin writes now.
    return result // What the read saw before the change.
  }
  return {
    prepare: (sql: string) => (pattern.test(sql) ? follow(env.DB.prepare(sql)) : env.DB.prepare(sql)), // Only the matching read is wrapped.
    batch: (statements: D1PreparedStatement[]) => env.DB.batch(statements), // Real statements only.
  } as unknown as D1Database
}
