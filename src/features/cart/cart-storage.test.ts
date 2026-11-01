// Tests for reading and writing the cart in localStorage: exact format, round trip and every bad stored value.

import { beforeEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import { CART_STORAGE_KEY, readCart, writeCart } from './cart-storage.ts' // code under test

/**
 * Builds a storage that throws on the named method, as blocked or full storage does.
 * @param method which method throws
 * @return a Storage whose other methods work on an empty store
 */
function throwingStorage(method: 'getItem' | 'setItem'): Storage {
  const real = window.localStorage // a working storage for the other method
  return {
    getItem: () => {
      if (method === 'getItem') throw new Error('blocked') // the failing call
      return real.getItem(CART_STORAGE_KEY) // the working call
    },
    setItem: () => {
      if (method === 'setItem') throw new Error('full') // the failing call
    },
  } as unknown as Storage // only these two methods are used
}

describe('cart-storage', () => {
  beforeEach(() => {
    vi.restoreAllMocks() // a fresh warn spy each test
  })

  it('writes the exact JSON under the repo-scoped key', () => {
    // catches: a key that collides with the account's other sites, or a changed format
    writeCart({ 'knot-tying': 2 })
    expect(CART_STORAGE_KEY).toBe('pem-pf-store:cart')
    expect(window.localStorage.getItem('pem-pf-store:cart')).toBe(
      '{"version":1,"quantities":{"knot-tying":2}}',
    )
  })

  it('reads back what it wrote', () => {
    // catches: a writer and a reader that disagree
    writeCart({ ants: 3, 'knot-tying': 2 })
    expect(readCart()).toEqual({ ants: 3, 'knot-tying': 2 })
  })

  it('gives an empty cart without a warning when nothing is stored', () => {
    // catches: a warning for every first-time visitor
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readCart()).toEqual({})
    expect(warn).not.toHaveBeenCalled()
  })

  it.each([
    ['bad JSON', 'not json'],
    ['null', 'null'],
    ['an array', '[1,2]'],
    ['version 2', '{"version":2,"quantities":{"ants":1}}'],
    ['quantities as an array', '{"version":1,"quantities":[1]}'],
    ['no quantities', '{"version":1}'],
  ])('gives an empty cart and one warning for %s', (_label, stored) => {
    // catches: an error screen, a half-read cart, or a silent swallow of a bad value
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.localStorage.setItem(CART_STORAGE_KEY, stored)
    expect(readCart()).toEqual({})
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('gives an empty cart and a warning when getItem throws', () => {
    // catches: blocked storage crashing the app at start
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readCart(throwingStorage('getItem'))).toEqual({})
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('warns instead of throwing when setItem throws', () => {
    // catches: a full storage breaking every quantity change
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() =>
      writeCart({ ants: 1 }, throwingStorage('setItem')),
    ).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('caps 150 at 99 and drops 0, -2, 1.5 and "3"', () => {
    // catches: out-of-range or non-numeric quantities reaching the cart
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      '{"version":1,"quantities":{"a":150,"b":0,"c":-2,"d":1.5,"e":"3","f":4}}',
    )
    expect(readCart()).toEqual({ a: 99, f: 4 })
  })

  it('never puts the stored text or an id in the warning', () => {
    // catches: a log that leaks stored content
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.localStorage.setItem(CART_STORAGE_KEY, 'secret-garbage')
    readCart()
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-garbage')
  })
})
