// Test helpers: calls the Worker handler with a controllable rate limiter and the real test database.

import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, vi, type Mock, type MockInstance } from 'vitest'
import worker from '../src/index'

// A rate limiter that always lets the request through.
export const allowAll: RateLimit = { limit: async () => ({ success: true }) } // Always success.

/**
 * Sends one request through the Worker's handler and returns the response with its execution context.
 * @param path Path and query, for example `/items`.
 * @param init Request options (method, headers).
 * @param rateLimiter The rate limiter binding to use; defaults to allow-all.
 * @param overrides Bindings and secrets to replace for this call (a fake email binding, a broken database).
 * @return The response and the context whose `waitUntil` work has not been awaited.
 */
export async function callWith(
  path: string,
  init: RequestInit = {},
  rateLimiter: RateLimit = allowAll,
  overrides: Partial<Env> = {},
): Promise<{ res: Response; ctx: ExecutionContext }> {
  const request = new Request(`https://api.test${path}`, init) // The host is irrelevant to routing.
  const ctx = createExecutionContext() // Collects the waitUntil work.
  const res = await worker.fetch(request, { ...testEnv(), RATE_LIMITER: rateLimiter, ...overrides }, ctx) // The handler under test.
  return { res, ctx } // The caller decides whether to await the background work.
}

/**
 * Sends one request through the Worker's handler and waits for its background work (the order email).
 * @param path Path and query, for example `/items`.
 * @param init Request options (method, headers).
 * @param rateLimiter The rate limiter binding to use; defaults to allow-all.
 * @param overrides Bindings and secrets to replace for this call.
 * @return The Worker's response.
 */
export async function call(
  path: string,
  init: RequestInit = {},
  rateLimiter: RateLimit = allowAll,
  overrides: Partial<Env> = {},
): Promise<Response> {
  const { res, ctx } = await callWith(path, init, rateLimiter, overrides) // Response plus context.
  await waitOnExecutionContext(ctx) // The email is sent before the test looks.
  return res // The answer.
}

export const SHOP = 'https://kiostz.github.io' // The one allowed origin.
export const TEST_SECRET = '1x0000000000000000000000000000000AA' // Cloudflare's always-passing Turnstile test secret.
export const CLUB_INBOX = 'club@example.test' // A made-up inbox.

/**
 * Builds the test environment: the real bindings plus the secrets and a fake email binding.
 * @return The environment every call starts from.
 */
function testEnv(): Env {
  return { ...env, SHOP_ORIGIN: SHOP, TURNSTILE_SECRET: TEST_SECRET, ORDER_EMAIL_TO: CLUB_INBOX, ORDER_EMAIL: fakeEmail() } // The live origin whatever a local .dev.vars says; secrets are not in wrangler.jsonc.
}

/**
 * Makes an email binding that records what it is given.
 * @param behaviour What `send` does; defaults to resolving.
 * @return The binding; `send` is a mock.
 */
export function fakeEmail(behaviour: () => Promise<unknown> = async () => ({ messageId: 'm1' })): SendEmail & { send: Mock } {
  return { send: vi.fn(behaviour) } as unknown as SendEmail & { send: Mock } // Only `send` is used.
}

/**
 * Makes `globalThis.fetch` answer Turnstile's siteverify.
 * @param outcome 'passed', 'failed' or 'throws'.
 * @return The spy, so a test can read the calls.
 */
export function mockSiteverify(outcome: 'passed' | 'failed' | 'throws' = 'passed'): MockInstance {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    if (outcome === 'throws') throw new Error('network down') // Cloudflare unreachable.
    return Response.json({ success: outcome === 'passed' }) // Turnstile's answer.
  })
}

let requestCounter = 0 // Makes every default request id different.

/**
 * Builds a valid order request body.
 * @param overrides Fields to replace.
 * @return The body as an object.
 */
export function validOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  requestCounter += 1 // A new id per body.
  return {
    requestId: `00000000-0000-4000-8000-${String(requestCounter).padStart(12, '0')}`, // A UUID.
    turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX', // Cloudflare's dummy token.
    name: 'Ana Tester', // Made-up buyer.
    email: 'ana@example.com', // Made-up buyer.
    phone: '+60 12-345 6789', // 11 digits.
    club: { name: 'Gilead', typed: false }, // A listed club.
    lines: [{ itemId: 'knots', quantity: 2 }], // One line.
    ...overrides, // The test's change.
  }
}

/**
 * Posts an order to the Worker.
 * @param body The body object, or a raw string.
 * @param options `origin` (null sends none), `overrides` for the environment, `limiter`.
 * @return The response and context.
 */
export async function postOrder(
  body: unknown,
  options: { origin?: string | null; overrides?: Partial<Env>; limiter?: RateLimit } = {},
): Promise<{ res: Response; ctx: ExecutionContext }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7' } // A test IP.
  const origin = options.origin === undefined ? SHOP : options.origin // Default: the shop.
  if (origin !== null) headers.Origin = origin // Omitted for the missing-Origin test.
  return callWith('/orders', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }, options.limiter, options.overrides) // The send.
}

/**
 * Counts rows in a table.
 * @param table The table name (test code only).
 * @return The row count.
 */
export async function count(table: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>() // One row.
  return row!.n // Always present.
}

/**
 * Empties every table and seeds settings plus three items: knots (stock 5, 300), rope (stock 1, 450), secret (hidden, stock 9).
 * @return Resolves when seeded.
 */
export async function seedShop(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM order_lines'), // Lines first.
    env.DB.prepare('DELETE FROM orders'), // Then orders.
    env.DB.prepare('DELETE FROM items'), // Then items.
    env.DB.prepare('DELETE FROM settings'), // Then settings.
  ])
  await addSettings() // MYR, email on.
  await addItem({ id: 'knots', name: 'Knot Tying', stock: 5, price_cents: 300 }) // Plenty.
  await addItem({ id: 'rope', name: 'Rope Work', stock: 1, price_cents: 450 }) // The last one.
  await addItem({ id: 'secret', name: 'Secret Patch', status: 'hidden', stock: 9, price_cents: 500 }) // Not for sale.
}

/**
 * Inserts one item row with defaults a test can override.
 * @param row Columns to override.
 * @return Resolves when the row is stored.
 */
export async function addItem(row: Record<string, unknown>): Promise<void> {
  const h = { id: 'x', name: 'X', category: 'Nature', issued_by: 'General Conference', status: 'active', stock: 0, price_cents: 400, image: null, subcategory_id: null, ...row } // Defaults plus overrides; no subcategory unless given.
  await env.DB.prepare(
    'INSERT INTO items (id, name, category, issued_by, skill_level, status, stock, price_cents, image, subcategory_id) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)', // The subcategory id is last.
  ).bind(h.id, h.name, h.category, h.issued_by, h.status, h.stock, h.price_cents, h.image, h.subcategory_id).run() // Positional binds.
}

/**
 * Inserts the single settings row (MYR, default price 400, order email on).
 * @return Resolves when the row is stored.
 */
export async function addSettings(): Promise<void> {
  await env.DB.exec("INSERT INTO settings (id, currency, default_price_cents, order_email_on) VALUES (1, 'MYR', 400, 1)") // The one row.
}

/**
 * Asserts the headers every response must carry.
 * @param res The response to check.
 * @return Nothing; throws through `expect` on a mismatch.
 */
export function expectJsonNoStore(res: Response): void {
  expect(res.headers.get('Cache-Control')).toBe('no-store') // Stock changes, so never cacheable.
  expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8') // JSON with charset.
}

/**
 * Inserts one order with its lines at a given time and step, for a made-up buyer.
 * @param order `number`, `createdAt` (ISO UTC with milliseconds), `step` (default new) and `lineCount` (default 1).
 * @return The new order's row id.
 */
export async function addOrder(order: { number: string; createdAt: string; step?: string; lineCount?: number }): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO orders (number, created_at, step, currency, total_cents, buyer_name, buyer_email, buyer_phone, club) VALUES (?, ?, ?, 'MYR', 900, 'Ana Tester', 'ana@example.test', '+60 12 000 0000', 'Gilead') RETURNING id",
  ).bind(order.number, order.createdAt, order.step ?? 'new').first<{ id: number }>() // The order row.
  for (let i = 0; i < (order.lineCount ?? 1); i += 1) {
    await env.DB.prepare("INSERT INTO order_lines (order_id, item_id, name, quantity, price_cents) VALUES (?, ?, 'Knot Tying', 1, 300)").bind(row!.id, `line-${i}`).run() // One line each, ids differ.
  }
  return row!.id // For the caller's checks.
}
