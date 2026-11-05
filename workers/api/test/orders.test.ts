// POST /orders tests: the whole path (origin, captcha, stock, save, repeat, failure) against the real schema, so no order is lost, doubled or written half-way.

import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { insertOrderRows, saveOrder } from '../src/save-order'
import { makeOrderNumber } from '../src/order-number'
import { parseOrderRequest } from '../src/order-request'
import { addHonor, callWith, count, mockSiteverify, postOrder, SHOP, seedShop, validOrder } from './helpers'

/**
 * Reads one honor's stock.
 * @param id The honor id.
 * @return The stock.
 */
async function stockOf(id: string): Promise<number> {
  return (await env.DB.prepare('SELECT stock FROM honors WHERE id = ?').bind(id).first<{ stock: number }>())!.stock // One row.
}

/**
 * Parses a body the way the Worker does, for tests that call the save directly.
 * @param overrides Fields to replace.
 * @return The request.
 */
function request(overrides: Record<string, unknown> = {}) {
  return parseOrderRequest(validOrder(overrides))! // Valid by construction.
}

beforeEach(async () => {
  await seedShop() // Honors and settings.
})
afterEach(() => {
  vi.restoreAllMocks() // Spies off.
  vi.useRealTimers() // Real clock.
})

describe('POST /orders', () => {
  it('answers 201 with a Malaysia-dated number, the stored names and prices, the total, rows and lowered stock', async () => {
    // Catches trusting the request's prices, a UTC date, a missing line row and a stock that is not lowered.
    mockSiteverify() // Captcha passes.
    vi.useFakeTimers({ toFake: ['Date'] }) // Only the clock.
    vi.setSystemTime(new Date('2026-11-01T17:00:00Z')) // 01:00 on the 2nd in Kuala Lumpur.
    const { res } = await postOrder(validOrder({ lines: [{ honorId: 'knots', quantity: 2, priceCents: 1, name: 'Free' }, { honorId: 'rope', quantity: 1 }] })) // Extra keys ignored.
    expect(res.status).toBe(201) // Created.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://kiostz.github.io') // The shop can read it.
    const saved = (await res.json()) as { number: string; createdAt: string; currency: string; totalCents: number; lines: unknown[]; club: string } // The answer.
    expect(saved.number).toMatch(/^PF-20261102-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/) // Malaysia date.
    expect(saved.createdAt).toBe('2026-11-01T17:00:00.000Z') // The moment.
    expect(saved.currency).toBe('MYR') // From settings.
    expect(saved.totalCents).toBe(1050) // 2 x 300 + 450.
    expect(saved.lines).toEqual([
      { honorId: 'knots', name: 'Knot Tying', quantity: 2, priceCents: 300 },
      { honorId: 'rope', name: 'Rope Work', quantity: 1, priceCents: 450 },
    ]) // D1's names and prices, request order.
    expect(JSON.stringify(saved)).not.toMatch(/Ana|ana@|0123/) // No buyer fields in the answer.
    expect(saved.club).toBe('Gilead') // The club is part of the order.
    expect(await count('orders')).toBe(1) // One order.
    expect(await count('order_lines')).toBe(2) // Two lines.
    expect(await stockOf('knots')).toBe(3) // 5 - 2.
    expect(await stockOf('rope')).toBe(0) // 1 - 1.
    const row = await env.DB.prepare('SELECT buyer_name, buyer_email, buyer_phone, club, total_cents, request_id, step FROM orders').first() // The row.
    expect(row).toMatchObject({ buyer_name: 'Ana Tester', buyer_email: 'ana@example.com', buyer_phone: '+60 12-345 6789', club: 'Gilead', total_cents: 1050, step: 'new' }) // Buyer kept.
  })

  it('stores a typed club as "Other: <name>"', async () => {
    // Catches losing the flag that tells the club was typed by hand.
    mockSiteverify() // Captcha passes.
    await postOrder(validOrder({ club: { name: 'Riverside', typed: true } })) // Typed club.
    const row = await env.DB.prepare('SELECT club FROM orders').first<{ club: string }>() // The row.
    expect(row?.club).toBe('Other: Riverside') // Body text.
  })

  it('lowers stock and leaves the honor\'s created_at and modified_at as they were', async () => {
    // Catches an order's stock drop stamping modified_at, which would put every sold item at the top of Recently changed.
    mockSiteverify() // Captcha passes.
    await env.DB.exec("UPDATE honors SET created_at = '2026-11-02T03:04:05.678Z', modified_at = '2026-11-02T06:07:08.910Z' WHERE id = 'knots'") // Times an admin edit left.
    const { res } = await postOrder(validOrder({ lines: [{ honorId: 'knots', quantity: 2 }] }))
    expect(res.status).toBe(201) // Created.
    expect(await stockOf('knots')).toBe(3) // 5 - 2.
    expect(await env.DB.prepare("SELECT created_at, modified_at FROM honors WHERE id = 'knots'").first()).toEqual({ created_at: '2026-11-02T03:04:05.678Z', modified_at: '2026-11-02T06:07:08.910Z' }) // Untouched.
  })

  it('refuses a line above stock, a Hidden item and an unknown id together with 409, writing nothing', async () => {
    // Catches a refusal that lists only the first short line, or that writes anything.
    mockSiteverify() // Captcha passes.
    const { res } = await postOrder(validOrder({ lines: [{ honorId: 'knots', quantity: 6 }, { honorId: 'secret', quantity: 1 }, { honorId: 'nope', quantity: 1 }, { honorId: 'rope', quantity: 1 }] })) // Three bad, one fine.
    expect(res.status).toBe(409) // Conflict.
    expect(await res.json()).toEqual({ error: 'stock', lines: [{ honorId: 'knots', stock: 5 }, { honorId: 'secret', stock: null }, { honorId: 'nope', stock: null }] }) // Every short line; the fine one is absent.
    expect(await count('orders')).toBe(0) // No order.
    expect(await count('order_lines')).toBe(0) // No lines.
    expect(await stockOf('knots')).toBe(5) // Unchanged.
    expect(await stockOf('rope')).toBe(1) // Unchanged.
  })

  it('refuses an item whose stock is 0', async () => {
    // Catches treating "sold out" as buyable.
    mockSiteverify() // Captcha passes.
    await env.DB.exec("UPDATE honors SET stock = 0 WHERE id = 'rope'") // Sold out.
    const { res } = await postOrder(validOrder({ lines: [{ honorId: 'rope', quantity: 1 }] })) // Order it.
    expect(res.status).toBe(409) // Refused.
    expect(await res.json()).toEqual({ error: 'stock', lines: [{ honorId: 'rope', stock: 0 }] }) // Stock 0, not null.
  })

  it('lets two concurrent sends for the last item produce one order and one 409', async () => {
    // Catches an oversell when the pre-check passes for both.
    mockSiteverify() // Captcha passes.
    const lines = [{ honorId: 'rope', quantity: 1 }] // The last one.
    const [a, b] = await Promise.all([postOrder(validOrder({ lines })), postOrder(validOrder({ lines }))]) // At once.
    expect([a.res.status, b.res.status].sort()).toEqual([201, 409]) // One each.
    expect(await stockOf('rope')).toBe(0) // Not negative.
    expect(await count('orders')).toBe(1) // One order.
    expect(await count('order_lines')).toBe(1) // One line.
  })

  it('writes nothing when the guarded batch itself meets a short or Hidden line', async () => {
    // Catches a batch that relies on the pre-check: a race can skip the pre-check, so the SQL alone must abort.
    const now = new Date('2026-11-02T00:00:00Z') // A moment.
    await expect(insertOrderRows(env.DB, request({ lines: [{ honorId: 'knots', quantity: 1 }, { honorId: 'rope', quantity: 2 }] }), 'PF-20261102-AAAA', now, 'MYR')).rejects.toThrow() // Rope is short.
    await expect(insertOrderRows(env.DB, request({ lines: [{ honorId: 'knots', quantity: 1 }, { honorId: 'secret', quantity: 1 }] }), 'PF-20261102-BBBB', now, 'MYR')).rejects.toThrow() // Secret is Hidden.
    await expect(insertOrderRows(env.DB, request({ lines: [{ honorId: 'nope', quantity: 1 }] }), 'PF-20261102-CCCC', now, 'MYR')).rejects.toThrow() // Unknown.
    expect(await count('orders')).toBe(0) // No order.
    expect(await count('order_lines')).toBe(0) // No lines.
    expect(await stockOf('knots')).toBe(5) // The fine line rolled back too.
    expect(await stockOf('secret')).toBe(9) // Untouched.
  })

  it('answers a repeated requestId with 200 and the same number, one order and one stock drop', async () => {
    // Catches a lost reply followed by a retry that orders twice.
    mockSiteverify() // Captcha passes.
    const body = validOrder() // One request id.
    const first = await postOrder(body) // First send.
    const second = await postOrder({ ...body, name: 'Someone Else' }) // The retry.
    expect(first.res.status).toBe(201) // Created.
    expect(second.res.status).toBe(200) // Repeat.
    const firstBody = (await first.res.clone().json()) as Record<string, unknown> // First answer.
    expect(await second.res.json()).toEqual({ ...firstBody, kept: 'earlier-send' }) // The same order, flagged as earlier.
    expect(await count('orders')).toBe(1) // One order.
    expect(await stockOf('knots')).toBe(3) // One drop.
  })

  it('answers 201 with kept this-send and the club, and a repeat 200 with kept earlier-send and the first body\'s club', async () => {
    // Catches a confirmation that shows this send's club for an order an earlier send saved.
    mockSiteverify() // Captcha passes.
    const body = validOrder({ club: { name: 'Gilead', typed: false } }) // One id.
    const first = await postOrder(body) // First send.
    const second = await postOrder({ ...body, club: { name: 'Riverside', typed: true } }) // Same id, another club.
    expect(await first.res.json()).toMatchObject({ kept: 'this-send', club: 'Gilead' }) // This send.
    expect(await second.res.json()).toMatchObject({ kept: 'earlier-send', club: 'Gilead' }) // The first body's club.
  })

  it('answers a repeated requestId even when the item has since sold out', async () => {
    // Catches the repeat being refused by the stock check, so the buyer never sees the saved number.
    mockSiteverify() // Captcha passes.
    const body = validOrder({ lines: [{ honorId: 'rope', quantity: 1 }] }) // The last one.
    await postOrder(body) // Saved; stock now 0.
    const again = await postOrder(body) // The retry.
    expect(again.res.status).toBe(200) // Repeat, not 409.
  })

  it('answers two simultaneous sends of one requestId with one 201, one 200 and one stock drop', async () => {
    // Catches a double send racing past the pre-lookup.
    mockSiteverify() // Captcha passes.
    const body = validOrder() // One id.
    const [a, b] = await Promise.all([postOrder(body), postOrder(body)]) // At once.
    expect([a.res.status, b.res.status].sort()).toEqual([200, 201]) // Created once.
    expect([((await a.res.clone().json()) as { kept: string }).kept, ((await b.res.clone().json()) as { kept: string }).kept].sort()).toEqual(['earlier-send', 'this-send']) // One of each.
    expect(((await a.res.json()) as { number: string }).number).toBe(((await b.res.json()) as { number: string }).number) // Same number.
    expect(await count('orders')).toBe(1) // One order.
    expect(await stockOf('knots')).toBe(3) // One drop.
  })

  it('gives a new number when the first one clashes', async () => {
    // Catches a UNIQUE clash on the number becoming a lost order.
    const now = new Date('2026-11-01T17:00:00Z') // A moment.
    const draws = [0, 1] // First draw clashes, second does not.
    let n = 0 // Draw counter.
    const randomValues = (array: Uint8Array<ArrayBuffer>) => array.fill(draws[Math.min(n++, 1)]) // 2222, then 3333.
    const clash = makeOrderNumber(now, (a) => a.fill(0)) // PF-20261102-2222.
    await env.DB.prepare("INSERT INTO orders (number, created_at, currency, total_cents, club) VALUES (?, '2026-11-01T00:00:00.000Z', 'MYR', 0, 'Gilead')").bind(clash).run() // Taken.
    const result = await saveOrder(env.DB, request(), now, randomValues) // Save.
    expect(result.kind).toBe('saved') // Saved.
    if (result.kind === 'saved') expect(result.order.number).toBe('PF-20261102-3333') // The second draw.
  })

  it('gives up with an error after three clashes, writing nothing', async () => {
    // Catches an endless retry loop.
    const now = new Date('2026-11-01T17:00:00Z') // A moment.
    await env.DB.prepare("INSERT INTO orders (number, created_at, currency, total_cents, club) VALUES ('PF-20261102-2222', '2026-11-01T00:00:00.000Z', 'MYR', 0, 'Gilead')").run() // Taken.
    await expect(saveOrder(env.DB, request(), now, (a) => a.fill(0))).rejects.toThrow() // Always 2222.
    expect(await stockOf('knots')).toBe(5) // Unchanged.
  })

  it('answers 403 captcha when Turnstile says failed, writing nothing', async () => {
    // Catches an order saved without a solved captcha.
    mockSiteverify('failed') // Captcha refused.
    const { res } = await postOrder(validOrder()) // Send.
    expect(res.status).toBe(403) // Forbidden.
    expect(await res.json()).toEqual({ error: 'captcha' }) // Short code.
    expect(await count('orders')).toBe(0) // Nothing.
  })

  it('answers 503 captcha-unavailable when siteverify throws, writing nothing', async () => {
    // Catches failing open when Cloudflare is down.
    mockSiteverify('throws') // Unreachable.
    const { res } = await postOrder(validOrder()) // Send.
    expect(res.status).toBe(503) // Unavailable.
    expect(await res.json()).toEqual({ error: 'captcha-unavailable' }) // Short code.
    expect(await count('orders')).toBe(0) // Nothing.
  })

  it('sends siteverify the secret, the token and the caller address', async () => {
    // Catches a missing remoteip or the wrong secret.
    const spy = mockSiteverify() // Captcha passes.
    await postOrder(validOrder({ turnstileToken: 'tok-1' })) // Send.
    const init = spy.mock.calls[0][1] as RequestInit // The call.
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({ secret: '1x0000000000000000000000000000000AA', response: 'tok-1', remoteip: '203.0.113.7' }) // Exact.
  })

  it.each([
    ['a wrong origin', 'https://evil.test'],
    ['no origin', null],
  ])('answers 403 forbidden-origin for %s before Turnstile is called', async (_name, origin) => {
    // Catches a captcha token (single use) spent for a caller the browser should have blocked.
    const spy = mockSiteverify() // Must stay unused.
    const { res } = await postOrder(validOrder(), { origin }) // Send.
    expect(res.status).toBe(403) // Forbidden.
    expect(await res.json()).toEqual({ error: 'forbidden-origin' }) // Short code.
    expect(spy).not.toHaveBeenCalled() // No captcha call.
    expect(await count('orders')).toBe(0) // Nothing.
  })

  it('answers 500 server without SQL or buyer data in the body or any console call when D1 fails', async () => {
    // Catches a leak of the buyer's details through an error message.
    mockSiteverify() // Captcha passes.
    const logs = [vi.spyOn(console, 'error'), vi.spyOn(console, 'log'), vi.spyOn(console, 'warn')].map((spy) => spy.mockImplementation(() => {})) // Capture.
    const broken = { prepare: () => { throw new Error('SELECT failed for ana@example.com Ana Tester') } } as unknown as D1Database // Always fails.
    const { res } = await postOrder(validOrder(), { overrides: { DB: broken } }) // Send.
    expect(res.status).toBe(500) // Server error.
    expect(await res.text()).toBe('{"error":"server"}') // Nothing else.
    const logged = JSON.stringify(logs.flatMap((spy) => spy.mock.calls)) // Everything logged.
    expect(logged).not.toMatch(/Ana|ana@|SELECT|0123|Gilead/) // No private content, no SQL.
  })

  it('calls the limiter once and answers 429 when it refuses', async () => {
    // Catches a second limiter call or an order accepted past the limit.
    mockSiteverify() // Captcha passes.
    const limit = vi.fn(async () => ({ success: true })) // Allows.
    await postOrder(validOrder(), { limiter: { limit } }) // Send.
    expect(limit).toHaveBeenCalledTimes(1) // Once.
    const refuse = vi.fn(async () => ({ success: false })) // Refuses.
    const { res } = await postOrder(validOrder(), { limiter: { limit: refuse } }) // Send.
    expect(res.status).toBe(429) // Too many.
    expect(res.headers.get('Retry-After')).toBe('60') // Wait.
    expect(await res.json()).toEqual({ error: 'rate-limited' }) // Short code.
    expect(await count('orders')).toBe(1) // Only the first.
  })

  it('saves a 500-line order: every line, every stock lowered, the right total', async () => {
    // Catches a save that drops or half-writes lines when the order is at the line cap (one batch of 1,002 statements).
    mockSiteverify() // Captcha passes.
    const ids = Array.from({ length: 500 }, (_, i) => `bulk-${String(i).padStart(3, '0')}`) // 500 distinct items.
    for (const id of ids) await addHonor({ id, name: `Bulk ${id}`, stock: 3, price_cents: 100 }) // Active, stock 3, 1.00 each.
    const { res } = await postOrder(validOrder({ lines: ids.map((honorId) => ({ honorId, quantity: 2 })) })) // 2 of each.
    expect(res.status).toBe(201) // Created.
    expect(((await res.json()) as { totalCents: number }).totalCents).toBe(100000) // 500 x 2 x 100.
    expect(await count('order_lines')).toBe(500) // Every line saved.
    const low = await env.DB.prepare("SELECT COUNT(*) AS n FROM honors WHERE id LIKE 'bulk-%' AND stock = 1").first<{ n: number }>() // 3 - 2.
    expect(low?.n).toBe(500) // Every stock lowered.
    const row = await env.DB.prepare('SELECT total_cents FROM orders').first<{ total_cents: number }>() // Stored total.
    expect(row?.total_cents).toBe(100000) // Same as the answer.
  })

  it('refuses a body whose Content-Length is over 64 KB without reading it', async () => {
    // Catches buffering a huge upload before the size check.
    mockSiteverify() // Captcha passes.
    const pull = vi.fn() // Counts reads of the body.
    const body = new ReadableStream({ pull }, { highWaterMark: 0 }) // Pulled only when read; produces nothing.
    const { res } = await callWith('/orders', { method: 'POST', headers: { Origin: SHOP, 'Content-Length': String(64 * 1024 + 1), 'CF-Connecting-IP': '203.0.113.7' }, body, duplex: 'half' } as RequestInit) // Declared too big.
    expect(res.status).toBe(400) // Invalid.
    expect(await res.json()).toEqual({ error: 'invalid' }) // Short code.
    expect(pull).not.toHaveBeenCalled() // Body untouched.
    expect(await count('orders')).toBe(0) // Nothing written.
  })

  it('refuses a streamed body over 64 KB that declares no length, and stops reading', async () => {
    // Catches trusting a missing or false Content-Length.
    mockSiteverify() // Captcha passes.
    let sent = 0 // Chunks handed out.
    const body = new ReadableStream({
      pull(controller) {
        sent += 1 // One more chunk.
        controller.enqueue(new Uint8Array(16 * 1024)) // 16 KB of zeros.
      },
    }) // Endless.
    const { res } = await callWith('/orders', { method: 'POST', headers: { Origin: SHOP, 'CF-Connecting-IP': '203.0.113.7' }, body, duplex: 'half' } as RequestInit) // No length declared.
    expect(res.status).toBe(400) // Invalid.
    expect(await res.json()).toEqual({ error: 'invalid' }) // Short code.
    expect(sent).toBeLessThan(10) // Stopped soon after 64 KB (4 chunks) rather than reading on.
    expect(await count('orders')).toBe(0) // Nothing written.
  })
})
