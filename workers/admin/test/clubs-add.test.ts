// Tests POST /api/clubs: add last, name rules (S4 control characters), case-insensitive duplicates and exact shape.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { BLANK, clubRows, clubWire, postTo, racingAfterRead, seedClubs } from './helpers'

beforeEach(async () => {
  await seedClubs([{ id: 1, name: 'Lions' }, { id: 2, name: 'Gilead', churchName: 'Gilead SDA' }])
})

/**
 * Sends an Add.
 * @param body The JSON body.
 * @return The response.
 */
const add = (body: unknown) => postTo('/api/clubs', body)

describe('POST /api/clubs', () => {
  it('adds the club last and answers 201 with the whole list', async () => {
    // Catches a new club at position 0 or one that does not come back in the list.
    const res = await add({ name: 'Test Club', ...BLANK, area: 'Klang' })
    expect(res.status).toBe(201)
    const { clubs } = (await res.json()) as { clubs: Record<string, unknown>[] }
    expect(clubs.map((club) => club.name)).toEqual(['Lions', 'Gilead', 'Test Club'])
    expect(clubs[2]).toMatchObject({ area: 'Klang', language: null })
  })

  it('adds first in an empty table', async () => {
    // Catches MAX(position) of nothing becoming NULL and tripping NOT NULL.
    await seedClubs([])
    const res = await add({ name: 'Solo', ...BLANK })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ clubs: [{ id: expect.any(Number), name: 'Solo', ...BLANK }] })
    expect((await clubRows())[0].position).toBe(1)
  })

  it('refuses a name another club holds in another case, writing nothing', async () => {
    // Catches the exact-case UNIQUE letting "lions" in beside "Lions".
    const before = await clubRows()
    const res = await add({ name: 'lions', ...BLANK })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'name-taken' })
    expect(await clubRows()).toEqual(before)
  })

  it.each(['Other', 'OTHER', ' other'])('refuses %j', async (name) => {
    // Catches "other" reaching the table, where its CHECK would answer 500.
    expect((await add({ name, ...BLANK })).status).toBe(400)
  })

  it.each([
    ['a tab', 'Li\tons'],
    ['a newline', 'Li\nons'],
    ['U+2028', 'Li ons'],
    ['padding', ' Lions2'],
    ['101 characters', 'a'.repeat(101)],
    ['empty', ''],
  ])('refuses a name with %s', async (_label, name) => {
    // Catches open item S4: messy names getting through.
    const before = await clubRows()
    expect((await add({ name, ...BLANK })).status).toBe(400)
    expect(await clubRows()).toEqual(before)
  })

  it('counts the name in UTF-16 units like the order check: 50 emoji pass, 51 do not', async () => {
    // Catches a name the admin saves that every order for the club then refuses (over 100 units).
    expect((await add({ name: '😀'.repeat(50), ...BLANK })).status).toBe(201)
    expect((await add({ name: '😀'.repeat(51), ...BLANK })).status).toBe(400)
    expect((await add({ name: 'a'.repeat(100), ...BLANK })).status).toBe(201)
  })

  it('answers name-taken when the same name is inserted between the check and the write', async () => {
    // Catches a missing UNIQUE catch, which would answer 500 for a lost race.
    const racing = racingAfterRead(/SELECT 1 AS held/, () => env.DB.exec("INSERT INTO clubs (name, position) VALUES ('Zed', 9)")) // Another admin adds "Zed" first.
    const res = await postTo('/api/clubs', { name: 'Zed', ...BLANK }, {}, { env: { DB: racing } })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'name-taken' })
    expect((await clubRows()).filter((row) => row.name === 'Zed')).toHaveLength(1)
  })

  it.each(['area', 'language', 'location', 'churchName'])('refuses an empty, padded or control-character %s', async (key) => {
    // Catches an optional field stored as '' (the CHECK would 500) or messy text.
    for (const bad of ['', ' x', 'x\ty', 'x\ny', 'x\u2028y', 'a'.repeat(101)]) expect((await add({ name: 'New', ...BLANK, [key]: bad })).status, JSON.stringify(bad)).toBe(400)
  })

  it('refuses an extra or a missing key', async () => {
    // Catches a loose body shape.
    expect((await add({ name: 'New', ...BLANK, extra: 1 })).status).toBe(400)
    expect((await add({ name: 'New', area: null })).status).toBe(400)
    expect((await add(['New'])).status).toBe(400)
  })
})

describe('the list after an add', () => {
  it('keeps the seeded wire shape', async () => {
    // Catches renamed keys (church_name) leaking to the page.
    const res = await add({ name: 'Zed', ...BLANK })
    expect(((await res.json()) as { clubs: unknown[] }).clubs[0]).toEqual(clubWire(1, { name: 'Lions' }))
  })
})
