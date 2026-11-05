// Tests POST /api/clubs/edit: guarded rename and details change, conflicts, retries, name clashes and untouched orders.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { BLANK, call, clubRows, clubWire, postTo, racingAfterRead, seedClubs, seedOrders } from './helpers'

const LIONS = { name: 'Lions', area: 'Klang', language: null, location: null, churchName: null }

beforeEach(async () => {
  await seedClubs([{ id: 1, name: 'Lions', area: 'Klang' }, { id: 2, name: 'Gilead', churchName: 'Gilead SDA' }])
})

/**
 * Sends an edit.
 * @param body The JSON body.
 * @return The response.
 */
const edit = (body: unknown) => postTo('/api/clubs/edit', body)

describe('POST /api/clubs/edit', () => {
  it('saves a rename and a details change', async () => {
    // Catches a save that drops a field or the rename.
    const res = await edit({ id: 1, from: LIONS, to: { name: 'Leos', area: null, language: 'English', location: 'KL', churchName: null } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ clubs: [clubWire(1, { name: 'Leos', language: 'English', location: 'KL' }), clubWire(2, { name: 'Gilead', churchName: 'Gilead SDA' })] })
  })

  it.each(['name', 'area', 'language', 'location', 'churchName'])('gives 409 with the stored list for a stale %s, writing nothing', async (key) => {
    // Catches a guard that skips a field, or compares null with = so a null never matches.
    const before = await clubRows()
    const from = { ...LIONS, [key]: key === 'area' ? 'Other place' : key === 'name' ? 'Lionz' : 'stale' } // Null against a value, or a different value.
    const res = await edit({ id: 1, from, to: { ...LIONS, name: 'Leos' } })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'conflict', clubs: [clubWire(1, { name: 'Lions', area: 'Klang' }), clubWire(2, { name: 'Gilead', churchName: 'Gilead SDA' })] })
    expect(await clubRows()).toEqual(before)
  })

  it('gives 409 for a null from against a stored value', async () => {
    // Catches a guard that treats a stale null as a match.
    const before = await clubRows()
    const res = await edit({ id: 1, from: { ...LIONS, area: null }, to: { ...LIONS, name: 'Leos' } })
    expect(res.status).toBe(409)
    expect(await clubRows()).toEqual(before)
  })

  it('gives 409 and keeps the other change when the row changes between the read and the write', async () => {
    // Catches an UPDATE without the stale-write guard, which would overwrite another admin's edit.
    const racing = racingAfterRead(/ORDER BY position/, () => env.DB.exec("UPDATE clubs SET area = 'Moved' WHERE id = 1")) // Another admin edits the area after the read.
    const res = await postTo('/api/clubs/edit', { id: 1, from: LIONS, to: { ...LIONS, name: 'Leos' } }, {}, { env: { DB: racing } })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toBe('conflict')
    expect((await clubRows())[0]).toMatchObject({ name: 'Lions', area: 'Moved' }) // Their change stands, ours was not written.
  })

  it('answers name-taken when the name is inserted between the check and the write', async () => {
    // Catches a missing UNIQUE catch on edit, which would answer 500 for a lost race.
    const racing = racingAfterRead(/SELECT 1 AS held/, () => env.DB.exec("INSERT INTO clubs (name, position) VALUES ('Leos', 9)")) // Another admin adds "Leos" first.
    const res = await postTo('/api/clubs/edit', { id: 1, from: LIONS, to: { ...LIONS, name: 'Leos' } }, {}, { env: { DB: racing } })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'name-taken' })
    expect((await clubRows())[0]).toMatchObject({ name: 'Lions' })
  })

  it.each(['area', 'language', 'location', 'churchName'])('refuses a new %s with a newline or U+2028', async (key) => {
    // Catches line breaks in an optional field reaching the table.
    for (const bad of ['x\ny', 'x\u2028y']) expect((await edit({ id: 1, from: LIONS, to: { ...LIONS, [key]: bad } })).status, JSON.stringify(bad)).toBe(400)
  })

  it('gives 409 without the club when it was removed', async () => {
    // Catches an edit of a removed club answering 200 or 404.
    await postTo('/api/clubs/remove', { id: 1, seen: LIONS })
    const res = await edit({ id: 1, from: LIONS, to: { ...LIONS, name: 'Leos' } })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'conflict', clubs: [clubWire(2, { name: 'Gilead', churchName: 'Gilead SDA' })] })
  })

  it('answers 200 on a retry after the save landed', async () => {
    // Catches a lost answer turning into a false conflict.
    const body = { id: 1, from: LIONS, to: { ...LIONS, name: 'Leos' } }
    expect((await edit(body)).status).toBe(200)
    expect((await edit(body)).status).toBe(200)
  })

  it('refuses a rename onto another club in another case', async () => {
    // Catches the case-sensitive UNIQUE letting "GILEAD" in beside "Gilead".
    const before = await clubRows()
    const res = await edit({ id: 1, from: LIONS, to: { ...LIONS, name: 'GILEAD' } })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'name-taken' })
    expect(await clubRows()).toEqual(before)
  })

  it('lets a club change only the case of its own name', async () => {
    // Catches the duplicate check counting the club against itself.
    expect((await edit({ id: 1, from: LIONS, to: { ...LIONS, name: 'LIONS' } })).status).toBe(200)
  })

  it('refuses from equal to to, "other" and a messy new name', async () => {
    // Catches a no-op write, a reserved name or S4 text reaching the table.
    expect((await edit({ id: 1, from: LIONS, to: LIONS })).status).toBe(400)
    expect((await edit({ id: 1, from: LIONS, to: { ...LIONS, name: 'Other' } })).status).toBe(400)
    expect((await edit({ id: 1, from: LIONS, to: { ...LIONS, name: 'Le\tos' } })).status).toBe(400)
    expect((await edit({ id: 0, from: LIONS, to: { ...LIONS, name: 'Leos' } })).status).toBe(400)
    expect((await edit({ id: 1, from: LIONS, to: { ...LIONS, name: 'Leos' }, extra: 1 })).status).toBe(400)
  })

  it('lets a stored row with messy text be edited by sending it back as from', async () => {
    // Catches a strict `from` that would lock the admin out of a pre-existing messy row.
    await seedClubs([{ id: 1, name: 'Li\tons' }])
    expect((await edit({ id: 1, from: { name: 'Li\tons', ...BLANK }, to: { name: 'Lions', ...BLANK } })).status).toBe(200)
  })

  it('leaves orders byte-equal', async () => {
    // Catches an edit that rewrites the club text on past orders.
    await seedOrders([{ number: 'PF-20261105-ABCD', club: 'Lions' }])
    const before = await (await call('/api/orders')).text()
    await edit({ id: 1, from: LIONS, to: { ...LIONS, name: 'Leos' } })
    expect(await (await call('/api/orders')).text()).toBe(before)
  })
})
