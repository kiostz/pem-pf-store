// Admin Worker request handler: the Access gate, CSRF checks, router, headers and short error codes.

import { readAdminHonors, saveHonorChanges, UnknownHonorError } from './honors' // The reads and the guarded save.
import { parseHonorChanges } from './validate-changes' // The body validator.

// The built admin page files, handed in by index.ts (tests pass stand-ins).
export interface Pages {
  html: string // The page.
  js: string // The script.
  css: string // The styles.
}

// The `ACCESS_AUD` value that ships in wrangler.jsonc; it refuses everything.
const PLACEHOLDER_AUD = 'set-after-access'
// Largest accepted request body, in bytes.
const MAX_BODY_BYTES = 64 * 1024
// What the page may load and do; scripts and styles come from the same origin only.
const CSP = "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"

// Where "Browse more" leads.
const SHOP_URL = 'https://kiostz.github.io/pem-pf-store/'
// The not-allowed page's styles, in the shop's tokens (light, and dark by the browser setting); inline, so its CSP carries their hash.
const NOT_ALLOWED_STYLE = `
:root{color-scheme:light dark;--page:#F3F0EC;--card:#FFFFFF;--ink:#1D1D1F;--muted:#55555A;--line:#D2D2D7;--btn:#4A1520;--btn-hover:#33101A;--btn-ink:#F3F0EC;--ring:#3B82F6}
@media (prefers-color-scheme: dark){:root{--page:#000000;--card:#1C1C1E;--ink:#F5F5F7;--muted:#A1A1A6;--line:#38383A;--btn:#E8B4BC;--btn-hover:#F0C4CA;--btn-ink:#4A1520;--ring:#8AB4FF}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--page);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.5}
main{width:100%;max-width:420px;padding:32px 24px;background:var(--card);border:1px solid var(--line);border-radius:24px}
p.brand{margin:0 0 8px;font-size:14px;color:var(--muted)}
h1{margin:0 0 12px;font-size:28px;line-height:1.15;font-weight:700}
p.body{margin:0 0 24px;color:var(--muted)}
a{display:flex;align-items:center;justify-content:center;min-height:44px;border-radius:999px;font-weight:600;text-decoration:none}
a.primary{background:var(--btn);color:var(--btn-ink)}
a.primary:hover{background:var(--btn-hover)}
a.quiet{margin-top:8px;color:var(--ink)}
a.quiet:hover{text-decoration:underline}
a:focus-visible{outline:3px solid var(--ring);outline-offset:2px}
`
// The not-allowed page; it never carries the signed-in email or which check failed.
const NOT_ALLOWED_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Not allowed · PEM Pathfinder Store</title>
<style>${NOT_ALLOWED_STYLE}</style>
</head>
<body>
<main>
<p class="brand">PEM Pathfinder Store</p>
<h1>This account can't open the admin</h1>
<p class="body">You're signed in, but this account isn't on the admin list. Sign in with another account, or ask the store admin to add you.</p>
<a class="primary" href="/cdn-cgi/access/logout">Sign in with another account</a>
<a class="quiet" href="${SHOP_URL}">Browse more</a>
</main>
</body>
</html>
`
// The CSP of the not-allowed page: nothing loads, and only the one inline style (by hash) applies; computed on first use.
let notAllowedCsp: Promise<string> | undefined

/**
 * Builds a not-allowed page CSP carrying the hash of its inline style.
 * @return The policy text, cached after the first call.
 */
function getNotAllowedCsp(): Promise<string> {
  notAllowedCsp ??= crypto.subtle.digest('SHA-256', new TextEncoder().encode(NOT_ALLOWED_STYLE)).then((digest) => { // Hash the exact style text.
    const hash = btoa(String.fromCharCode(...new Uint8Array(digest))) // Base64 of the digest.
    return `default-src 'none'; style-src 'sha256-${hash}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` // No script, no loads.
  })
  return notAllowedCsp
}

/**
 * Builds the 403 page for a refused page request (HEAD gets the headers only).
 * @param method The request method, GET or HEAD.
 * @return The response.
 */
async function notAllowedPage(method: string): Promise<Response> {
  return respond(method === 'HEAD' ? '' : NOT_ALLOWED_HTML, 403, { // No body for HEAD.
    'Content-Type': 'text/html; charset=utf-8', // An HTML page.
    'Content-Security-Policy': await getNotAllowedCsp(), // Strict policy with the style hash.
    'X-Content-Type-Options': 'nosniff', // Types stay as declared.
    'Referrer-Policy': 'no-referrer', // Nothing leaks in the Referer.
  })
}

/**
 * Builds a response with the headers every answer carries.
 * @param body The response body.
 * @param status The HTTP status.
 * @param headers More headers (content type, Allow, security headers).
 * @return The response.
 */
function respond(body: string, status: number, headers: Record<string, string>): Response {
  return new Response(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } }) // Nothing is cacheable.
}

/**
 * Builds a JSON response.
 * @param body The value to serialise.
 * @param status The HTTP status.
 * @param extra More headers.
 * @return The response.
 */
function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return respond(JSON.stringify(body), status, { 'Content-Type': 'application/json; charset=utf-8', ...extra }) // Charset spelled out.
}

/**
 * Builds a page-file response.
 * @param body The file text.
 * @param type The content type.
 * @param extra More headers.
 * @return The response.
 */
function file(body: string, type: string, extra: Record<string, string> = {}): Response {
  return respond(body, 200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...extra }) // nosniff keeps the types honest.
}

/**
 * Splits the `ADMIN_EMAILS` secret into trimmed, lower-case, non-empty addresses.
 * @param list The comma-separated secret, possibly missing.
 * @return The addresses.
 */
function parseEmails(list: string | undefined): string[] {
  return (typeof list === 'string' ? list : '') // Missing secret counts as empty.
    .split(',') // One entry per comma.
    .map((email) => email.trim().toLowerCase()) // Normalise each address.
    .filter((email) => email.length > 0) // Empty entries are dropped.
}

/**
 * The gate: Access must have signed in an admin whose email is on the list.
 * @param ctx The execution context, with `access` only when Access signed the request in.
 * @param env The Worker bindings.
 * @return True only for an allowed admin.
 */
async function isAllowed(ctx: ExecutionContext, env: Env): Promise<boolean> {
  const aud = env.ACCESS_AUD // The Access app tag.
  if (typeof aud !== 'string' || aud.trim() === '' || aud === PLACEHOLDER_AUD) return false // Not set up yet: closed.
  if (ctx.access === undefined || ctx.access.aud !== aud) return false // Not signed in by this Access app.
  const allowed = parseEmails(env.ADMIN_EMAILS) // The allowed addresses.
  if (allowed.length === 0) return false // No admins listed: closed.
  try { // Identity lookup can fail.
    const email = (await ctx.access.getIdentity())?.email // One subrequest.
    return typeof email === 'string' && allowed.includes(email.trim().toLowerCase()) // Case-insensitive.
  } catch (error) { // Lookup failed.
    console.error('identity failed', error instanceof Error ? error.name : 'unknown') // Class only, never the identity.
    return false // Closed on any failure.
  }
}

/**
 * Reads a request body up to the size limit.
 * @param request The request.
 * @return The text, or null when it is over the limit.
 */
async function readLimitedText(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('Content-Length')) // NaN when absent.
  if (declared > MAX_BODY_BYTES) return null // Refused before reading.
  if (request.body === null) return '' // No body.
  const reader = request.body.getReader() // A stream to read in chunks.
  const chunks: Uint8Array[] = [] // Chunks read so far.
  let size = 0 // Bytes read so far.
  for (;;) { // Until the stream ends.
    const { done, value } = await reader.read() // Next chunk.
    if (done) break // Stream ended.
    size += value.byteLength // Count the bytes.
    if (size > MAX_BODY_BYTES) { // Over the limit.
      await reader.cancel() // Stop reading a body that lied about its length.
      return null // Refused.
    }
    chunks.push(value) // Keep the chunk.
  }
  const bytes = new Uint8Array(size) // Room for the whole body.
  let offset = 0 // Write position.
  for (const chunk of chunks) { // Each chunk in order.
    bytes.set(chunk, offset) // Join the chunks.
    offset += chunk.byteLength // Advance.
  }
  return new TextDecoder().decode(bytes) // UTF-8 text.
}

/**
 * Handles `POST /api/items/changes`: CSRF checks, validation and the guarded save.
 * @param request The request.
 * @param env The Worker bindings.
 * @return The response.
 */
async function postChanges(request: Request, env: Env): Promise<Response> {
  if (request.headers.get('Origin') !== new URL(request.url).origin) return json({ error: 'forbidden' }, 403) // Own origin only.
  const type = (request.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase() // The media type without parameters.
  if (type !== 'application/json') return json({ error: 'json-only' }, 415) // Forces a CORS preflight for other sites.
  const text = await readLimitedText(request)
  if (text === null) return json({ error: 'too-large' }, 413) // Over 64 KB.
  let body: unknown // The parsed body.
  try { // Parse can throw.
    body = JSON.parse(text) // Text to value.
  } catch { // Not JSON.
    return json({ error: 'invalid' }, 400) // Broken JSON.
  }
  const changes = parseHonorChanges(body) // Null when invalid.
  if (changes === null) return json({ error: 'invalid' }, 400) // Fails validation.
  try { // The save can throw.
    const result = await saveHonorChanges(env.DB, changes) // The guarded save.
    return result.kind === 'saved' // Saved or conflict.
      ? json({ honors: result.honors }, 200) // As saved.
      : json({ error: 'conflict', honors: result.honors }, 409) // Current rows; nothing written.
  } catch (error) { // Failure branch.
    if (error instanceof UnknownHonorError) return json({ error: 'invalid' }, 400) // An id that does not exist.
    throw error // Anything else is a 500 in the router.
  }
}

/**
 * Builds the fetch handler around the built page files.
 * @param pages The page, script and styles as text.
 * @return The Worker's fetch handler.
 */
export function createHandler(pages: Pages): ExportedHandlerFetchHandler<Env> {
  // Path to [method, handler]; exact matches only.
  const routes = new Map<string, [string, (request: Request, env: Env) => Promise<Response> | Response]>([ // Path to method and handler.
    ['/', ['GET', () => file(pages.html, 'text/html; charset=utf-8', { 'Content-Security-Policy': CSP, 'Referrer-Policy': 'no-referrer' })]], // The page.
    ['/admin.js', ['GET', () => file(pages.js, 'text/javascript; charset=utf-8')]], // The script.
    ['/admin.css', ['GET', () => file(pages.css, 'text/css; charset=utf-8')]], // The styles.
    ['/api/items', ['GET', async (_request, env) => json(await readAdminHonors(env.DB), 200)]], // Every honor.
    ['/api/items/changes', ['POST', postChanges]], // The save.
  ])
  return async (request, env, ctx) => { // The fetch handler.
    const path = new URL(request.url).pathname // The request path.
    if (!(await isAllowed(ctx, env))) { // The gate runs first, on every path and method.
      const isPageRequest = (request.method === 'GET' || request.method === 'HEAD') && !path.startsWith('/api/') // A browser asking for a page.
      return isPageRequest ? notAllowedPage(request.method) : json({ error: 'forbidden' }, 403) // Page for people, JSON for the admin page's calls.
    }
    const route = routes.get(path) // The matching route.
    if (route === undefined) return json({ error: 'not-found' }, 404) // Unknown path.
    const [method, run] = route // Method and handler.
    if (request.method !== method) return json({ error: 'method-not-allowed' }, 405, { Allow: method }) // Wrong method.
    try { // Handlers can throw.
      return await run(request, env) // Run the route.
    } catch (error) { // Any thrown error.
      console.error('request failed', path, error instanceof Error ? error.name : 'unknown') // Route and error class only.
      return json({ error: 'server' }, 500) // Short code, no details.
    }
  }
}
