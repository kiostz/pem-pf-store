// Tests that no club route writes club text to the console on any refusal kind (400, 403, 413, 415, both 409s).

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BLANK, postTo, racingAfterRead, seedClubs } from './helpers'

const SECRET = 'Secret Club Text' // Text that must never be logged.
const SEEN = { name: 'Lions', area: SECRET, language: null, location: null, churchName: null }

beforeEach(async () => {
  await seedClubs([{ id: 1, name: 'Lions', area: SECRET }, { id: 2, name: 'Gilead' }, { id: 3, name: 'Zion' }])
})

describe('club refusals', () => {
  it('write nothing to the console on any refusal kind', async () => {
    // Catches club data or any log line on a refused club write.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const json = { Origin: 'https://admin.test', 'Content-Type': 'application/json' }
    const statuses = [
      (await postTo('/api/clubs', { name: SECRET + '\t', ...BLANK })).status, // 400 invalid add.
      (await postTo('/api/clubs/edit', { id: 1, from: SEEN, to: SEEN })).status, // 400 no-op edit.
      (await postTo('/api/clubs/remove', { id: 'x', seen: SEEN })).status, // 400 bad id.
      (await postTo('/api/clubs/order', { from: [1, 2], to: [1, 2] })).status, // 400 no-op reorder.
      (await postTo('/api/clubs', { name: SECRET, ...BLANK }, { headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' } })).status, // 403.
      (await postTo('/api/clubs', { name: SECRET, ...BLANK }, { headers: { ...json, 'Content-Type': 'text/plain' } })).status, // 415.
      (await postTo('/api/clubs', { pad: SECRET.repeat(5000) })).status, // 413.
      (await postTo('/api/clubs', { name: 'lions', ...BLANK })).status, // 409 name-taken.
      (await postTo('/api/clubs/edit', { id: 1, from: { ...SEEN, area: 'stale' }, to: { ...SEEN, name: 'Leos' } })).status, // 409 conflict.
      (await postTo('/api/clubs/remove', { id: 1, seen: { ...SEEN, area: 'stale' } })).status, // 409 conflict.
      (await postTo('/api/clubs/order', { from: [3, 2, 1], to: [2, 3, 1] })).status, // 409 conflict.
      (await postTo('/api/clubs/edit', { id: 1, from: SEEN, to: { ...SEEN, name: 'Leos' } }, {}, { env: { DB: racingAfterRead(/SELECT 1 AS held/, () => env.DB.exec("INSERT INTO clubs (name, position) VALUES ('Leos', 9)")) } })).status, // 409 name-taken after a lost race.
    ]
    expect(statuses).toEqual([400, 400, 400, 400, 403, 415, 413, 409, 409, 409, 409, 409])
    expect(spy).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
    spy.mockRestore()
    warn.mockRestore()
    log.mockRestore()
  })
})
