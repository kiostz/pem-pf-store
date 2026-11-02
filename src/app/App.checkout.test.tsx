// Tests for the checkout path across the whole app: unavailable lines taken out in one write, the details page on reload, Forward and a double press, and an order that only ever lists orderable lines even after a dropped connection; these are the paths where a wrong order could be sent.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react' // render and query the page
import { afterEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import { CART_STORAGE_KEY } from '@/features/cart/cart-storage.ts' // the stored cart's key
import { SENT_ORDER_STORAGE_KEY } from '@/features/order/sent-order-storage.ts' // the stored sent order's key
import { honor, shopFetch } from '@/test/shop-fetch.ts' // the honor builder and the /shop fake
import { App } from './App.tsx' // code under test

// The real captcha loads hCaptcha's script, which a test must not do; this stand-in ticks on demand.
vi.mock('@/features/order/Captcha.tsx', () => ({
  Captcha: ({ onToken }: { onToken: (token: string | null) => void }) => (
    <button type="button" onClick={() => onToken('token-1')}>
      Tick captcha
    </button>
  ),
}))

afterEach(() => {
  window.sessionStorage.clear() // no sent order left
  vi.unstubAllGlobals() // restore fetch
  vi.restoreAllMocks() // spies off
  window.location.hash = '' // back to the catalogue address
})

/**
 * Serves the shop (Knot Tying listed, Africa Lore not) and answers Web3Forms with the given function.
 * @param web3forms what Web3Forms does on each call
 * @return the fetch stub, to read the Web3Forms calls
 */
function serve(web3forms: () => Promise<Response>) {
  const fetchFn = shopFetch([honor('knot-tying', 'Knot Tying')], [], (url) => (url.includes('web3forms') ? web3forms() : undefined)) // Web3Forms answers as told, the shop as the shop
  vi.stubGlobal('fetch', fetchFn)
  return fetchFn
}

/** Saves a cart holding an orderable line and two the shop does not list. */
function saveMixedCart() {
  window.localStorage.setItem(
    CART_STORAGE_KEY,
    '{"version":1,"quantities":{"knot-tying":2,"africa-lore":1,"no-such-honor":3}}',
  ) // 2 orderable, 4 not
}

/** Fills the details form validly and ticks the stand-in captcha. */
function fillAndTick() {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jo Tan' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jc@mail.com' } })
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '0312345678' } })
  fireEvent.change(screen.getByLabelText('Club name'), { target: { value: 'Hilltop Club' } })
  fireEvent.click(screen.getByRole('button', { name: 'Tick captcha' }))
}

/**
 * Reads the text body of a Web3Forms call.
 * @param fetchFn the fetch stub
 * @return the message text of every Web3Forms call
 */
function sentMessages(fetchFn: ReturnType<typeof serve>): string[] {
  const calls = fetchFn.mock.calls as unknown as Array<[string, RequestInit]> // url and init of each call
  return calls
    .filter(([url]) => url.includes('web3forms')) // Web3Forms only
    .map(([, init]) => (JSON.parse(init.body as string) as { message: string }).message) // one per send
}

describe('App checkout path', () => {
  it('after a dropped connection keeps only the orderable line, and the retry sends and shows only it', async () => {
    // catches: a failed send that brings an unavailable line back, or a retry that lists one in the email or on the confirmation
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let call = 0 // Web3Forms calls so far
    const fetchFn = serve(async () => {
      call += 1 // this call
      if (call === 1) throw new TypeError('Failed to fetch') // the network drops mid-send
      return new Response(JSON.stringify({ success: true }))
    })
    saveMixedCart()
    window.location.hash = '#/cart'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Checkout' }))
    await screen.findByRole('heading', { name: 'Your details' })
    fillAndTick()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Your order was not sent')
    expect(window.location.hash).toBe('#/details') // still here, not on the confirmation
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe('{"version":1,"quantities":{"knot-tying":2}}') // the cart is kept, without the unavailable lines
    fireEvent.click(screen.getByRole('button', { name: 'Tick captcha' })) // the token was spent
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    })
    expect(await screen.findByRole('heading', { name: 'Order sent' })).toBeInTheDocument()
    const messages = sentMessages(fetchFn)
    expect(messages).toHaveLength(2) // the drop and the retry
    for (const message of messages) {
      expect(message).toContain('Knot Tying')
      expect(message).not.toContain('Africa Lore')
      expect(message).not.toContain('no-such-honor')
    }
    const confirmation = screen.getByRole('main') // the confirmation page
    expect(within(confirmation).queryByText(/Africa Lore/)).not.toBeInTheDocument()
    expect(window.sessionStorage.getItem(SENT_ORDER_STORAGE_KEY) ?? '').not.toMatch(/africa-lore|no-such-honor/) // the kept order lists no unavailable line
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe('{"version":1,"quantities":{}}')
  })

  it('freezes the header Back while an order sends, and frees it after a failed send', async () => {
    // catches: leaving the details page mid-send through the header, which the old in-page link froze
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let finish: (response: Response) => void = () => {} // answers the pending send
    serve(() => new Promise<Response>((resolve) => (finish = resolve))) // never answers until told
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":1}}') // one orderable line
    window.location.hash = '#/details'
    render(<App />)
    await screen.findByRole('heading', { name: 'Your details' })
    fillAndTick()
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Back' }).closest('[inert]')).not.toBeNull()
    await act(async () => finish(new Response('{}', { status: 500 }))) // the send fails
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Back' }).closest('[inert]')).toBeNull()
  })

  it('keeps the form and the orderable line when #/details is reloaded after Checkout', async () => {
    // catches: a reload on the details page that bounces a valid cart to the cart, or brings an unavailable line back
    serve(async () => new Response(JSON.stringify({ success: true })))
    saveMixedCart()
    window.location.hash = '#/cart'
    const first = render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Checkout' }))
    await screen.findByRole('heading', { name: 'Your details' })
    first.unmount() // the reload: the page's memory goes, storage stays
    render(<App />)
    expect(await screen.findByLabelText('Name')).toBeInTheDocument()
    expect(window.location.hash).toBe('#/details')
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe('{"version":1,"quantities":{"knot-tying":2}}')
  })

  it('keeps every unavailable line when the cart is reloaded, until Checkout', async () => {
    // catches: lines taken out on load, so a reload mid-cart silently drops what the buyer should see
    serve(async () => new Response(JSON.stringify({ success: true })))
    saveMixedCart()
    window.location.hash = '#/cart'
    const first = render(<App />)
    expect(await screen.findByText('2 items are no longer available')).toBeInTheDocument()
    first.unmount() // reload
    render(<App />)
    expect(await screen.findByText('2 items are no longer available')).toBeInTheDocument()
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe(
      '{"version":1,"quantities":{"knot-tying":2,"africa-lore":1,"no-such-honor":3}}',
    ) // nothing was written
  })

  it('pushes one history entry for a double click on Checkout, so one Back returns to the cart', async () => {
    // catches: two history entries, so Back from the details page lands on a bounce instead of the cart
    serve(async () => new Response(JSON.stringify({ success: true })))
    saveMixedCart()
    window.location.hash = '#/cart'
    render(<App />)
    const checkout = await screen.findByRole('button', { name: 'Checkout' })
    const before = window.history.length // entries before the click
    fireEvent.click(checkout)
    fireEvent.click(checkout) // the second tap of a double tap
    await screen.findByRole('heading', { name: 'Your details' })
    expect(window.history.length).toBe(before + 1)
    act(() => window.history.back()) // one Back
    expect(await screen.findByRole('heading', { name: 'Your cart' })).toBeInTheDocument()
  })

  it('shows the form again on Forward into #/details while the cart still has an orderable line', async () => {
    // catches: a Forward into the details page that finds no form
    serve(async () => new Response(JSON.stringify({ success: true })))
    saveMixedCart()
    window.location.hash = '#/cart'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Checkout' }))
    await screen.findByRole('heading', { name: 'Your details' })
    act(() => window.history.back()) // to the cart
    await screen.findByRole('heading', { name: 'Your cart' })
    act(() => window.history.forward()) // and Forward again
    expect(await screen.findByLabelText('Name')).toBeInTheDocument()
  })

  it('sends Forward into #/details back to the cart once the last line was removed', async () => {
    // catches: Forward opening an order form over an empty cart, which could send an empty order
    serve(async () => new Response(JSON.stringify({ success: true })))
    saveMixedCart()
    window.location.hash = '#/cart'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Checkout' }))
    await screen.findByRole('heading', { name: 'Your details' })
    act(() => window.history.back()) // to the cart
    await screen.findByRole('heading', { name: 'Your cart' })
    fireEvent.click(screen.getByRole('button', { name: 'One fewer Knot Tying' })) // 2 down to 1, where the trash shows
    fireEvent.click(screen.getByRole('button', { name: 'Remove Knot Tying' }), { detail: 1 }) // the last line goes
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument()
    act(() => window.history.forward()) // Forward into the details page
    await waitFor(() => expect(window.location.hash).toBe('#/cart')) // bounced
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
  })

  it('shows the same count and total in the cart pill, after a reload, as on the Send order button once Checkout takes the unavailable lines out', async () => {
    // catches: a pill whose count or total includes an unavailable line, or a Send order total that disagrees with the pill
    serve(async () => new Response(JSON.stringify({ success: true })))
    saveMixedCart() // 2 orderable at RM 4.00, 4 unavailable
    window.location.hash = '#/cart'
    const first = render(<App />)
    await screen.findByText('2 items are no longer available')
    first.unmount() // the reload mid-cart
    render(<App />)
    await screen.findByText('2 items are no longer available')
    const pill = screen.getByRole('button', { name: 'Checkout' }).parentElement as HTMLElement // the pill's text and button
    expect(pill).toHaveTextContent('Estimated total · 2 items') // only the orderable count
    expect(pill).toHaveTextContent('RM 8.00') // only the orderable total
    fireEvent.click(screen.getByRole('button', { name: 'Checkout' }))
    expect(await screen.findByRole('button', { name: 'Send order RM 8.00' })).toBeInTheDocument() // the same total
  })
})
