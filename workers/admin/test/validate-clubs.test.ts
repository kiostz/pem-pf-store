// Tests the club body validators directly: strict `to` fields, lenient `from`, and exact shapes.

import { describe, expect, it } from 'vitest'
import { parseClubEdit, parseClubFields, parseClubOrder, parseClubRemove } from '../src/validate-clubs'

const FIELDS = { name: 'Lions', area: null, language: null, location: null, churchName: null }

describe('parseClubFields', () => {
  it('accepts a valid body and returns it', () => {
    // Catches a validator that rejects the plain case.
    expect(parseClubFields({ ...FIELDS, area: 'Klang' })).toEqual({ ...FIELDS, area: 'Klang' })
  })

  it('refuses "other" in any case and a non-object', () => {
    // Catches the reserved name or a non-object slipping through.
    expect(parseClubFields({ ...FIELDS, name: 'oTHer' })).toBeNull()
    expect(parseClubFields(null)).toBeNull()
    expect(parseClubFields('Lions')).toBeNull()
  })
})

describe('parseClubEdit', () => {
  it('accepts a messy `from` but refuses a messy `to`', () => {
    // Catches a lockout of stored messy rows, or messy new values.
    expect(parseClubEdit({ id: 1, from: { ...FIELDS, name: 'Li\tons' }, to: FIELDS })).not.toBeNull()
    expect(parseClubEdit({ id: 1, from: FIELDS, to: { ...FIELDS, name: 'Li\tons' } })).toBeNull()
  })

  it('refuses a no-op and a bad id', () => {
    // Catches a write that changes nothing.
    expect(parseClubEdit({ id: 1, from: FIELDS, to: FIELDS })).toBeNull()
    expect(parseClubEdit({ id: -1, from: FIELDS, to: { ...FIELDS, name: 'X' } })).toBeNull()
  })
})

describe('parseClubRemove and parseClubOrder', () => {
  it('parse their valid bodies', () => {
    // Catches validators that refuse the plain case.
    expect(parseClubRemove({ id: 2, seen: FIELDS })).toEqual({ id: 2, seen: FIELDS })
    expect(parseClubOrder({ from: [1, 2], to: [2, 1] })).toEqual({ from: [1, 2], to: [2, 1] })
  })
})
