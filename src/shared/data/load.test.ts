// Tests for loadShop: the one /shop request, its validation and its error kinds, with fetch mocked at the boundary.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API and mock helper
import { lineTotalCents } from '@/features/cart/cart.ts' // proves the mapped price keeps exact cents
import { loadShop, ShopLoadError } from './load.ts' // code under test

const orderable = { id: 'knot-tying', name: 'Knot Tying', category: 'Recreation', priceCents: 400, stock: 12, image: null } // a valid shop row
const eagles = { name: 'Eagles', area: null, language: null, location: null, churchName: null } // a valid club
const gilead = { name: 'Gilead', area: 'Klang', language: 'BM', location: 'Hall', churchName: 'Klang BM SDA Church' } // every field set
const good = { items: [orderable], clubs: [eagles, gilead], settings: { currency: 'MYR' } } // a valid /shop body

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', '/api') // the dev address, so the URL is a literal
})

afterEach(() => {
  vi.unstubAllEnvs() // restore the environment
})

/**
 * Builds a fake fetch that answers every request with one response.
 * @param body the JSON body to answer with
 * @param status the HTTP status to answer with
 * @return a vi.fn standing in for fetch
 */
function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) // one canned response
}

/**
 * Runs loadShop and returns the kind of the error it throws.
 * @param fetchFn the fetch to use
 * @return the ShopLoadError kind, or "none" when it resolved
 */
async function failureKind(fetchFn: typeof fetch) {
  try {
    await loadShop(fetchFn) // should throw
    return 'none' // it did not
  } catch (error) {
    return error instanceof ShopLoadError ? error.kind : 'wrong error class' // a raw error would reach the screen unclassified
  }
}

describe('loadShop', () => {
  it('requests /shop under VITE_API_URL', async () => {
    // catches: a wrong path, a doubled slash or a request to the old data files
    const fetchFn = fakeFetch(good)
    await loadShop(fetchFn)
    expect(fetchFn).toHaveBeenCalledWith('/api/shop', { signal: undefined })
  })

  it('passes the abort signal on to fetch', async () => {
    // catches: the 30 s cap aborting nothing
    const fetchFn = fakeFetch(good)
    const controller = new AbortController() // the caller's cap
    await loadShop(fetchFn, controller.signal)
    expect(fetchFn).toHaveBeenCalledWith('/api/shop', { signal: controller.signal })
  })

  it('returns items, clubs and settings', async () => { // the answer holds items
    // catches: a field dropped or renamed on the way to the screens
    const loaded = await loadShop(fakeFetch(good))
    expect(loaded).toEqual({
      items: [{ id: 'knot-tying', name: 'Knot Tying', category: 'Recreation', price: 4, stock: 12, image: null }], // one item on the wire
      clubs: [eagles, gilead],
      settings: { currency: 'MYR' },
    })
  })

  it('turns priceCents into a price whose line total is exactly 115 cents', async () => {
    // catches: a float price that loses a cent once it is multiplied back into cents
    const loaded = await loadShop(fakeFetch({ ...good, items: [{ ...orderable, priceCents: 115 }] }))
    expect(loaded.items[0].price).toBe(1.15) // the price in main units
    expect(lineTotalCents({ item: loaded.items[0], quantity: 1 })).toBe(115) // the order line total from the loaded item
  })

  it('accepts stock 0, a picture path, empty lists and ignores extra keys', async () => {
    // catches: stock 0 or an empty shop treated as broken, or a later Worker field blanking the shop
    const loaded = await loadShop(
      fakeFetch({
        items: [{ ...orderable, stock: 0, image: 'items/knot-tying.webp', status: 'active' }],
        clubs: [],
        settings: { currency: 'MYR', defaultPrice: 400 },
      }),
    )
    expect(loaded.items[0]).toEqual({ id: 'knot-tying', name: 'Knot Tying', category: 'Recreation', price: 4, stock: 0, image: 'items/knot-tying.webp' }) // the loaded item with its picture key
    expect(loaded.settings).toEqual({ currency: 'MYR' })
  })

  it('keeps R2 picture keys and turns anything else into no picture without failing the load', async () => {
    // catches: a stale patches/ path, a URL or a crafted key reaching an img src, or a bad key blanking the shop
    const keys = ['items/knot-tying.webp', 'items/camp-shirt-0a1b2c3d.png'] // valid
    const bad = ['patches/knot-tying.webp', 'https://x.test/a.webp', 'items/../a.webp', 'items/A.webp', 'items/a.gif', 'items/'] // invalid
    const loaded = await loadShop(
      fakeFetch({ items: [...keys, ...bad, null].map((image, n) => ({ ...orderable, id: `row-${n}`, image })), clubs: [], settings: { currency: 'MYR' } }),
    )
    expect(loaded.items.map((item) => item.image)).toEqual([...keys, ...bad.map(() => null), null]) // each item's picture key, null when bad
  })

  it('is failed for an image that is not a string', async () => {
    // catches: a number or object in image slipping through the key check
    await expect(loadShop(fakeFetch({ ...good, items: [{ ...orderable, image: 5 }] }))).rejects.toBeInstanceOf(ShopLoadError)
  })

  it.each([
    ['stock -1', { ...good, items: [{ ...orderable, stock: -1 }] }],
    ['stock 1.5', { ...good, items: [{ ...orderable, stock: 1.5 }] }],
    ['stock "3"', { ...good, items: [{ ...orderable, stock: '3' }] }],
    ['a missing stock', { ...good, items: [{ ...orderable, stock: undefined }] }],
    ['a fractional priceCents', { ...good, items: [{ ...orderable, priceCents: 1.5 }] }],
    ['a negative priceCents', { ...good, items: [{ ...orderable, priceCents: -1 }] }],
    ['an empty name', { ...good, items: [{ ...orderable, name: '' }] }],
    ['an empty id', { ...good, items: [{ ...orderable, id: '' }] }],
    ['an empty image string', { ...good, items: [{ ...orderable, image: '' }] }],
    ['a missing items list', { clubs: [], settings: { currency: 'MYR' } }],
    ['a missing clubs list', { items: [], settings: { currency: 'MYR' } }],
    ['missing settings', { items: [], clubs: [] }],
    ['a lower-case currency', { ...good, settings: { currency: 'myr' } }],
    ['a four-letter currency', { ...good, settings: { currency: 'MYRR' } }],
    ['a club with a missing key', { ...good, clubs: [{ name: 'Eagles', area: null, language: null, location: null }] }],
    ['a club with an empty name', { ...good, clubs: [{ ...eagles, name: '' }] }],
    ['a repeated club', { ...good, clubs: [eagles, eagles] }],
    ['a row that is not an object', { ...good, items: ['knot-tying'] }],
    ['a body that is a list', []],
    ['a null body', null],
  ])('is failed for %s', async (_label, body) => {
    // catches: a bad row reaching a screen instead of blanking the shop
    expect(await failureKind(fakeFetch(body))).toBe('failed')
  })

  it('is failed for an HTML body and for non-JSON', async () => {
    // catches: an HTML error page with status 200 read as data, or a raw SyntaxError reaching the screen
    expect(await failureKind(vi.fn(async () => new Response('<html>oops</html>')))).toBe('failed')
    expect(await failureKind(vi.fn(async () => new Response('not json at all')))).toBe('failed')
  })

  it('is busy on a 429', async () => {
    // catches: the rate limit shown as a plain failure, so the buyer is not told to wait
    expect(await failureKind(fakeFetch({ error: 'rate-limited' }, 429))).toBe('busy')
  })

  it.each([404, 500])('is failed on a %s', async (status) => {
    // catches: an error status read as data
    expect(await failureKind(fakeFetch({}, status))).toBe('failed')
  })

  it('is failed on a network error and on an abort', async () => {
    // catches: a raw TypeError or AbortError reaching the hook unclassified
    expect(await failureKind(vi.fn(async () => { throw new TypeError('Failed to fetch') }))).toBe('failed')
    expect(await failureKind(vi.fn(async () => { throw new DOMException('aborted', 'AbortError') }))).toBe('failed')
  })
})
