// Tests for the sent order's sessionStorage: a round trip, and every bad stored value giving null with a warning.

import { afterEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import {
  readSentOrder,
  SENT_ORDER_STORAGE_KEY,
  writeSentOrder,
} from './sent-order-storage.ts' // code under test
import type { SentOrder } from './sent-order.ts' // the stored shape

const order: SentOrder = {
  number: 'PF-20261028-4K7Q',
  sentAt: '2026-10-28T10:00:00.000Z',
  currency: 'MYR',
  lines: [
    { itemId: 'knot-tying', name: 'Knot Tying', quantity: 3, priceCents: 300 },
  ],
  totalCents: 900,
  contact: { name: 'J. Cruz', email: 'jc@mail.com', phone: '+60 12-345 6789' },
  club: { subject: 'Eagles', email: 'Eagles' },
  changesNotSent: false,
} // an order as sent

const oldLines = [{ honorId: 'knot-tying', name: 'Knot Tying', quantity: 3, priceCents: 300 }] // the lines as versions 1 and 2 stored them

const versionTwoOrder = { ...order, lines: oldLines } // an order as the second format stored it

const versionOneOrder = { number: order.number, sentAt: order.sentAt, currency: order.currency, lines: oldLines, totalCents: order.totalCents, club: order.club, name: 'J. Cruz', email: 'jc@mail.com', phone: '+60 12-345 6789' } // an order as the first format stored it

const blocked = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
} as unknown as Storage // storage that refuses every call

afterEach(() => {
  writeSentOrder(order) // a good write forgets any order held in memory
  window.sessionStorage.clear() // nothing left for the next test
  vi.restoreAllMocks() // spies removed
})

describe('sent order storage', () => {
  it('keeps the order under its key in the versioned format and reads it back', () => {
    // catches: a key or format that differs from what the confirmation page reads
    writeSentOrder(order)
    expect(
      JSON.parse(window.sessionStorage.getItem(SENT_ORDER_STORAGE_KEY) ?? ''),
    ).toEqual({ version: 3, order: order })
    expect(readSentOrder()).toEqual(order)
  })

  it("keeps the buyer's email with the order", () => {
    // catches: the email lost between the send and the confirmation page
    writeSentOrder(order)
    expect(readSentOrder()?.contact?.email).toBe('jc@mail.com')
  })

  it('still gives the order back in this tab when storage cannot be written', () => {
    // catches: a sent order shown as "no order" because sessionStorage is blocked
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeSentOrder(order, blocked)
    expect(readSentOrder()).toEqual(order)
    expect(window.sessionStorage.getItem(SENT_ORDER_STORAGE_KEY)).toBeNull()
  })

  it('shows a later good write, not the order held in memory', () => {
    // catches: an old held order hiding the next order sent in the same tab
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeSentOrder(order, blocked)
    writeSentOrder({ ...order, number: 'PF-20261029-ABCD' })
    expect(readSentOrder()?.number).toBe('PF-20261029-ABCD')
    window.sessionStorage.clear()
    expect(readSentOrder()).toBeNull()
  })

  it('shows the order just sent, not an older stored one, when saving the new one fails', () => {
    // catches: the confirmation showing the previous order's number after a refused write
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeSentOrder(order) // the older order is stored
    const refusesWrites = {
      getItem: () => null,
      setItem: () => {
        throw new Error('full')
      },
    } as unknown as Storage // storage that refuses to save
    writeSentOrder({ ...order, number: 'PF-20261029-ABCD' }, refusesWrites)
    expect(readSentOrder()?.number).toBe('PF-20261029-ABCD')
  })

  it('leaves no older order stored when saving the new one fails, so a reload cannot show it', () => {
    // catches: a reload after a refused save showing the previous order's number as the one just sent
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeSentOrder(order) // the older order is stored
    const refusesSaves = {
      setItem: () => {
        throw new Error('full')
      },
      removeItem: (key: string) => window.sessionStorage.removeItem(key),
    } as unknown as Storage // refuses to save but can still remove
    writeSentOrder({ ...order, number: 'PF-20261029-ABCD' }, refusesSaves)
    expect(window.sessionStorage.getItem(SENT_ORDER_STORAGE_KEY)).toBeNull()
  })

  it('reads null when nothing is stored, without a warning', () => {
    // catches: a warning on every visit to the confirmation address
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readSentOrder()).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it.each([
    ['bad JSON', 'not json'],
    ['version 4', '{"version":4,"order":{"number":"PF-20261028-4K7Q"}}'],
    ['JSON null', 'null'],
    ['no order', '{"version":1}'],
  ])('reads null with one warning for %s', (_label, text) => {
    // catches: a stale or hand-edited value crashing the confirmation page
    window.sessionStorage.setItem(SENT_ORDER_STORAGE_KEY, text)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readSentOrder()).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('reads null with a warning when storage throws, and a write that throws does not throw', () => {
    // catches: blocked storage turning a sent order into an error screen
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readSentOrder(blocked)).toBeNull()
    expect(() => writeSentOrder(order, blocked)).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(2)
  })
  it.each([
    ['an order with no lines', { number: 'PF-20261028-4K7Q' }],
    ['lines that are not a list', { ...versionOneOrder, lines: 'Knot Tying' }],
    [
      'a line with no price',
      { ...versionOneOrder, lines: [{ honorId: 'a', name: 'A', quantity: 1 }] },
    ],
    ['a total that is text', { ...versionOneOrder, totalCents: '900' }],
    ['no club', { ...versionOneOrder, club: undefined }],
    ['a phone that is a number', { ...versionOneOrder, phone: 123 }],
    ['a send time that is not text', { ...versionOneOrder, sentAt: 5 }],
  ])('reads null for a version 1 value holding %s', (_label, bad) => {
    // catches: a foreign or hand-edited value that passes the check on the number alone and then crashes the confirmation page
    window.sessionStorage.setItem(
      SENT_ORDER_STORAGE_KEY,
      JSON.stringify({ version: 1, order: bad }),
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readSentOrder()).toBeNull()
  })

  it('reads a version 1 value as version 3, with its contact, no changes flag and itemId lines', () => {
    // catches: an order sent before the update losing its confirmation after a reload
    window.sessionStorage.setItem(SENT_ORDER_STORAGE_KEY, JSON.stringify({ version: 1, order: versionOneOrder }))
    expect(readSentOrder()).toEqual(order)
  })

  it('reads a version 2 order with honorId lines as version 3 with itemId lines', () => {
    // catches: a buyer who sent just before the update losing the confirmation after a reload
    window.sessionStorage.setItem(SENT_ORDER_STORAGE_KEY, JSON.stringify({ version: 2, order: versionTwoOrder }))
    expect(readSentOrder()).toEqual(order)
  })

  it('reads null with one warning and no content for version 2 lines with neither field', () => {
    // catches: a half-lifted line reaching the confirmation page, or order content in the warning
    window.sessionStorage.setItem(
      SENT_ORDER_STORAGE_KEY,
      JSON.stringify({ version: 2, order: { ...versionTwoOrder, lines: [{ name: 'Knot Tying', quantity: 3, priceCents: 300 }] } }),
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readSentOrder()).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Knot Tying')
  })

  it('reads null for version 3 lines that still say honorId', () => {
    // catches: the old field name passing as the new format
    window.sessionStorage.setItem(SENT_ORDER_STORAGE_KEY, JSON.stringify({ version: 3, order: versionTwoOrder }))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readSentOrder()).toBeNull()
  })

  it('reads a version 2 order whose contact is null', () => {
    // catches: the contact-free confirmation lost on reload
    const noContact = { ...order, contact: null, changesNotSent: true }
    writeSentOrder(noContact)
    expect(readSentOrder()).toEqual(noContact)
  })

  it.each([
    ['a contact missing its phone', { ...order, contact: { name: 'J. Cruz', email: 'jc@mail.com' } }],
    ['a contact with a number for a name', { ...order, contact: { ...order.contact, name: 5 } }],
    ['a changes flag that is text', { ...order, changesNotSent: 'yes' }],
    ['no changes flag', { ...order, changesNotSent: undefined }],
  ])('reads null for a version 2 value holding %s', (_label, bad) => {
    // catches: a half-filled contact reaching the confirmation page
    window.sessionStorage.setItem(SENT_ORDER_STORAGE_KEY, JSON.stringify({ version: 2, order: { ...bad, lines: oldLines } }))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readSentOrder()).toBeNull()
  })

  it.each([
    ['an array', '[1,2]'],
    ['a string', '"PF-20261028-4K7Q"'],
    ['a number', '7'],
    ['an empty string', ''],
  ])('reads null for %s stored under the key', (_label, text) => {
    // catches: a non-object value throwing on property access
    window.sessionStorage.setItem(SENT_ORDER_STORAGE_KEY, text)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readSentOrder()).toBeNull()
  })

  it('never writes the order to localStorage or the address', () => {
    // catches: buyer details left on disk after the tab closes, or put in a URL
    const hash = window.location.hash
    writeSentOrder(order)
    expect(window.localStorage.length).toBe(0)
    expect(window.location.hash).toBe(hash)
    expect(window.location.search).toBe('')
  })

  it('replaces the stored order with the next one sent', () => {
    // catches: a second send leaving the first order on the confirmation page
    writeSentOrder(order)
    writeSentOrder({ ...order, number: 'PF-20261029-ABCD', totalCents: 50 })
    expect(readSentOrder()?.number).toBe('PF-20261029-ABCD')
    expect(readSentOrder()?.totalCents).toBe(50)
  })

  it('serves the order held in memory when reading throws but the write was refused', () => {
    // catches: a read-blocked storage turning a held order into "no order"
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeSentOrder(order, blocked)
    expect(readSentOrder(blocked)?.number).toBe(order.number)
  })

  it('does not put buyer data in any warning when storage fails', () => {
    // catches: a warning that logs the name, email or phone
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeSentOrder(order, blocked)
    readSentOrder(blocked)
    window.sessionStorage.setItem(
      SENT_ORDER_STORAGE_KEY,
      'jc@mail.com not json',
    )
    readSentOrder()
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(
      /jc@mail\.com|J\. Cruz|345 6789/,
    )
  })
})
