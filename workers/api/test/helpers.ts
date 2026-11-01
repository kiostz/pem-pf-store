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
 * Asserts the headers every response must carry.
 * @param res The response to check.
 * @return Nothing; throws through `expect` on a mismatch.
 */
export function expectJsonNoStore(res: Response): void {
  expect(res.headers.get('Cache-Control')).toBe('no-store') // Stock changes, so never cacheable.
  expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8') // JSON with charset.
}
