// API Worker entry: rate limit, router, CORS and short error codes for the public read endpoints and the order endpoint.

import { parseOrderRequest } from './order-request'
import { sendOrderEmail } from './order-email'
import { removeOldOrders } from './remove-old-orders'
import { saveOrder } from './save-order'
import { verifyTurnstile } from './turnstile'
import { readClubs, readHonors, readSettings, readShop } from './read'

// Maps each exact path to its reader.
const routes = new Map<string, (db: D1Database) => Promise<unknown>>([
  ['/items', readHonors], // The public path says items; code says honors.
  ['/clubs', readClubs], // Clubs in order.
  ['/settings', readSettings], // Currency only.
  ['/shop', readShop], // Items, clubs and settings in one request.
])

/**
 * Builds a JSON response with the headers every answer carries.
 * @param body The value to serialise.
 * @param status The HTTP status.
 * @param origin The request's Origin header, or null.
 * @param shopOrigin The one origin allowed by CORS.
 * @param extra More headers for this answer.
 * @return The response.
 */
function reply(
  body: unknown,
  status: number,
  origin: string | null,
  shopOrigin: string,
  extra: Record<string, string> = {},
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8', // Charset spelled out for old clients.
    'Cache-Control': 'no-store', // Stock changes and workers.dev cannot cache.
    Vary: 'Origin', // The CORS header depends on the caller.
    ...extra, // Per-answer headers such as Allow.
  })
  if (origin === shopOrigin) headers.set('Access-Control-Allow-Origin', shopOrigin) // Exact match only.
  return new Response(JSON.stringify(body), { status, headers }) // Body is always JSON.
}

const MAX_BODY_BYTES = 64 * 1024 // Largest order body accepted.

/**
 * Reads a request body, giving up as soon as it passes a byte cap.
 * @param request The incoming request.
 * @param maxBytes The most bytes to accept.
 * @return The body bytes, or null when the body is over the cap.
 */
async function readCapped(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  if (request.body === null) return new Uint8Array(0) // No body.
  const reader = request.body.getReader() // Chunk by chunk.
  const chunks: Uint8Array[] = [] // Kept until the end.
  let total = 0 // Bytes so far.
  for (;;) {
    const { done, value } = await reader.read() // Next chunk.
    if (done) break // End of body.
    total += value.byteLength // Count it.
    if (total > maxBytes) {
      await reader.cancel() // Stop the upload.
      return null // Over the cap.
    }
    chunks.push(value) // Keep it.
  }
  const out = new Uint8Array(total) // The whole body.
  let at = 0 // Write position.
  for (const chunk of chunks) {
    out.set(chunk, at) // Copy in order.
    at += chunk.byteLength // Move on.
  }
  return out // Within the cap.
}

/**
 * Handles POST /orders: origin, body, captcha, save, then the email in the background.
 * @param request The incoming request.
 * @param env The Worker bindings.
 * @param ctx The execution context, for the background email.
 * @param ip The caller's address, or 'unknown'.
 * @param send Builds a response with this request's CORS context.
 * @return The JSON response.
 */
async function handleOrder(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  ip: string,
  send: (body: unknown, status: number, extra?: Record<string, string>) => Response,
): Promise<Response> {
  if (request.headers.get('Origin') !== env.SHOP_ORIGIN) return send({ error: 'forbidden-origin' }, 403) // Browsers send it; others are refused before the captcha is spent.
  const declared = Number(request.headers.get('Content-Length')) // NaN or 0 when absent.
  if (declared > MAX_BODY_BYTES) return send({ error: 'invalid' }, 400) // Refused before any of the body is read.
  const raw = await readCapped(request, MAX_BODY_BYTES) // Stops reading at the cap, whatever the header says.
  if (raw === null) return send({ error: 'invalid' }, 400) // Too big.
  let json: unknown // The parsed body.
  try {
    json = JSON.parse(new TextDecoder().decode(raw)) // Throws on non-JSON.
  } catch {
    return send({ error: 'invalid' }, 400) // Not JSON.
  }
  const parsed = parseOrderRequest(json) // Validation where the data enters.
  if (parsed === null) return send({ error: 'invalid' }, 400) // No field named.
  const captcha = await verifyTurnstile(parsed.turnstileToken, env.TURNSTILE_SECRET, ip) // Solved?
  if (captcha === 'failed') return send({ error: 'captcha' }, 403) // The buyer must solve it again.
  if (captcha === 'unavailable') return send({ error: 'captcha-unavailable' }, 503) // Cloudflare did not answer.
  const result = await saveOrder(env.DB, parsed, new Date()) // Stock check and guarded save.
  if (result.kind === 'refused') return send({ error: 'stock', lines: result.lines }, 409) // Nothing written.
  if (result.kind === 'saved' && result.emailOn) ctx.waitUntil(sendOrderEmail(env, result.order, parsed)) // After the save, not awaited.
  return send(result.order, result.kind === 'saved' ? 201 : 200) // The saved order, no buyer fields.
}

/**
 * Handles one request.
 * @param request The incoming request.
 * @param env The Worker bindings.
 * @param ctx The execution context.
 * @return The JSON response.
 */
async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get('Origin') // Null when absent.
  /**
   * Answers with this request's CORS context.
   * @param body The value to serialise.
   * @param status The HTTP status.
   * @param extra More headers for this answer.
   * @return The response.
   */
  const send = (body: unknown, status: number, extra?: Record<string, string>): Response =>
    reply(body, status, origin, env.SHOP_ORIGIN, extra) // Same origin for every answer.
  const path = new URL(request.url).pathname // Exact match, so /items/ is unknown.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown' // Shared bucket if the header is missing.
  try {
    const { success } = await env.RATE_LIMITER.limit({ key: ip }) // Counts this request.
    if (!success) return send({ error: 'rate-limited' }, 429, { 'Retry-After': '60' }) // Window length.
  } catch (error) {
    console.error('rate limiter failed', error instanceof Error ? error.name : 'unknown') // Fail open: error class only.
  }
  try {
    if (path === '/orders') {
      if (request.method === 'OPTIONS') {
        const allowed = origin === env.SHOP_ORIGIN // Only the shop gets a preflight grant.
        return new Response(null, { status: 204, headers: allowed ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : { Vary: 'Origin' } }) // 204 for everyone.
      }
      if (request.method !== 'POST') return send({ error: 'method-not-allowed' }, 405, { Allow: 'POST, OPTIONS' }) // Writes only.
      return await handleOrder(request, env, ctx, ip, send) // The order.
    }
    const read = routes.get(path) // Exact path lookup.
    if (read === undefined) return send({ error: 'not-found' }, 404) // Unknown path.
    if (request.method !== 'GET') return send({ error: 'method-not-allowed' }, 405, { Allow: 'GET' }) // Reads only.
    return send(await read(env.DB), 200) // The data.
  } catch (error) {
    console.error('request failed', path, error instanceof Error ? error.name : 'unknown') // Route and error class only.
    return send({ error: 'server' }, 500) // Short code, no details.
  }
}

/**
 * Runs the nightly Old order removal; logs the error name only, then throws a fixed error so the cron history shows the run as failed; the next night tries again.
 * @param controller The scheduled event, whose time sets the cutoff.
 * @param env The Worker bindings.
 * @return Resolves when the job finished; rejects with a fixed error when it failed.
 */
async function scheduled(controller: ScheduledController, env: Env): Promise<void> {
  let failed = false // Set in the catch, so the fixed error is thrown outside it.
  try {
    const deleted = await removeOldOrders(env.DB, new Date(controller.scheduledTime)) // By the event's time, not the wall clock.
    console.log(`old orders deleted ${deleted}`) // The count only.
  } catch (error) {
    failed = true // Remember the failure.
    console.error(`old order removal failed ${error instanceof Error ? error.name : 'unknown'}`) // The error name only.
  }
  if (failed) throw new Error('old order removal failed') // Fixed text, never the original error or its message, so the run shows as failed.
}

export default {
  fetch: handle, // Public reads and the order endpoint.
  scheduled, // The nightly Old order removal.
} satisfies ExportedHandler<Env>
