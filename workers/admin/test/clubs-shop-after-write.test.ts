// The shop's own answer after club writes: whatever the admin does to the list, /shop still passes the shop page's validation, and a rename racing an add in another case is pinned down.
/// <reference types="vite/client" />

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { readShop } from '../../api/src/read'
import { loadShop } from '../../../src/shared/data/load.ts' // the shop page's own check of /shop
import { BLANK, clubRows, postTo, racingAfterRead, seedClubs, seedHonors } from './helpers'

const FIELDS = { name: 'Lions', area: 'Klang', language: null, location: null, churchName: null }

beforeEach(async () => {
  await seedHonors([{ id: 'knot-tying', name: 'Knot Tying', stock: 5 }])
  await env.DB.exec("DELETE FROM settings; INSERT INTO settings (id, currency, default_price_cents, order_email_on) VALUES (1, 'MYR', 400, 1)")
  await seedClubs([{ id: 1, name: 'Lions', area: 'Klang' }, { id: 2, name: 'Gilead', churchName: 'Gilead SDA' }])
})

/**
 * Runs the API Worker's /shop body through the shop page's validation.
 * @return The clubs the shop page would show.
 */
async function shopClubs() {
  const body = JSON.stringify(await readShop(env.DB)) // What /shop answers with.
  return (await loadShop((async () => new Response(body)) as typeof fetch)).clubs // Throws if the shop page would refuse it.
}

describe('/shop after club writes', () => {
  it('passes the shop validation after an add, rename, move and remove, and after the last club is removed', async () => {
    // Catches a club write leaving a row (empty string, duplicate name, extra key) the shop page refuses, which would blank the whole shop.
    await postTo('/api/clubs', { name: 'Newcomers', ...BLANK, language: 'Malay' })
    expect((await shopClubs()).map((club) => club.name)).toEqual(['Lions', 'Gilead', 'Newcomers'])
    await postTo('/api/clubs/edit', { id: 1, from: FIELDS, to: { name: 'Leos', area: null, language: null, location: null, churchName: null } })
    expect((await shopClubs())[0]).toEqual({ name: 'Leos', area: null, language: null, location: null, churchName: null })
    await postTo('/api/clubs/order', { from: [1, 2, 3], to: [3, 2, 1] })
    expect((await shopClubs()).map((club) => club.name)).toEqual(['Newcomers', 'Gilead', 'Leos'])
    await postTo('/api/clubs/remove', { id: 2, seen: { name: 'Gilead', area: null, language: null, location: null, churchName: 'Gilead SDA' } })
    expect((await shopClubs()).map((club) => club.name)).toEqual(['Newcomers', 'Leos'])
    await postTo('/api/clubs/remove', { id: 1, seen: { name: 'Leos', area: null, language: null, location: null, churchName: null } }) // The first.
    await postTo('/api/clubs/remove', { id: 3, seen: { name: 'Newcomers', area: null, language: 'Malay', location: null, churchName: null } }) // The last.
    expect(await shopClubs()).toEqual([]) // An empty list is valid: the shop asks for a typed club.
  })
})

describe('a rename racing an add onto the same name in another case', () => {
  it.fails('leaves at most one club under that name ignoring case', async () => {
    // Holds a gap accepted by decision 1, loses its marker with a fix: catches the case-blind UNIQUE letting "Rivals" and "RIVALS" both exist when the check and the write interleave (decision 1 accepts this; this pins whether it happens).
    const racing = racingAfterRead(/SELECT 1 AS held/, () => env.DB.exec("INSERT INTO clubs (name, position) VALUES ('RIVALS', 9)")) // Another admin adds the other case first.
    await postTo('/api/clubs/edit', { id: 1, from: FIELDS, to: { ...FIELDS, name: 'Rivals' } }, {}, { env: { DB: racing } })
    const names = (await clubRows()).map((row) => String(row.name).toLowerCase())
    expect(names.filter((name) => name === 'rivals').length).toBeLessThanOrEqual(1)
  })
})
