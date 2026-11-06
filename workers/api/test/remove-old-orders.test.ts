// Old order removal tests: which orders go at the 12-month edge, that lines go with them, and that nothing else is touched.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { removeOldOrders } from '../src/remove-old-orders'
import { addOrder, count, seedShop } from './helpers'

const NOW = new Date('2027-11-05T19:00:00.000Z') // A run at 03:00 Malaysia time.

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

describe('removeOldOrders', () => {
  it('deletes by the millisecond: older than 12 months goes, exactly 12 months and newer stay', async () => {
    // Catches `<=` in place of `<` and an off-by-one on the year.
    await addOrder({ number: 'PF-OLD', createdAt: '2026-11-05T18:59:59.999Z' })
    await addOrder({ number: 'PF-EDGE', createdAt: '2026-11-05T19:00:00.000Z' })
    await addOrder({ number: 'PF-NEW', createdAt: '2027-11-05T18:59:59.999Z' })
    expect(await removeOldOrders(env.DB, NOW)).toBe(1) // One order.
    expect(await numbers()).toEqual(['PF-EDGE', 'PF-NEW']) // The others stay.
  })

  it('goes by the UTC instant, not the Malaysia date', async () => {
    // Catches a cutoff built from the Malaysia date or an offset applied twice.
    await addOrder({ number: 'PF-0200', createdAt: '2026-11-05T18:00:00.000Z' }) // 02:00 on 6 Nov in Malaysia.
    await addOrder({ number: 'PF-0400', createdAt: '2026-11-05T20:00:00.000Z' }) // 04:00 on 6 Nov.
    await removeOldOrders(env.DB, NOW)
    expect(await numbers()).toEqual(['PF-0400']) // Only the first went.
  })

  it('pins a 29 February run to 28 February of the year before', async () => {
    // Catches a cutoff that rolls to 1 March and deletes orders under 12 months old.
    await addOrder({ number: 'PF-A', createdAt: '2027-02-28T18:59:59.999Z' }) // Just over 12 months.
    await addOrder({ number: 'PF-B', createdAt: '2027-02-28T19:00:00.000Z' }) // The pinned edge.
    await addOrder({ number: 'PF-C', createdAt: '2027-03-01T18:00:00.000Z' }) // Under 12 months on 1 March.
    await removeOldOrders(env.DB, new Date('2028-02-29T19:00:00.000Z'))
    expect(await numbers()).toEqual(['PF-B', 'PF-C']) // Only the first went.
  })

  it('deletes the lines of an old order and keeps every line of a kept order', async () => {
    // Catches orphan lines, or a cascade that reaches a kept order.
    await addOrder({ number: 'PF-OLD', createdAt: '2026-01-01T00:00:00.000Z', lineCount: 3 })
    await addOrder({ number: 'PF-KEPT', createdAt: '2027-10-01T00:00:00.000Z', lineCount: 2 })
    await removeOldOrders(env.DB, NOW)
    expect(await count('order_lines')).toBe(2) // Only the kept order's lines.
    const orphans = await env.DB.prepare('SELECT COUNT(*) AS n FROM order_lines WHERE order_id NOT IN (SELECT id FROM orders)').first<{ n: number }>() // Lines of a missing order.
    expect(orphans!.n).toBe(0)
  })

  it('counts orders, not the lines that went with them', async () => {
    // Catches the cascaded lines being counted.
    await addOrder({ number: 'PF-1', createdAt: '2026-01-01T00:00:00.000Z', lineCount: 3 })
    await addOrder({ number: 'PF-2', createdAt: '2026-02-01T00:00:00.000Z', lineCount: 3 })
    expect(await removeOldOrders(env.DB, NOW)).toBe(2) // Two orders, not eight rows.
  })

  it('deletes 0 on a second run and leaves the database as it was', async () => {
    // Catches a job that is not safe to rerun.
    await addOrder({ number: 'PF-OLD', createdAt: '2026-01-01T00:00:00.000Z' })
    await addOrder({ number: 'PF-KEPT', createdAt: '2027-10-01T00:00:00.000Z' })
    await removeOldOrders(env.DB, NOW)
    expect(await removeOldOrders(env.DB, NOW)).toBe(0) // Nothing left to delete.
    expect(await numbers()).toEqual(['PF-KEPT'])
  })

  it('deletes old orders at every step', async () => {
    // Catches a step filter carried over by mistake.
    for (const step of ['new', 'paid', 'handed_out', 'cancelled']) await addOrder({ number: `PF-${step}`, createdAt: '2026-01-01T00:00:00.000Z', step })
    expect(await removeOldOrders(env.DB, NOW)).toBe(4) // All four.
    expect(await count('orders')).toBe(0)
  })

  it('touches no other table: items, clubs and settings stay and nothing is restocked', async () => {
    // Catches a restock on delete or a broader delete.
    await env.DB.exec("INSERT INTO clubs (name, area, language, location, church_name, position) VALUES ('Gilead', 'KL', 'English', 'KL', 'Church', 1)") // One club.
    await addOrder({ number: 'PF-OLD', createdAt: '2026-01-01T00:00:00.000Z', step: 'cancelled' })
    const snapshot = async () => JSON.stringify([
      (await env.DB.prepare('SELECT * FROM items ORDER BY id').all()).results,
      (await env.DB.prepare('SELECT * FROM clubs').all()).results,
      (await env.DB.prepare('SELECT * FROM settings').all()).results,
    ]) // Everything the job must not touch.
    const before = await snapshot()
    await removeOldOrders(env.DB, NOW)
    expect(await snapshot()).toBe(before) // Equal.
  })

  it('gives 0 with no orders', async () => {
    // Catches an error on an empty table.
    expect(await removeOldOrders(env.DB, NOW)).toBe(0)
  })

  it('uses the created_at index', async () => {
    // Catches a full scan that grows with every order.
    const { results } = await env.DB.prepare('EXPLAIN QUERY PLAN DELETE FROM orders WHERE created_at < ?1 RETURNING id').bind('2026-11-05T19:00:00.000Z').all<{ detail: string }>() // The plan.
    expect(results.map((r) => r.detail).join(' ')).toContain('orders_created_at')
  })
})
