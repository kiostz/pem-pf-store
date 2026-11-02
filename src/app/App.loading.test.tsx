// Tests for the shop's loading and failed-load states through App: the skeletons that wait 300 ms, the busy and failed copy with Try again on every screen that reads the shop, with fetch mocked at the boundary.

import { act, fireEvent, render, screen } from '@testing-library/react' // render and query the page
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import { CART_STORAGE_KEY } from '@/features/cart/cart-storage.ts' // the stored cart's key
import { App } from './App.tsx' // code under test

// The real captcha loads Turnstile's script, which a test must not do.
vi.mock('@/features/order/Captcha.tsx', () => ({
  Captcha: () => <div>Captcha</div>,
}))

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true }) // control the 300 ms loader delay, keep promises moving
  vi.spyOn(console, 'error').mockImplementation(() => {}) // a failed load is logged; keep the output clean
  window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":1}}') // a cart that is kept through every case
})

afterEach(() => {
  vi.useRealTimers() // restore the clock
  vi.unstubAllGlobals() // restore fetch
  vi.restoreAllMocks() // restore the console and the canvas
  window.location.hash = '' // back to the catalogue address
})

/** Makes the shop request hang, so the load never ends. */
function neverAnswer() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  ) // requests that never answer
}

/**
 * Finds the visible status region that says the shop is loading.
 * @return the region, or undefined when none is on screen (a region inside the hidden Shop does not count)
 */
function loadingRegion() {
  return screen.queryAllByRole('status').find((region) => region.textContent === 'Loading the shop' || region.textContent?.includes('Loading the shop'))
}

describe('loading skeletons', () => {
  it.each([
    ['Shop', '#/shop', 'catalogue-skeleton'],
    ['Cart', '#/cart', 'cart-skeleton-line'],
    ['Details', '#/details', 'details-skeleton'],
    ['Home', '#/', 'tile-skeleton'],
  ])('shows nothing on %s for 300 ms, then a skeleton in a status region, and no canvas context is asked for off Home', (name, hash, testId) => {
    // catches: a skeleton flash on a fast load, a skeleton no screen reader hears, or an emblem tracer used as a loader
    neverAnswer()
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext') // the emblem trace asks for one
    window.location.hash = hash // opened by address
    render(<App />)
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(loadingRegion()).toBeUndefined() // nothing yet
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(loadingRegion()).toBeDefined() // said to a screen reader
    expect(screen.getAllByTestId(testId).some((element) => element.closest('[hidden]') === null)).toBe(true) // the one on this screen is visible
    if (name !== 'Home') expect(getContext).not.toHaveBeenCalled() // only Home draws a canvas, and it is not a loader
  })

  it('gives the Shop skeleton cards a stock-line bar', () => {
    // catches: card skeletons that jump when the stock line arrives
    neverAnswer()
    window.location.hash = '#/shop'
    render(<App />)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(document.querySelectorAll('[data-testid="catalogue-skeleton-row"] [data-skeleton-part="stock"]')).toHaveLength(6)
  })

  it('shows no skeleton and no loading text once the shop has answered with a failure', async () => {
    // catches: a skeleton left over an error
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    window.location.hash = '#/cart'
    render(<App />)
    await screen.findAllByText("We couldn't load the shop. Check your connection and try again.") // the Cart's, and the hidden Shop's
    expect(screen.queryByTestId('cart-skeleton-line')).not.toBeInTheDocument()
    expect(loadingRegion()).toBeUndefined()
  })
})

describe('failed loads', () => {
  it.each([
    ['Shop', '#/shop'],
    ['Cart', '#/cart'],
    ['Details', '#/details'],
    ['Home', '#/'],
  ])('says the shop is busy on %s after a 429, with Try again, and keeps the cart', async (_name, hash) => {
    // catches: a rate-limited buyer told their connection is bad on one of the four screens, or a cart wiped by the failure
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"rate-limited"}', { status: 429 })))
    window.location.hash = hash
    render(<App />)
    expect((await screen.findAllByText('The shop is busy right now. Try again in a minute.')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe('{"version":1,"quantities":{"knot-tying":1}}')
  })

  it.each([
    ['Shop', '#/shop'],
    ['Cart', '#/cart'],
    ['Details', '#/details'],
    ['Home', '#/'],
  ])('says it could not load the shop on %s after a 500, with Try again that loads again', async (_name, hash) => {
    // catches: the failed copy missing on one screen, or Try again that does not retry
    const fetchFn = vi.fn(async () => new Response('', { status: 500 }))
    vi.stubGlobal('fetch', fetchFn)
    window.location.hash = hash
    render(<App />)
    await screen.findAllByText("We couldn't load the shop. Check your connection and try again.")
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(fetchFn.mock.calls.length).toBeGreaterThan(1)) // a second request went out
  })
})
