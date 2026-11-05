// Tests POST /api/clubs/remove: guarded delete, lost-answer retry, and orders keeping their club text.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { call, clubRows, clubWire, postTo, racingAfterRead, seedClubs, seedOrders } from './helpers'

const LIONS = { name: 'Lions', area: 'Klang', language: null, location: null, churchName: null }

beforeEach(async () => {
  await seedClubs([{ id: 1, name: 'Lions', area: 'Klang' }, { id: 2, name: 'Gilead' }])
})

/**
 * Sends a removal.
 * @param body The JSON body.
 * @return The response.
 */
const remove = (body: unknown) => postTo('/api/clubs/remove', body)

describe('POST /api/clubs/remove', () => {
  it('removes the club and a second identical call still gives 200', async () => {
    // Catches a retry after a lost answer showing an error.
    const first = await remove({ id: 1, seen: LIONS })
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ clubs: [clubWire(2, { name: 'Gilead' })] })
    const second = await remove({ id: 1, seen: LIONS })
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ clubs: [clubWire(2, { name: 'Gilead' })] })
  })

  it('gives 409 for a stale seen and keeps the row', async () => {
    // Catches a delete that ignores what the admin saw.
    const before = await clubRows()
    const res = await remove({ id: 1, seen: { ...LIONS, area: null } })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'conflict', clubs: [clubWire(1, { name: 'Lions', area: 'Klang' }), clubWire(2, { name: 'Gilead' })] })
    expect(await clubRows()).toEqual(before)
  })

  it('gives 409 and keeps the row when it changes between the read and the delete', async () => {
    // Catches a DELETE without the stale-write guard, which would remove a club another admin just edited.
    const racing = racingAfterRead(/ORDER BY position/, () => env.DB.exec("UPDATE clubs SET area = 'Moved' WHERE id = 1")) // Another admin edits the area after the read.
    const res = await postTo('/api/clubs/remove', { id: 1, seen: LIONS }, {}, { env: { DB: racing } })
    expect(res.status).toBe(409)
    expect((await clubRows())[0]).toMatchObject({ name: 'Lions', area: 'Moved' }) // The club survives.
  })

  it('refuses a bad body', async () => {
    // Catches loose shapes.
    expect((await remove({ id: 1 })).status).toBe(400)
    expect((await remove({ id: 'x', seen: LIONS })).status).toBe(400)
    expect((await remove({ id: 1, seen: LIONS, extra: 1 })).status).toBe(400)
  })

  it('leaves an order that names the removed club readable', async () => {
    // Catches a removal that cascades to orders or breaks their club text.
    await seedOrders([{ number: 'PF-20261105-ABCD', club: 'Lions' }])
    await remove({ id: 1, seen: LIONS })
    const orders = (await (await call('/api/orders')).json()) as { orders: { club: string }[] }
    expect(orders.orders.map((order) => order.club)).toEqual(['Lions'])
  })
})
