// Tests for the pending send's sessionStorage: the version 2 round trip, a version 1 value read as version 2, malformed contacts removed with a warning, and blocked storage.

import { afterEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import { EMPTY_ORDER_FORM } from './order-form.ts' // the form values
import { PENDING_SEND_STORAGE_KEY, readPendingSend, writePendingSend, type PendingSend } from './pending-send-storage.ts' // code under test

const contact = { name: 'J. Cruz', email: 'jc@mail.com', phone: '+60 12-345 6789' } // one send's contact
const pending: PendingSend = {
  requestId: '3f0c1d5e-8a43-4c1e-9d0e-5b7a2f6c9e10',
  lines: [['knot-tying', 3]],
  values: { ...EMPTY_ORDER_FORM, ...contact, club: 'Eagles' },
  contacts: [contact],
} // a pending send

const blocked = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
} as unknown as Storage // storage that refuses every call

afterEach(() => {
  window.sessionStorage.clear() // nothing left for the next test
  vi.restoreAllMocks() // spies removed
})

describe('pending send storage', () => {
  it('round-trips a version 2 value with its contacts', () => {
    // catches: contacts lost between a send and the resend after a reload
    writePendingSend({ ...pending, contacts: [contact, { ...contact, phone: '+60 11 000 0000' }] })
    expect(JSON.parse(window.sessionStorage.getItem(PENDING_SEND_STORAGE_KEY) ?? '').version).toBe(2)
    expect(readPendingSend()?.contacts).toEqual([contact, { ...contact, phone: '+60 11 000 0000' }])
    expect(readPendingSend()?.requestId).toBe(pending.requestId)
  })

  it('reads a version 1 value as version 2 with one contact taken from its values', () => {
    // catches: a send made before the update losing its request id after a reload
    const versionOne = { requestId: pending.requestId, lines: pending.lines, values: pending.values } // the first format had no contacts
    window.sessionStorage.setItem(PENDING_SEND_STORAGE_KEY, JSON.stringify({ version: 1, pending: versionOne }))
    expect(readPendingSend()).toEqual(pending)
  })

  it('removes malformed contacts with one warning and keeps the rest', () => {
    // catches: one bad contact discarding the request id, or a half-filled contact reaching the confirmation
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bad = { ...pending, contacts: [contact, { name: 'x' }, { ...contact, phone: 5 }, 'text'] }
    window.sessionStorage.setItem(PENDING_SEND_STORAGE_KEY, JSON.stringify({ version: 2, pending: bad }))
    expect(readPendingSend()?.contacts).toEqual([contact])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Cruz|jc@mail|6789/) // no buyer data in the warning
  })

  it('removes a version 2 value whose contacts are not a list', () => {
    // catches: a value that crashes the resend
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.sessionStorage.setItem(PENDING_SEND_STORAGE_KEY, JSON.stringify({ version: 2, pending: { ...pending, contacts: 'x' } }))
    expect(readPendingSend()).toBeNull()
    expect(window.sessionStorage.getItem(PENDING_SEND_STORAGE_KEY)).toBeNull()
  })

  it('gives null with a warning when storage is blocked', () => {
    // catches: blocked storage turning a send into an error
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readPendingSend(blocked)).toBeNull()
    expect(() => writePendingSend(pending, blocked)).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(2)
  })
})
