// Checks a Turnstile token with Cloudflare's siteverify, so an order is only saved after a solved captcha and an outage is told apart from a failed captcha.

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify' // Cloudflare's endpoint.
const TIMEOUT_MS = 10_000 // Longest wait for an answer.

/**
 * Asks Cloudflare whether a captcha token is valid.
 * @param token The token the browser got from the widget.
 * @param secret The Turnstile secret key.
 * @param ip The caller's address, or 'unknown' to leave it out.
 * @param fetchFn The fetch to use; the runtime's by default.
 * @return 'passed', 'failed' (Cloudflare refused the token) or 'unavailable' (no usable answer in 10 seconds).
 */
export async function verifyTurnstile(
  token: string,
  secret: string,
  ip: string,
  fetchFn: typeof fetch = fetch,
): Promise<'passed' | 'failed' | 'unavailable'> {
  const form = new URLSearchParams({ secret, response: token }) // The required fields.
  if (ip !== 'unknown') form.set('remoteip', ip) // Optional, helps Cloudflare's checks.
  const controller = new AbortController() // Lets the timer cancel the call.
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS) // Gives up after 10 seconds.
  try {
    const response = await fetchFn(SITEVERIFY_URL, { method: 'POST', body: form, signal: controller.signal }) // The check.
    if (!response.ok) return 'unavailable' // Cloudflare had a problem.
    const result: unknown = await response.json() // Throws on non-JSON.
    if (typeof result !== 'object' || result === null || typeof (result as { success?: unknown }).success !== 'boolean') return 'unavailable' // Not Turnstile's shape.
    return (result as { success: boolean }).success ? 'passed' : 'failed' // The verdict.
  } catch {
    return 'unavailable' // Network error, abort or bad JSON; never a pass.
  } finally {
    clearTimeout(timer) // No stray timer.
  }
}
