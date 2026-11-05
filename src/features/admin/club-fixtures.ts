// Clubs the admin tests share, shaped like the Admin Worker's answers, so each test file builds on the same ten clubs.

import type { AdminClub } from '../../../workers/admin/src/admin-types.ts' // the shared shape

/**
 * Builds one club with sensible defaults.
 * @param fields the fields that differ from the default
 * @return a full club
 */
export const makeClub = (fields: Partial<AdminClub> & { id: number }): AdminClub => ({
  name: `Club ${fields.id}`, // the id doubles as a name unless given
  area: null, // no detail
  language: null, // no detail
  location: null, // no detail
  churchName: null, // no detail
  ...fields, // what the test sets
}) // a full club

// Ten clubs in shown order; the fourth is Phoenix Club and has a grey line.
export const clubs: AdminClub[] = [
  makeClub({ id: 1, name: 'Alpha Club' }),
  makeClub({ id: 2, name: 'Beta Club', area: 'Klang' }),
  makeClub({ id: 3, name: 'Gamma Club' }),
  makeClub({ id: 4, name: 'Phoenix Club', area: 'Petaling Jaya', language: 'English', churchName: 'Phoenix SDA Church' }),
  makeClub({ id: 5, name: 'Delta Club' }),
  makeClub({ id: 6, name: 'Epsilon Club' }),
  makeClub({ id: 7, name: 'Zeta Club' }),
  makeClub({ id: 8, name: 'Eta Club' }),
  makeClub({ id: 9, name: 'Theta Club' }),
  makeClub({ id: 10, name: 'Iota Club' }),
]
