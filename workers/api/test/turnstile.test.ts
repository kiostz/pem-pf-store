// Turnstile tests: the siteverify call, its three outcomes and the 10 second limit, so a captcha outage never lets an order through.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyTurnstile } from '../src/turnstile'

/**
 * Builds a fetch fake that answers with a JSON body.
 * @param body The JSON to answer.
 * @param status The HTTP status.
 * @return The mock.
 */
const answering = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) // Turnstile reply.

afterEach(() => vi.useRealTimers()) // Never leak fake timers.

describe('verifyTurnstile', () => {
  it('posts secret, response and remoteip and passes on success: true', async () => {
    // Catches a missing field (Turnstile rejects it) or the token sent in the wrong key.
    const fetchFn = answering({ success: true }) // A pass.
    expect(await verifyTurnstile('tok', 'sec', '203.0.113.7', fetchFn)).toBe('passed') // Passed.
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit] // The one call.
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify') // Cloudflare's endpoint.
    expect(init.method).toBe('POST') // A POST.
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({ secret: 'sec', response: 'tok', remoteip: '203.0.113.7' }) // Exact fields.
  })

  it('leaves remoteip out when the address is unknown', async () => {
    // Catches sending the literal word "unknown" as an address.
    const fetchFn = answering({ success: true }) // A pass.
    await verifyTurnstile('tok', 'sec', 'unknown', fetchFn) // No known address.
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit] // The call.
    expect(new URLSearchParams(String(init.body)).has('remoteip')).toBe(false) // Omitted.
  })

  it('fails on success: false', async () => {
    // Catches treating any 200 as a pass.
    expect(await verifyTurnstile('tok', 'sec', '1.2.3.4', answering({ success: false, 'error-codes': ['invalid-input-response'] }))).toBe('failed') // Refused token.
  })

  it.each([
    ['a thrown fetch', vi.fn(async () => { throw new Error('down') })],
    ['an HTTP 500', answering({}, 500)],
    ['a non-JSON body', vi.fn(async () => new Response('<html>', { status: 200 }))],
    ['a body without success', answering({ ok: true })],
  ])('is unavailable on %s', async (_name, fetchFn) => {
    // Catches a Cloudflare outage being reported as a buyer's failed captcha, or as a pass.
    expect(await verifyTurnstile('tok', 'sec', '1.2.3.4', fetchFn as unknown as typeof fetch)).toBe('unavailable') // Not the buyer's fault.
  })

  it('is unavailable after 10 seconds without an answer', async () => {
    // Catches a hung siteverify holding the order request open.
    vi.useFakeTimers() // Control the clock.
    const hang = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))))) // Never answers.
    const result = verifyTurnstile('tok', 'sec', '1.2.3.4', hang as unknown as typeof fetch) // Starts waiting.
    await vi.advanceTimersByTimeAsync(10_000) // The limit.
    expect(await result).toBe('unavailable') // Gave up.
  })
})
