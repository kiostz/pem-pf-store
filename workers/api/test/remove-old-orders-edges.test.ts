// Calendar edge tests for Old order removal: a 28 February run, a leap-day order, the year boundary, and a caller's date left alone, plus two nightly runs through the handler.

import { createScheduledController } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { removeOldOrders } from '../src/remove-old-orders'
import { addOrder, seedShop } from './helpers'

/**
 * Lists the order numbers left, in number order.
 * @return The numbers.
 */
async function numbers(): Promise<string[]> {
  const { results } = await env.DB.prepare('SELECT number FROM orders ORDER BY number').all<{ number: string }>() // All rows.
  return results.map((r) => r.number) // Just the numbers.
}

beforeEach(async () => {
  await seedShop() // Honors, settings, no orders.
})

afterEach(() => {
  vi.restoreAllMocks() // Spies off.
})

describe('removeOldOrders calendar edges', () => {
  it('does not pin a 28 February run in a leap year', async () => {
    // Catches the 29 Feb pin applied on every February run (a cutoff a day early).
    await addOrder({ number: 'PF-A', createdAt: '2027-02-28T18:59:59.999Z' })
    await addOrder({ number: 'PF-B', createdAt: '2027-02-28T19:00:00.000Z' })
    await removeOldOrders(env.DB, new Date('2028-02-28T19:00:00.000Z'))
    expect(await numbers()).toEqual(['PF-B']) // Exactly 12 months stays.
  })

  it('runs a 1 March after a leap day on plain one-year-back time', async () => {
    // Catches a pin that lingers into March and keeps 28 Feb orders too long.
    await addOrder({ number: 'PF-A', createdAt: '2027-02-28T20:00:00.000Z' })
    await addOrder({ number: 'PF-B', createdAt: '2027-03-01T19:00:00.000Z' })
    await removeOldOrders(env.DB, new Date('2028-03-01T19:00:00.000Z'))
    expect(await numbers()).toEqual(['PF-B']) // 28 Feb went, the 1 March edge stays.
  })

  it('keeps a leap-day order through 28 February and deletes it on 1 March', async () => {
    // Catches a cutoff that deletes an order placed on 29 Feb before it is 12 months old.
    await addOrder({ number: 'PF-LEAP', createdAt: '2024-02-29T10:00:00.000Z' })
    await removeOldOrders(env.DB, new Date('2025-02-28T19:00:00.000Z'))
    expect(await numbers()).toEqual(['PF-LEAP']) // Under 12 months by calendar.
    expect(await removeOldOrders(env.DB, new Date('2025-03-01T19:00:00.000Z'))).toBe(1)
  })

  it('crosses the year boundary exactly', async () => {
    // Catches a month or year slip when the run is on 1 January.
    await addOrder({ number: 'PF-A', createdAt: '2026-12-31T23:59:59.999Z' })
    await addOrder({ number: 'PF-B', createdAt: '2027-01-01T00:00:00.000Z' })
    await removeOldOrders(env.DB, new Date('2028-01-01T00:00:00.000Z'))
    expect(await numbers()).toEqual(['PF-B'])
  })

  it('leaves the caller\'s date as it was', async () => {
    // Catches a cutoff computed on the argument itself.
    const now = new Date('2028-02-29T19:00:00.000Z')
    await removeOldOrders(env.DB, now)
    expect(now.toISOString()).toBe('2028-02-29T19:00:00.000Z')
  })
})

describe('scheduled twice', () => {
  it('logs the count, then 0, and nothing else', async () => {
    // Catches a job that is not idempotent or logs extra lines on a repeat.
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await addOrder({ number: 'PF-OLD', createdAt: '2030-01-01T00:00:00.000Z', lineCount: 2 })
    const run = () => worker.scheduled!(createScheduledController({ scheduledTime: new Date('2031-06-01T19:00:00.000Z'), cron: '0 19 * * *' }), env) // Same time twice.
    await run()
    await run()
    expect(log.mock.calls).toEqual([['old orders deleted 1'], ['old orders deleted 0']])
    expect(error).not.toHaveBeenCalled()
  })
})
