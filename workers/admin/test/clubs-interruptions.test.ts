// Club and price writes under interruptions: double sends, two tabs writing at once, and field limits, so one change lands once and nothing is overwritten.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { BLANK, call, clubRows, postTo, seedClubs } from './helpers'

const LIONS = { name: 'Lions', area: null, language: null, location: null, churchName: null }
const GILEAD = { name: 'Gilead', area: null, language: null, location: null, churchName: null }

beforeEach(async () => {
  await seedClubs([{ id: 1, name: 'Lions' }, { id: 2, name: 'Gilead' }, { id: 3, name: 'Hope' }])
  await env.DB.exec("DELETE FROM settings; INSERT INTO settings (id, currency, default_price_cents, order_email_on) VALUES (1, 'MYR', 400, 1)")
})

describe('two requests at once', () => {
  it('stores one club when Add is sent twice together, the second saying name-taken', async () => {
    // Catches a double click on Add making two clubs or answering 500 for the loser.
    const body = { name: 'Newcomers', ...BLANK }
    const answers = await Promise.all([postTo('/api/clubs', body), postTo('/api/clubs', body)])
    expect(answers.map((res) => res.status).sort()).toEqual([201, 409])
    expect((await clubRows()).filter((row) => row.name === 'Newcomers')).toHaveLength(1)
  })

  it('keeps exactly one of two different renames of the same club sent together', async () => {
    // Catches two tabs both writing, so the later rename silently overwrites the earlier.
    const [a, b] = await Promise.all([
      postTo('/api/clubs/edit', { id: 1, from: LIONS, to: { ...LIONS, name: 'Leos' } }),
      postTo('/api/clubs/edit', { id: 1, from: LIONS, to: { ...LIONS, name: 'Cubs' } }),
    ])
    expect([a.status, b.status]).toEqual([200, 409]) // One wins, the other is a conflict.
    const name = (await clubRows())[0].name
    expect(['Leos', 'Cubs']).toContain(name)
    expect(name).toBe(a.status === 200 ? 'Leos' : 'Cubs') // The winner's name stands.
  })

  it('gives 200 to both when the same rename is sent twice together, writing once', async () => {
    // Catches the loser of two identical edits read before either wrote getting 409 instead of the retry's 200, a false "updated in another tab".
    const body = { id: 1, from: LIONS, to: { ...LIONS, name: 'Leos' } }
    const answers = await Promise.all([postTo('/api/clubs/edit', body), postTo('/api/clubs/edit', body)])
    expect(answers.map((res) => res.status)).toEqual([200, 200])
    expect((await clubRows())[0].name).toBe('Leos')
  })

  it('removes once and keeps the others when Remove is sent twice together', async () => {
    // Catches a double Remove deleting a neighbour or answering 409 for the same removal.
    const body = { id: 2, seen: GILEAD }
    const answers = await Promise.all([postTo('/api/clubs/remove', body), postTo('/api/clubs/remove', body)])
    expect(answers.map((res) => res.status)).toEqual([200, 200])
    expect((await clubRows()).map((row) => row.name)).toEqual(['Lions', 'Hope'])
  })

  it('applies one of two different moves sent together and refuses the other as a conflict', async () => {
    // Catches two tabs' reorders interleaving into a list neither admin saw.
    const [a, b] = await Promise.all([
      postTo('/api/clubs/order', { from: [1, 2, 3], to: [2, 1, 3] }),
      postTo('/api/clubs/order', { from: [1, 2, 3], to: [1, 3, 2] }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    const ids = ((await (await call('/api/clubs')).json()) as { clubs: { id: number }[] }).clubs.map((club) => club.id)
    expect(ids).toEqual(a.status === 200 ? [2, 1, 3] : [1, 3, 2]) // The winner's order, whole.
    expect((await clubRows()).map((row) => row.position).sort()).toEqual([1, 2, 3]) // Positions stay 1..n.
  })

  it('moves once when the same move is sent twice together', async () => {
    // Catches a double click on Move up sending the club two places.
    const body = { from: [1, 2, 3], to: [2, 1, 3] }
    const answers = await Promise.all([postTo('/api/clubs/order', body), postTo('/api/clubs/order', body)])
    expect(answers.map((res) => res.status)).toEqual([200, 200])
    const ids = ((await (await call('/api/clubs')).json()) as { clubs: { id: number }[] }).clubs.map((club) => club.id)
    expect(ids).toEqual([2, 1, 3])
  })

  it('lets one of two different price saves from the same view win and conflicts the other', async () => {
    // Catches a prices save that overwrites another tab's with a stale from.
    const [a, b] = await Promise.all([
      postTo('/api/settings/prices', { defaultPriceCents: { from: 400, to: 500 } }),
      postTo('/api/settings/prices', { defaultPriceCents: { from: 400, to: 600 } }),
    ])
    expect([a.status, b.status]).toEqual([200, 409])
    const meta = (await (await call('/api/meta')).json()) as { defaultPriceCents: number }
    expect(meta.defaultPriceCents).toBe(a.status === 200 ? 500 : 600)
  })
})

describe('prices limits and half-stale saves', () => {
  it('accepts 0 and 99,999 and refuses -1 and 100,000', async () => {
    // Catches an off-by-one on the cap or a floor that refuses a free default price.
    expect((await postTo('/api/settings/prices', { defaultPriceCents: { from: 400, to: 99999 } })).status).toBe(200)
    expect((await postTo('/api/settings/prices', { defaultPriceCents: { from: 99999, to: 0 } })).status).toBe(200)
    expect((await postTo('/api/settings/prices', { defaultPriceCents: { from: 0, to: -1 } })).status).toBe(400)
    expect((await postTo('/api/settings/prices', { defaultPriceCents: { from: 0, to: 100000 } })).status).toBe(400)
  })

  it('writes neither field when only the price is stale', async () => {
    // Catches a save that writes the fresh currency while the price guard fails (a half write).
    const res = await postTo('/api/settings/prices', { currency: { from: 'MYR', to: 'SGD' }, defaultPriceCents: { from: 999, to: 700 } })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'conflict', currency: 'MYR', defaultPriceCents: 400 })
  })

  it('reads a retry as saved only when both stored fields already equal to', async () => {
    // Catches a retry check that looks at one field, hiding a conflict on the other.
    await env.DB.exec("UPDATE settings SET currency = 'SGD'") // Another tab changed only the currency.
    const res = await postTo('/api/settings/prices', { currency: { from: 'MYR', to: 'SGD' }, defaultPriceCents: { from: 400, to: 700 } })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'conflict', currency: 'SGD', defaultPriceCents: 400 })
  })
})

describe('club field limits', () => {
  it.each(['area', 'language', 'location', 'churchName'])('accepts 100 characters and refuses 101 in %s', async (key) => {
    // Catches an off-by-one on a detail's limit.
    const ok = await postTo('/api/clubs', { name: `With ${key}`, ...BLANK, [key]: 'a'.repeat(100) })
    expect(ok.status).toBe(201)
    const bad = await postTo('/api/clubs', { name: `Too long ${key}`, ...BLANK, [key]: 'a'.repeat(101) })
    expect(bad.status).toBe(400)
  })

  it('keeps a stored empty-looking null and refuses an empty string in the sheet-sent shape', async () => {
    // Catches '' reaching the table where the CHECK would answer 500 instead of 400.
    expect((await postTo('/api/clubs', { name: 'Blank', ...BLANK, area: '' })).status).toBe(400)
    expect((await postTo('/api/clubs', { name: 'Blank', ...BLANK })).status).toBe(201)
  })
})
