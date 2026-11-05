// POST /orders interruption tests: a lost answer then a retry, races for the last items, stock changed by the admin mid-send, and empty or broken inputs, so no order is lost, doubled or oversold.

import { waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { call, fakeEmail, count, mockSiteverify, postOrder, SHOP, seedShop, validOrder } from './helpers'

/**
 * Reads one honor's stock.
 * @param id The honor id.
 * @return The stock.
 */
async function stockOf(id: string): Promise<number> {
  return (await env.DB.prepare('SELECT stock FROM honors WHERE id = ?').bind(id).first<{ stock: number }>())!.stock // One row.
}

/**
 * Wraps the test database so a test can act between two of the save's own D1 batches.
 * @param onBatch Called with the 1-based batch number before that batch runs; may write or throw.
 * @return A database that forwards everything else to the real one.
 */
function watchedDb(onBatch: (n: number) => Promise<void>): D1Database {
  let n = 0 // Batches seen so far.
  return {
    prepare: (query: string) => env.DB.prepare(query), // Same statements.
    batch: async (statements: D1PreparedStatement[]) => {
      n += 1 // This batch.
      await onBatch(n) // The test's move.
      return env.DB.batch(statements) // The real batch.
    },
  } as unknown as D1Database // Only prepare and batch are used by the save.
}

beforeEach(async () => {
  await seedShop() // knots stock 5, rope stock 1, secret hidden.
})
afterEach(() => {
  vi.restoreAllMocks() // Spies off.
})

describe('a lost answer then a retry', () => {
  it('answers the retry with the saved order and a new captcha token, sending one email in all', async () => {
    // Catches a retry after a lost answer that orders twice, drops stock twice or emails the club twice.
    const spy = mockSiteverify() // Captcha passes every time.
    const email = fakeEmail() // Records sends.
    const body = validOrder() // One request id.
    const first = await postOrder(body, { overrides: { ORDER_EMAIL: email } }) // The answer is never read: it was lost.
    expect(first.res.status).toBe(201) // Saved.
    await waitOnExecutionContext(first.ctx) // Email goes out.
    const retry = await postOrder({ ...body, turnstileToken: 'fresh-token' }, { overrides: { ORDER_EMAIL: email } }) // The buyer presses Send again.
    await waitOnExecutionContext(retry.ctx) // Nothing should be queued.
    expect(retry.res.status).toBe(200) // A repeat.
    expect(((await retry.res.json()) as { number: string }).number).toBe(((await first.res.json()) as { number: string }).number) // The same order number.
    expect(await count('orders')).toBe(1) // One order.
    expect(await stockOf('knots')).toBe(3) // One drop.
    expect(email.send).toHaveBeenCalledTimes(1) // One email.
    expect(new URLSearchParams(String((spy.mock.calls[1][1] as RequestInit).body)).get('response')).toBe('fresh-token') // The retry spent its own token.
  })

  it('refuses the retry with 403 when its captcha fails, without revealing the saved order', async () => {
    // Catches looking up the request id before the captcha, so ids could be probed without solving one.
    const body = validOrder() // One request id.
    mockSiteverify() // The first send passes.
    await postOrder(body) // Saved.
    vi.restoreAllMocks() // New spy.
    mockSiteverify('failed') // The retry's captcha fails.
    const retry = await postOrder(body) // Retry.
    expect(retry.res.status).toBe(403) // Captcha refusal.
    expect(await retry.res.json()).toEqual({ error: 'captcha' }) // No order in the answer.
    expect(await count('orders')).toBe(1) // Still one.
  })

  it('answers a retry that reuses the request id with an edited cart by the saved order, not a second one', async () => {
    // Catches a repeat that saves the edited cart too, so one request id makes two orders.
    mockSiteverify() // Captcha passes.
    const body = validOrder({ lines: [{ honorId: 'knots', quantity: 2 }] }) // First cart.
    const first = await postOrder(body) // Saved.
    const retry = await postOrder({ ...body, lines: [{ honorId: 'knots', quantity: 5 }, { honorId: 'rope', quantity: 1 }] }) // Same id, bigger cart.
    expect(retry.res.status).toBe(200) // Repeat.
    expect(await retry.res.json()).toEqual({ ...((await first.res.json()) as object), kept: 'earlier-send' }) // The first cart's order.
    expect(await count('orders')).toBe(1) // One order.
    expect(await stockOf('knots')).toBe(3) // Only the first drop.
    expect(await stockOf('rope')).toBe(1) // The edit never reached stock.
  })
})

describe('a late first send meeting a changed resend', () => {
  const clubA = { name: 'Gilead', typed: false } // The first send's club.
  const clubB = { name: 'Sunway', typed: false } // The changed send's club.

  it.each([
    ['A lands first', false],
    ['B lands first', true],
  ])('saves only the first to land and gives the other its order (%s)', async (_name, bFirst) => {
    // Catches a late first send and a changed resend under one id making two orders, two stock drops or two emails.
    mockSiteverify() // Captcha passes.
    const email = fakeEmail() // Records sends.
    const id = '00000000-0000-4000-8000-0000000000c1' // One id.
    const a = validOrder({ requestId: id, club: clubA, lines: [{ honorId: 'knots', quantity: 2 }] }) // First body.
    const b = validOrder({ requestId: id, club: clubB, lines: [{ honorId: 'knots', quantity: 1 }, { honorId: 'rope', quantity: 1 }] }) // Changed body.
    const [firstBody, secondBody] = bFirst ? [b, a] : [a, b] // Landing order.
    const first = await postOrder(firstBody, { overrides: { ORDER_EMAIL: email } }) // Lands first.
    const second = await postOrder(secondBody, { overrides: { ORDER_EMAIL: email } }) // Lands late.
    await waitOnExecutionContext(first.ctx) // Email goes out.
    await waitOnExecutionContext(second.ctx) // Nothing queued.
    const one = (await first.res.json()) as { kept: string; club: string; lines: unknown[] } // Saved.
    const two = (await second.res.json()) as { kept: string; club: string; lines: unknown[] } // Repeat.
    expect(one.kept).toBe('this-send') // Saved now.
    expect(two).toEqual({ ...one, kept: 'earlier-send' }) // The first's club and lines.
    expect(await count('orders')).toBe(1) // One order.
    expect(await stockOf('knots')).toBe(bFirst ? 4 : 3) // One drop only.
    expect(email.send).toHaveBeenCalledTimes(1) // One email.
  })

  it('saves one order, one stock drop and one email when A and B reach the Worker at the same moment', async () => {
    // Catches two sends racing past the pre-lookup into two orders, two stock drops or two emails.
    mockSiteverify() // Captcha passes.
    const email = fakeEmail() // Records sends.
    const id = '00000000-0000-4000-8000-0000000000c4' // One id.
    const a = validOrder({ requestId: id, club: clubA, lines: [{ honorId: 'knots', quantity: 2 }] }) // First body.
    const b = validOrder({ requestId: id, club: clubB, lines: [{ honorId: 'knots', quantity: 1 }, { honorId: 'rope', quantity: 1 }] }) // Changed body.
    const [ra, rb] = await Promise.all([postOrder(a, { overrides: { ORDER_EMAIL: email } }), postOrder(b, { overrides: { ORDER_EMAIL: email } })]) // At once.
    await waitOnExecutionContext(ra.ctx) // Email goes out.
    await waitOnExecutionContext(rb.ctx) // Nothing queued.
    const one = (await ra.res.json()) as { kept: string; number: string; club: string; lines: unknown[] } // A's answer.
    const two = (await rb.res.json()) as { kept: string; number: string; club: string; lines: unknown[] } // B's answer.
    expect([one.kept, two.kept].sort()).toEqual(['earlier-send', 'this-send']) // One of each.
    expect({ ...one, kept: '' }).toEqual({ ...two, kept: '' }) // Both hold the winner's order.
    expect(await count('orders')).toBe(1) // One order.
    const drop = 5 - (await stockOf('knots')) // Knots taken.
    expect([2, 1]).toContain(drop) // Only the winner's quantity.
    expect(email.send).toHaveBeenCalledTimes(1) // One email.
  })

  it('treats the same request id in capitals and in lower case as one order', async () => {
    // Catches a case-sensitive id check that lets a resend with another spelling make a second order.
    mockSiteverify() // Captcha passes.
    const id = '00000000-0000-4000-8000-0000000000c5' // Lower case.
    await postOrder(validOrder({ requestId: id })) // Saved.
    const again = await postOrder(validOrder({ requestId: id.replace(/[a-f]/g, (c) => c.toUpperCase()), club: clubB })) // Capitals, changed club.
    expect(again.res.status).toBe(200) // A repeat.
    expect(await again.res.json()).toMatchObject({ kept: 'earlier-send', club: 'Gilead' }) // The first order.
    expect(await count('orders')).toBe(1) // One order.
    expect(await stockOf('knots')).toBe(3) // One drop.
  })

  it('answers a lookup not found, then A lands, then B gets earlier-send holding A', async () => {
    // Catches a lookup that creates state or a B that is saved after A.
    mockSiteverify() // Captcha passes.
    const id = '00000000-0000-4000-8000-0000000000c2' // One id.
    const miss = await call(`/orders/status/${id}`, { headers: { Origin: SHOP } }) // Before A lands.
    expect(await miss.json()).toEqual({ found: false }) // Not found.
    await postOrder(validOrder({ requestId: id, club: clubA })) // A lands.
    const b = await postOrder(validOrder({ requestId: id, club: clubB, lines: [{ honorId: 'knots', quantity: 1 }] })) // B arrives.
    expect(await b.res.json()).toMatchObject({ kept: 'earlier-send', club: 'Gilead', lines: [{ honorId: 'knots', quantity: 2 }] }) // Holds A.
    expect(await count('orders')).toBe(1) // One order.
  })

  it('refuses B for stock before A lands with nothing written, then A saves and the lookup finds it', async () => {
    // Catches a refused resend that wrote something or hid the later landing of A.
    mockSiteverify() // Captcha passes.
    const id = '00000000-0000-4000-8000-0000000000c3' // One id.
    const b = await postOrder(validOrder({ requestId: id, club: clubB, lines: [{ honorId: 'rope', quantity: 2 }] })) // Rope has 1.
    expect(b.res.status).toBe(409) // Refused.
    expect(await count('orders')).toBe(0) // Nothing written.
    expect(await stockOf('rope')).toBe(1) // Untouched.
    await postOrder(validOrder({ requestId: id, club: clubA })) // A lands.
    const found = (await (await call(`/orders/status/${id}`, { headers: { Origin: SHOP } })).json()) as { found: boolean; order: { club: string } } // Lookup.
    expect(found).toMatchObject({ found: true, order: { club: 'Gilead' } }) // A's order.
  })
})

describe('races for the last items', () => {
  it('sells exactly the stock when five different sends race for three left', async () => {
    // Catches an oversell or a stock below 0 when several sends pass the pre-check together.
    mockSiteverify() // Captcha passes.
    await env.DB.exec("UPDATE honors SET stock = 3 WHERE id = 'knots'") // Three left.
    const results = await Promise.all(Array.from({ length: 5 }, () => postOrder(validOrder({ lines: [{ honorId: 'knots', quantity: 1 }] })))) // Five buyers.
    const statuses = results.map(({ res }) => res.status).sort() // Outcomes.
    expect(statuses).toEqual([201, 201, 201, 409, 409]) // Three sold, two refused.
    expect(await stockOf('knots')).toBe(0) // Not negative.
    expect(await count('orders')).toBe(3) // Three orders.
    expect(await count('order_lines')).toBe(3) // Three lines.
    for (const { res } of results.filter(({ res }) => res.status === 409)) {
      expect(await res.json()).toEqual({ error: 'stock', lines: [{ honorId: 'knots', stock: 0 }] }) // Current stock, not null.
    }
  })

  it('writes nothing for a mixed order when another buyer takes one of its items first', async () => {
    // Catches a half-written order: the item still in stock must not be lowered when the other line is lost.
    mockSiteverify() // Captcha passes.
    const results = await Promise.all([
      postOrder(validOrder({ lines: [{ honorId: 'rope', quantity: 1 }] })), // Takes the last rope.
      postOrder(validOrder({ lines: [{ honorId: 'knots', quantity: 2 }, { honorId: 'rope', quantity: 1 }] })), // Wants it too.
    ])
    expect(results.map(({ res }) => res.status).sort()).toEqual([201, 409]) // One wins.
    expect(await stockOf('rope')).toBe(0) // Gone.
    expect(await count('orders')).toBe(1) // One order.
    const knotLines = await env.DB.prepare("SELECT COALESCE(SUM(quantity), 0) AS n FROM order_lines WHERE honor_id = 'knots'").first<{ n: number }>() // Knots sold by saved lines.
    expect(await stockOf('knots')).toBe(5 - knotLines!.n) // Stock fell exactly by the lines that were saved, never for the refused order.
  })
})

describe('stock changed by the admin during a send', () => {
  it('refuses with the new stock when the admin lowers it before the send, then accepts the lowered quantity', async () => {
    // Catches an order filled from a stale view: the buyer's cart said 3, the admin has since set 1.
    mockSiteverify() // Captcha passes.
    await env.DB.exec("UPDATE honors SET stock = 1 WHERE id = 'knots'") // The admin saved a lower stock.
    const refused = await postOrder(validOrder({ lines: [{ honorId: 'knots', quantity: 3 }] })) // The old cart.
    expect(refused.res.status).toBe(409) // Refused.
    expect(await refused.res.json()).toEqual({ error: 'stock', lines: [{ honorId: 'knots', stock: 1 }] }) // The new stock.
    expect(await count('orders')).toBe(0) // Nothing written.
    const ok = await postOrder(validOrder({ lines: [{ honorId: 'knots', quantity: 1 }] })) // The buyer lowers it.
    expect(ok.res.status).toBe(201) // Saved.
    expect(await stockOf('knots')).toBe(0) // Sold.
  })

  it('answers 409 with the fresh stock, writing nothing, when the admin lowers it between the pre-check and the save', async () => {
    // Catches the abort path turning into a 500 or a lost order instead of re-reading stock and refusing.
    mockSiteverify() // Captcha passes.
    const db = watchedDb(async (n) => {
      if (n === 2) await env.DB.exec("UPDATE honors SET stock = 1 WHERE id = 'knots'") // After the pre-check, before the write.
    }) // The admin saves in the gap.
    const { res } = await postOrder(validOrder({ lines: [{ honorId: 'knots', quantity: 2 }] }), { overrides: { DB: db } }) // Send.
    expect(res.status).toBe(409) // Refused.
    expect(await res.json()).toEqual({ error: 'stock', lines: [{ honorId: 'knots', stock: 1 }] }) // Fresh stock.
    expect(await count('orders')).toBe(0) // No order.
    expect(await stockOf('knots')).toBe(1) // The admin's value, untouched.
  })

  it('answers 409 with stock null when the admin hides the item between the pre-check and the save', async () => {
    // Catches a hidden item being sold because only the pre-check looked at status.
    mockSiteverify() // Captcha passes.
    const db = watchedDb(async (n) => {
      if (n === 2) await env.DB.exec("UPDATE honors SET status = 'hidden' WHERE id = 'knots'") // Hidden in the gap.
    })
    const { res } = await postOrder(validOrder({ lines: [{ honorId: 'knots', quantity: 1 }] }), { overrides: { DB: db } }) // Send.
    expect(res.status).toBe(409) // Refused.
    expect(await res.json()).toEqual({ error: 'stock', lines: [{ honorId: 'knots', stock: null }] }) // Not for sale.
    expect(await count('orders')).toBe(0) // No order.
    expect(await stockOf('knots')).toBe(5) // Untouched.
  })

  it('saves on a second try when the write fails once for a reason that is not stock', async () => {
    // Catches giving up on the first transient D1 failure and losing an order that could be saved.
    mockSiteverify() // Captcha passes.
    const db = watchedDb(async (n) => {
      if (n === 2) throw new Error('D1 hiccup') // The first write fails.
    })
    const { res } = await postOrder(validOrder(), { overrides: { DB: db } }) // Send.
    expect(res.status).toBe(201) // Saved on the retry.
    expect(await count('orders')).toBe(1) // One order.
    expect(await stockOf('knots')).toBe(3) // Lowered once.
  })
})

describe('empty and broken inputs', () => {
  it.each([
    ['an empty body', ''],
    ['JSON null', 'null'],
    ['a JSON array', '[]'],
    ['a JSON string', '"order"'],
  ])('answers 400 invalid for %s without calling Turnstile or writing', async (_name, raw) => {
    // Catches a crash (500) or a spent captcha on a body that is not an order object.
    const spy = mockSiteverify() // Must stay unused.
    const { res } = await postOrder(raw) // Send.
    expect(res.status).toBe(400) // Invalid.
    expect(await res.json()).toEqual({ error: 'invalid' }) // Short code.
    expect(spy).not.toHaveBeenCalled() // Captcha untouched.
    expect(await count('orders')).toBe(0) // Nothing.
  })

  it('answers 500 server and writes nothing when the settings row is missing', async () => {
    // Catches an order saved against a broken database (no currency) or a null dereference leaking out.
    mockSiteverify() // Captcha passes.
    await env.DB.exec('DELETE FROM settings') // Broken state.
    const { res } = await postOrder(validOrder()) // Send.
    expect(res.status).toBe(500) // Server error.
    expect(await res.text()).toBe('{"error":"server"}') // Short code only.
    expect(await count('orders')).toBe(0) // Nothing.
    expect(await stockOf('knots')).toBe(5) // Untouched.
  })

  it('still takes the order when the rate limiter itself throws', async () => {
    // Catches failing closed on a limiter outage and refusing every buyer.
    mockSiteverify() // Captcha passes.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {}) // Quiet.
    const { res } = await postOrder(validOrder(), { limiter: { limit: async () => { throw new Error('limiter down') } } }) // Broken limiter.
    expect(res.status).toBe(201) // Fails open.
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/Ana|ana@/) // Nothing private logged.
  })
})
