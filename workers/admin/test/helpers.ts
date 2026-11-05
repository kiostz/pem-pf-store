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

// A honor row to seed.
export interface SeedHonor {
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
 * Replaces every honor in the test database with the given rows.
 * @param honors The rows to insert; missing fields get defaults.
 * @return Nothing.
 */
export async function seedHonors(honors: SeedHonor[]): Promise<void> {
  await env.DB.prepare('DELETE FROM honors').run() // Start clean.
  await insertHonors(honors) // Then the rows.
}

/**
 * Adds honors without clearing the table, in one batch.
 * @param honors The rows to insert; missing fields get defaults.
 * @return Nothing.
 */
export async function insertHonors(honors: SeedHonor[]): Promise<void> {
  if (honors.length === 0) return // Nothing to batch.
  await env.DB.batch(
    honors.map((honor) =>
      env.DB.prepare(
        'INSERT INTO honors (id, name, category, issued_by, status, stock, price_cents, created_at, modified_at, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        honor.id,
        honor.name ?? honor.id,
        honor.category ?? 'Nature',
        honor.issuedBy ?? 'General Conference',
        honor.status ?? 'active',
        honor.stock ?? 0,
        honor.priceCents ?? 400,
        honor.createdAt ?? BACKFILL_TIME,
        honor.modifiedAt ?? BACKFILL_TIME,
        honor.image ?? null,
      ),
    ),
  ) // One transaction.
}

/**
 * Reads one honor's stock and status straight from the database.
 * @param id The honor id.
 * @return Its stock and status.
 */
export async function rowOf(id: string): Promise<{ stock: number; status: string }> {
  const row = await env.DB.prepare('SELECT stock, status FROM honors WHERE id = ?').bind(id).first<{ stock: number; status: string }>() // One row.
  if (row === null) throw new Error(`no honor ${id}`) // A test bug.
  return row
}

/**
 * Reads every stored column a test cares about, straight from the database.
 * @param id The honor id.
 * @return The row, or null when it does not exist.
 */
export async function fullRowOf(id: string): Promise<{ name: string; category: string; price_cents: number; status: string; stock: number; issued_by: string; created_at: string; modified_at: string } | null> {
  return env.DB.prepare('SELECT name, category, price_cents, status, stock, issued_by, created_at, modified_at FROM honors WHERE id = ?').bind(id).first() // Null when absent.
}

/**
 * Builds the JSON an `AdminHonor` has on the wire.
 * @param over Fields that differ from a default seeded row called `id`.
 * @return The expected honor.
 */
export function wire(over: Record<string, unknown> & { id: string }): Record<string, unknown> {
  return { name: over.id, category: 'Nature', status: 'active', stock: 0, priceCents: 400, clubAdded: false, createdAt: BACKFILL_TIME, modifiedAt: BACKFILL_TIME, image: null, ...over } // Seed defaults plus overrides.
}

/**
 * Reads one honor's stored picture key straight from the database.
 * @param id The honor id.
 * @return The key, or null when it has none or the row is gone.
 */
export async function imageOf(id: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT image FROM honors WHERE id = ?').bind(id).first<{ image: string | null }>() // One row.
  return row?.image ?? null // No row or no picture.
}

// A made-up order to seed; missing fields get defaults.
export interface SeedOrder {
  id?: number // The row id; the database picks one when absent.
  number: string // The order number.
  createdAt?: string // ISO UTC time with milliseconds.
  step?: 'new' | 'paid' | 'handed_out' | 'cancelled' // Defaults to new.
  club?: string // Defaults to Gilead.
  removedAt?: string // Marks the buyer fields as removed.
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
    const removed = order.removedAt !== undefined // Removal clears the buyer fields.
    statements.push( // The order row.
      env.DB.prepare('INSERT INTO orders (id, number, created_at, step, currency, total_cents, buyer_name, buyer_email, buyer_phone, club, personal_data_removed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind( // Every column.
        order.id ?? null, order.number, order.createdAt ?? '2026-11-05T01:00:00.000Z', order.step ?? 'new', 'MYR', total, // Id, number, time, step, currency, total.
        removed ? null : BUYER.name, removed ? null : BUYER.email, removed ? null : BUYER.phone, order.club ?? 'Gilead', order.removedAt ?? null, // Buyer, club, removal.
      ),
    )
    for (const line of lines) statements.push(env.DB.prepare('INSERT INTO order_lines (order_id, honor_id, name, quantity, price_cents) VALUES ((SELECT id FROM orders WHERE number = ?), ?, ?, ?, ?)').bind(order.number, line.itemId, line.name ?? line.itemId, line.quantity ?? 1, line.priceCents ?? 400)) // One insert per line.
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
