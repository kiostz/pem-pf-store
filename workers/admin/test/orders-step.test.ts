// Tests POST /api/orders/step without a restock: every move, stale guard, validation, 404, and no buyer data in logs or errors.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUYER, call, postTo, seedItems, seedOrders, stepOf } from './helpers'

const NUMBER = 'PF-20261105-ABCD' // The seeded order.

afterEach(() => vi.restoreAllMocks()) // Spies go even when an assertion fails.

beforeEach(async () => {
  await seedItems([])
  await seedOrders([{ number: NUMBER, step: 'new' }])
})

/**
 * Sends a step change.
 * @param body The JSON body.
 * @return The response.
 */
const send = (body: unknown) => postTo('/api/orders/step', body)

describe('POST /api/orders/step', () => {
  it('moves between New, Paid and Handed out in every direction', async () => {
    // Catches a step machine that only moves forward, which the ruling forbids.
    const steps = ['new', 'paid', 'handed_out'] as const
    for (const from of steps) for (const to of steps) {
      if (from === to) continue
      await seedOrders([{ number: NUMBER, step: from }])
      const res = await send({ number: NUMBER, from, to, restock: false })
      expect(res.status, `${from}->${to}`).toBe(200)
      expect(await res.json()).toMatchObject({ order: { number: NUMBER, step: to }, restocked: 0 })
      expect(await stepOf(NUMBER)).toBe(to)
    }
  })

  it('answers 409 with the current order and writes nothing when from is stale', async () => {
    // Catches a step write that ignores what the admin saw, overwriting another admin's change.
    await seedOrders([{ number: NUMBER, step: 'paid' }])
    const res = await send({ number: NUMBER, from: 'new', to: 'handed_out', restock: false })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'conflict', order: { number: NUMBER, step: 'paid' } })
    expect(await stepOf(NUMBER)).toBe('paid')
  })

  it('answers 400 for from cancelled, to equal from, restock without a cancel, an extra or missing key and a bad number', async () => {
    // Catches an un-cancel, a no-op write, a restock on a non-cancel, or a loose body.
    const bad: unknown[] = [
      { number: NUMBER, from: 'cancelled', to: 'new', restock: false },
      { number: NUMBER, from: 'new', to: 'new', restock: false },
      { number: NUMBER, from: 'new', to: 'paid', restock: true },
      { number: NUMBER, from: 'new', to: 'paid', restock: false, extra: 1 },
      { number: NUMBER, from: 'new', to: 'paid' },
      { from: 'new', to: 'paid', restock: false },
      { number: 'PF-20261105-ABC0', from: 'new', to: 'paid', restock: false },
      { number: NUMBER, from: 'new', to: 'shipped', restock: false },
      { number: NUMBER, from: 'new', to: 'paid', restock: 'no' },
      [],
      null,
    ]
    for (const body of bad) {
      const res = await send(body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid' })
    }
    expect(await stepOf(NUMBER)).toBe('new')
  })

  it('answers 404 for an unknown number', async () => {
    // Catches a 200 or 500 for an order that does not exist.
    const res = await send({ number: 'PF-20261105-ZZZZ', from: 'new', to: 'paid', restock: false })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not-found' })
  })

  it('never puts a buyer name, email or phone into a console call or an error body when a route throws', async () => {
    // Catches personal data leaking into logs or error answers on the handler's catch path (a thrown error naming the buyer).
    const leak = new Error(`${BUYER.name} ${BUYER.email} ${BUYER.phone}`) // What a driver error could carry.
    const failing = { prepare: () => { throw leak }, batch: () => { throw leak } } as unknown as D1Database // A database that throws on any use.
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'info')] // Every console method the code could use.
    const texts: string[] = [] // Everything the caller or the log could see.
    const options = { env: { DB: failing } } // Swap the database.
    const responses = [
      await call('/api/orders', {}, options), // The list route throws.
      await call('/api/orders?number=PF-20261105-ABCD', {}, options), // The lookup route throws.
      await postTo('/api/orders/step', { number: NUMBER, from: 'new', to: 'cancelled', restock: true }, {}, options), // The step route throws.
    ]
    for (const res of responses) {
      expect(res.status).toBe(500) // The handler's catch answered.
      texts.push(await res.text()) // Its body.
    }
    expect(spies[1]).toHaveBeenCalledTimes(3) // The catch did log, so the check below is not vacuous.
    for (const spy of spies) texts.push(JSON.stringify(spy.mock.calls)) // What was logged.
    for (const text of texts) for (const value of Object.values(BUYER)) expect(text).not.toContain(value) // No buyer data anywhere.
  })
})
