// Guard test: no buyer-visible text or accessible name on any buyer screen may name honors, because the shop's buyer word is "items".

import { act, fireEvent, render, screen } from '@testing-library/react' // render and wait for the page
import { afterEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import { CART_STORAGE_KEY } from '@/features/cart/cart-storage.ts' // the stored cart's key
import { writeSentOrder } from '@/features/order/sent-order-storage.ts' // fills the stored order
import { honor, shopFetch } from '@/test/shop-fetch.ts' // the honor builder and the /shop fake
import { App } from './App.tsx' // code under test

// The real captcha loads Turnstile's script, which a test must not do.
vi.mock('@/features/order/Captcha.tsx', () => ({
  Captcha: ({ onToken }: { onToken: (token: string | null) => void }) => (
    <button type="button" onClick={() => onToken('token-1')}>
      Solve captcha
    </button>
  ),
}))

afterEach(() => {
  vi.restoreAllMocks() // the console spy must not leak
  window.sessionStorage.clear() // no sent order left
  vi.unstubAllGlobals() // restore fetch
  window.location.hash = '' // back to the catalogue address
})

/**
 * Makes the global fetch answer with two items whose names avoid the word, and the settings.
 * @param fails true makes the request fail, to show the load error
 */
function serveData(fails: boolean) {
  vi.stubGlobal(
    'fetch',
    fails
      ? vi.fn(async () => new Response('', { status: 500 })) // the request fails
      : shopFetch([honor('knot-tying', 'Knot Tying'), honor('ants', 'Ants')]), // the shop answers
  ) // the one request
}

/**
 * Collects every phrase a buyer or a screen reader meets on the page now.
 * @return the page text plus every aria-label, placeholder, title, alt text and the document title
 */
function buyerPhrases(): string {
  const attributes = Array.from(document.querySelectorAll('[aria-label],[placeholder],[title],[alt]')).flatMap(
    (element) => ['aria-label', 'placeholder', 'title', 'alt'].map((name) => element.getAttribute(name) ?? ''),
  ) // the named attributes
  return [document.body.textContent ?? '', document.title, ...attributes].join('\n') // all in one block
}

describe('buyer copy', () => {
  it.each([
    ['Home', '#/', 'How ordering works'],
    ['the shop', '#/shop', 'Knot Tying'],
    ['the cart', '#/cart', 'Your cart'],
    ['the details', '#/details', 'Your details'],
    ['the confirmation', '#/order-sent', 'Order sent'],
  ])('never names honors on %s', async (_name, hash, ready) => {
    // catches: a string such as "Search honors" or an aria-label "Add honor" coming back after the ruling
    serveData(false) // two items
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":1}}') // an orderable line
    writeSentOrder({
      number: 'PF-20261028-4K7Q',
      sentAt: '2026-10-28T10:00:00.000Z',
      currency: 'MYR',
      lines: [{ honorId: 'knot-tying', name: 'Knot Tying', quantity: 2, priceCents: 400 }],
      totalCents: 800,
      contact: { name: 'J. Cruz', email: 'jc@mail.com', phone: '+60 12-345 6789' },
      club: { subject: 'Eagles', email: 'Eagles' },
      changesNotSent: false,
    }) // so the confirmation has an order and one order line to show
    window.location.hash = hash // opened by address
    render(<App />)
    await screen.findAllByText(ready) // the screen has loaded
    if (hash === '#/' || hash === '#/shop') await screen.findByRole('link', { name: 'Cart, 1 item, estimated total RM 4.00' }) // the grown Cart tab is in the page too
    expect(buyerPhrases()).not.toMatch(/honor|\btick/i)
  })

  it('never names honors in the load error on Home', async () => {
    // catches: the failed-load message on Home naming honors
    serveData(true) // every file fails
    vi.spyOn(console, 'error').mockImplementation(() => {}) // the app logs the failure
    window.location.hash = '#/' // Home
    render(<App />)
    await screen.findAllByText(/couldn't load/) // the error shows in the tile row (and in the hidden shop)
    expect(buyerPhrases()).not.toMatch(/honor/i)
  })

  it('never names honors in the load error', async () => {
    // catches: the failed-load message naming honors
    serveData(true) // every file fails
    vi.spyOn(console, 'error').mockImplementation(() => {}) // the app logs the failure; keep the output clean
    window.location.hash = '#/shop' // the shop
    render(<App />)
    await screen.findByText(/couldn't load/) // the error shows
    expect(buyerPhrases()).not.toMatch(/honor/i)
  })

  it('never names honors on Sold out cards, over-stock cart lines, the loading skeletons or the busy message', async () => {
    // catches: "Sold out", "Only 2 left", "Loading the shop" or the busy words drifting into "honor" wording
    vi.spyOn(console, 'error').mockImplementation(() => {}) // a refused load is logged
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":5,"ants":1}}') // above the stock, and Sold out
    vi.stubGlobal('fetch', shopFetch([honor('knot-tying', 'Knot Tying', { stock: 2 }), honor('ants', 'Ants', { stock: 0 })])) // the shop answers
    window.location.hash = '#/cart'
    const ready = render(<App />)
    await screen.findByText('Only 2 left') // the red mark
    expect(screen.getAllByText('Sold out').length).toBeGreaterThan(0)
    expect(buyerPhrases()).not.toMatch(/honor/i)
    ready.unmount()
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))) // never answers
    vi.useFakeTimers({ shouldAdvanceTime: true }) // the 300 ms delay
    const loading = render(<App />)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getAllByText('Loading the shop').length).toBeGreaterThan(0)
    expect(buyerPhrases()).not.toMatch(/honor/i)
    loading.unmount()
    vi.useRealTimers()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 }))) // refused
    render(<App />)
    await screen.findAllByText('The shop is busy right now. Try again in a minute.')
    expect(buyerPhrases()).not.toMatch(/honor/i)
  })
  it('never names honors or ticks in the refusal note, the failure note or the missing line', async () => {
    // catches: "honor" or "tick" creeping into the refusal and failure copy
    vi.spyOn(console, 'error').mockImplementation(() => {}) // the refused send is logged
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":3}}') // above the stock once refused
    vi.stubGlobal(
      'fetch',
      shopFetch([honor('knot-tying', 'Knot Tying')], [], (url) =>
        url.endsWith('/orders')
          ? new Response(JSON.stringify({ error: 'stock', lines: [{ honorId: 'knot-tying', stock: 1 }] }), { status: 409 })
          : undefined,
      ),
    ) // every send is refused
    window.location.hash = '#/cart'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Checkout' }))
    await screen.findByRole('heading', { name: 'Your details' })
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ })) // empty form: the missing line shows
    expect(buyerPhrases()).not.toMatch(/honor|\btick/i)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jo Tan' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jc@mail.com' } })
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '0312345678' } })
    fireEvent.change(screen.getByLabelText('Club name'), { target: { value: 'Hilltop Club' } })
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    })
    await screen.findByText(/Some items changed while you were ordering/) // the refusal note on the cart
    expect(buyerPhrases()).not.toMatch(/honor|\btick/i)
  })
})
