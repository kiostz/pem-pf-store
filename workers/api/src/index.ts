// API Worker entry: rate limit, router, CORS and short error codes for the public read endpoints.

import { readClubs, readHonors, readSettings } from './read'

// Maps each exact path to its reader.
const routes = new Map<string, (db: D1Database) => Promise<unknown>>([
  ['/items', readHonors], // The public path says items; code says honors.
  ['/clubs', readClubs], // Clubs in order.
  ['/settings', readSettings], // Currency only.
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

/**
 * Handles one request.
 * @param request The incoming request.
 * @param env The Worker bindings.
 * @return The JSON response.
 */
async function handle(request: Request, env: Env): Promise<Response> {
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
    const read = routes.get(path) // Exact path lookup.
    if (read === undefined) return send({ error: 'not-found' }, 404) // Unknown path.
    if (request.method !== 'GET') return send({ error: 'method-not-allowed' }, 405, { Allow: 'GET' }) // Reads only.
    return send(await read(env.DB), 200) // The data.
  } catch (error) {
    console.error('request failed', path, error instanceof Error ? error.name : 'unknown') // Route and error class only.
    return send({ error: 'server' }, 500) // Short code, no details.
  }
}

export default {
  fetch: handle, // The Worker's only entry point.
} satisfies ExportedHandler<Env>
