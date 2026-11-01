// Test helpers: calls the Admin Worker handler with a controllable Access context, env and the real test database.

import { env } from 'cloudflare:workers'
import { createHandler } from '../src/handler'

// Stand-in page files, so tests never import the built ui-dist.
export const pages = { html: '<!doctype html><title>PAGE</title>', js: 'JS-BODY', css: 'CSS-BODY' }

// The handler under test.
const handler = createHandler(pages)

// How a test shapes the Access context and env of one call.
export interface CallOptions {
  access?: 'none' | { aud?: string; email?: string | null } // Absent ctx.access, or its aud and identity email.
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
            getIdentity: async () => (access.email === null ? undefined : { email: access.email ?? 'admin@example.test' }), // No identity when null.
          },
        }),
  } as unknown as ExecutionContext // The test ctx carries only what the handler reads.
  return handler(request as Parameters<typeof handler>[0], testEnv, ctx) // Same entry as the live Worker; the cast adds the cf field Cloudflare sets.
}

/**
 * Sends a save request as the page would: own origin and JSON.
 * @param body The value to send as JSON.
 * @param init Header or body overrides.
 * @param options The Access context and env overrides.
 * @return The Worker's response.
 */
export function postChanges(body: unknown, init: RequestInit = {}, options: CallOptions = {}): Promise<Response> {
  return call(
    '/api/items/changes',
    {
      method: 'POST',
      headers: { Origin: 'https://admin.test', 'Content-Type': 'application/json' }, // What the page sends.
      body: JSON.stringify(body),
      ...init, // A test may replace any of them.
    },
    options,
  )
}

// A honor row to seed.
export interface SeedHonor {
  id: string
  name?: string
  category?: string
  status?: 'active' | 'hidden'
  stock?: number
}

/**
 * Replaces every honor in the test database with the given rows.
 * @param honors The rows to insert; missing fields get defaults.
 * @return Nothing.
 */
export async function seedHonors(honors: SeedHonor[]): Promise<void> {
  await env.DB.prepare('DELETE FROM honors').run() // Start clean.
  for (const honor of honors) {
    await env.DB.prepare(
      'INSERT INTO honors (id, name, category, issued_by, status, stock, price_cents) VALUES (?, ?, ?, ?, ?, ?, 400)',
    )
      .bind(honor.id, honor.name ?? honor.id, honor.category ?? 'Nature', 'GC', honor.status ?? 'active', honor.stock ?? 0)
      .run() // Price and issuer are irrelevant here.
  }
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
