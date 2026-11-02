// Test helpers: calls the Worker handler with a controllable rate limiter and the real test database.

import { env } from 'cloudflare:workers'
import { expect } from 'vitest'
import worker from '../src/index'

// A rate limiter that always lets the request through.
export const allowAll: RateLimit = { limit: async () => ({ success: true }) } // Always success.

/**
 * Sends one request through the Worker's handler.
 * @param path Path and query, for example `/items`.
 * @param init Request options (method, headers).
 * @param rateLimiter The rate limiter binding to use; defaults to allow-all.
 * @return The Worker's response.
 */
export async function call(
  path: string,
  init: RequestInit = {},
  rateLimiter: RateLimit = allowAll,
): Promise<Response> {
  const request = new Request(`https://api.test${path}`, init) // The host is irrelevant to routing.
  return worker.fetch(request, { ...env, RATE_LIMITER: rateLimiter }) // The handler needs no execution context.
}

/**
 * Inserts one honor row with defaults a test can override.
 * @param row Columns to override.
 * @return Resolves when the row is stored.
 */
export async function addHonor(row: Record<string, unknown>): Promise<void> {
  const h = { id: 'x', name: 'X', category: 'Nature', issued_by: 'General Conference', status: 'active', stock: 0, price_cents: 400, image: null, ...row } // Defaults plus overrides.
  await env.DB.prepare(
    'INSERT INTO honors (id, name, category, issued_by, skill_level, status, stock, price_cents, image) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)',
  ).bind(h.id, h.name, h.category, h.issued_by, h.status, h.stock, h.price_cents, h.image).run() // Positional binds.
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
