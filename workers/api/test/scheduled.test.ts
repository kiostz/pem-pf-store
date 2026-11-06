// Scheduled handler tests: the nightly Old order removal runs at the controller's time, logs only a count or an error name, and fails the run with a fixed error.

import { createScheduledController } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { addOrder, count, seedShop } from './helpers'

const SCHEDULED = new Date('2031-06-01T19:00:00.000Z') // Years from today, so the wall clock cannot pass by luck.

/**
 * Runs the scheduled handler at a time.
 * @param scheduledTime The controller's time.
 * @return Resolves when the handler finished.
 */
async function runAt(scheduledTime: Date): Promise<void> {
  await worker.scheduled!(createScheduledController({ scheduledTime, cron: '0 19 * * *' }), env) // The handler under test; it awaits its own work.
}

beforeEach(async () => {
  await seedShop() // Items and settings, no orders.
})

afterEach(() => {
  vi.restoreAllMocks() // Spies off.
})

describe('scheduled', () => {
  it('deletes by the controller time and logs exactly one line with the count', async () => {
    // Catches Date.now() driving the cutoff, and personal data or order numbers in the log.
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await addOrder({ number: 'PF-20300601-OLDX', createdAt: '2030-05-31T18:59:59.999Z' }) // Just over 12 months before SCHEDULED.
    await addOrder({ number: 'PF-20300601-KEEP', createdAt: '2030-06-01T19:00:00.000Z' }) // Exactly 12 months.
    await runAt(SCHEDULED)
    expect(await count('orders')).toBe(1) // The old one went.
    expect(log.mock.calls).toEqual([['old orders deleted 1']]) // One line, a count.
    expect(error).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    const logged = JSON.stringify([log.mock.calls, error.mock.calls, warn.mock.calls]) // Everything printed.
    for (const secret of ['Ana Tester', 'ana@example.test', '+60 12 000 0000', 'Gilead', 'PF-2030']) expect(logged).not.toContain(secret)
  })

  it('logs only the error name when D1 refuses, rejects with a fixed error, and deletes nothing', async () => {
    // Catches a swallowed failure (green cron run), a rethrown D1 error with its message, and a partial delete.
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await addOrder({ number: 'PF-OLD', createdAt: '2030-01-01T00:00:00.000Z', lineCount: 2 })
    await env.DB.exec('ALTER TABLE orders RENAME TO orders_away') // D1 itself refuses: no table.
    try {
      const failure = await runAt(SCHEDULED).then(() => null, (e: unknown) => e) // The rejection, or null.
      expect(failure).toEqual(new Error('old order removal failed')) // Fixed text, so the run shows as failed.
      expect((failure as Error).cause).toBeUndefined() // Never the original error.
    } finally {
      await env.DB.exec('ALTER TABLE orders_away RENAME TO orders') // Put it back.
    }
    expect(error.mock.calls).toEqual([['old order removal failed Error']]) // The name only.
    expect(log).not.toHaveBeenCalled()
    expect(await count('orders')).toBe(1) // Nothing deleted.
    expect(await count('order_lines')).toBe(2)
  })
})
