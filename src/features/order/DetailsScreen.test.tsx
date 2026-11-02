// Tests for the details page: the order form with only orderable lines, the way back to the cart when something unavailable is left, and the order the buyer's Checkout actually sends.

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react' // render and query
import { afterEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import { useHashRoute } from '@/app/use-hash-route.ts' // which screen the address names
import { CART_STORAGE_KEY } from '@/features/cart/cart-storage.ts' // where the cart is kept
import { CartProvider } from '@/features/cart/CartProvider.tsx' // the cart state
import { CartScreen } from '@/features/cart/CartScreen.tsx' // Checkout lives here
import type { CatalogueLoad } from '@/features/catalogue/use-catalogue-data.ts' // the load the screen receives
import type { Honor } from '@/shared/data/types.ts' // the shape of an honor
import { honor } from '@/test/shop-fetch.ts' // the honor builder
import { PILL_DOCK } from '@/shared/ui/floating-pill-box.ts' // the dock Send order floats in
import { DetailsScreen } from './DetailsScreen.tsx' // code under test
import { OrderFormProvider } from './OrderFormProvider.tsx' // the form state

// The real captcha loads hCaptcha's script, which a test must not do; this stand-in ticks on demand.
vi.mock('@/features/order/Captcha.tsx', () => ({
  Captcha: ({ onToken }: { onToken: (token: string | null) => void }) => (
    <button type="button" onClick={() => onToken('token-1')}>
      Tick captcha
    </button>
  ),
}))

const honors: Honor[] = [honor('knot-tying', 'Knot Tying')] // Knot Tying listed; africa-lore is not, like a Hidden honor

const ready: CatalogueLoad = {
  state: { status: 'ready', honors, settings: { currency: 'MYR' }, clubs: [] },
  showSkeleton: false,
  retry: () => {},
} // the load as the app hands it over

afterEach(() => {
  vi.unstubAllGlobals() // fetch back
  window.location.hash = '' // back to the catalogue address
})

/**
 * Stores a cart and renders the details page over it, with the address set to the details page.
 * @param quantities honor id to quantity
 */
function renderDetails(quantities: Record<string, number>) {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ version: 1, quantities })) // the saved cart
  window.location.hash = '#/details' // as a buyer arrives
  render(
    <CartProvider honors={honors}>
      <OrderFormProvider>
        <DetailsScreen data={ready} />
      </OrderFormProvider>
    </CartProvider>,
  )
}

/** Fills the form and ticks the stand-in captcha. */
function fillForm() {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jo Tan' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jc@mail.com' } })
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '0312345678' } })
  fireEvent.change(screen.getByLabelText('Club name'), { target: { value: 'Hilltop Club' } })
  fireEvent.click(screen.getByRole('button', { name: 'Tick captcha' }))
}

describe('DetailsScreen', () => {
  it('shows its heading and the order form, with no quiet Back to cart link of its own', () => {
    // catches: a details page without its form, or a second way back beside the header's < button
    renderDetails({ 'knot-tying': 1 })
    expect(screen.getByRole('heading', { name: 'Your details' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Send order/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back to cart' })).not.toBeInTheDocument()
  })

  it('goes to the cart when the cart has no orderable line', () => {
    // catches: a typed #/details address opening a form with nothing to order
    renderDetails({})
    expect(window.location.hash).toBe('#/cart')
  })

  it('goes to the cart when an unavailable line is still in it', () => {
    // catches: a reload or typed address carrying an unavailable line into an order
    renderDetails({ 'knot-tying': 1, 'africa-lore': 2 })
    expect(window.location.hash).toBe('#/cart')
  })

  it('goes to the cart for a gone honor as well', () => {
    // catches: an id missing from the data counted as orderable
    renderDetails({ 'knot-tying': 1, 'no-such-honor': 2 })
    expect(window.location.hash).toBe('#/cart')
  })

  it('stays on #/details while honors are loading', () => {
    // catches: a redirect before the data is known, which would send every reload to the cart
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":1}}')
    window.location.hash = '#/details'
    render(
      <CartProvider honors={null}>
        <OrderFormProvider>
          <DetailsScreen data={{ state: { status: 'loading' }, showSkeleton: false, retry: () => {} }} />
        </OrderFormProvider>
      </CartProvider>,
    )
    expect(window.location.hash).toBe('#/details')
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  })

  it('leaves for the cart and drops the form when the last orderable honor leaves the shop while the page is open', () => {
    // catches: a form left open over a cart that can no longer be ordered, so a buyer could send a wrong order
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":1}}') // one orderable line
    window.location.hash = '#/details' // as a buyer arrives
    /**
     * Builds the page over the given honors.
     * @param list the honors the data holds
     * @return the page
     */
    const page = (list: Honor[]) => (
      <CartProvider honors={list}>
        <OrderFormProvider>
          <DetailsScreen data={{ ...ready, state: { ...ready.state, honors: list } as typeof ready.state }} />
        </OrderFormProvider>
      </CartProvider>
    ) // the page for one data load
    const { rerender } = render(page(honors))
    expect(screen.getByLabelText('Name')).toBeInTheDocument() // the form is open
    rerender(page([])) // the data no longer lists Knot Tying
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(window.location.hash).toBe('#/cart')
  })

  it('shows no form and does not redirect when the data failed to load', () => {
    // catches: a form shown with no honors to check against, or a reload with the network down bouncing the buyer
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":1}}')
    window.location.hash = '#/details'
    render(
      <CartProvider honors={null}>
        <OrderFormProvider>
          <DetailsScreen data={{ state: { status: 'error', reason: 'failed' }, showSkeleton: false, retry: () => {} }} />
        </OrderFormProvider>
      </CartProvider>,
    )
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/details')
  })

  it('sends only the orderable lines after Checkout with an unlisted honor in the cart', async () => {
    // catches: a wrong order that lists an unlisted honor
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ success: true }))) // Web3Forms
    vi.stubGlobal('fetch', fetchFn)
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":2,"africa-lore":3}}')
    window.location.hash = '#/cart'
    /** @return the cart or the details page, as the address says */
    const Flow = () => {
      const route = useHashRoute() // the screen for the address
      return route === 'details' ? <DetailsScreen data={ready} /> : <CartScreen data={ready} onBack={() => {}} />
    }
    render(
      <CartProvider honors={honors}>
        <OrderFormProvider>
          <Flow />
        </OrderFormProvider>
      </CartProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Checkout' }))
    await screen.findByRole('heading', { name: 'Your details' })
    fillForm()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as {
      message: string
    }
    expect(body.message).toContain('Knot Tying')
    expect(body.message).not.toContain('Africa Lore')
    expect(body.message).not.toContain('no-such-honor')
  })

  it('is inert and busy while an order is sending, then free', async () => {
    // catches: a form that can be edited mid-send, so the sent order differs from what the buyer sees
    let finish: (response: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))),
    ) // never answers until told
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderDetails({ 'knot-tying': 1 })
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    expect(screen.getByLabelText('Name').closest('[inert]')).not.toBeNull()
    expect(screen.getByLabelText('Name').closest('[aria-busy="true"]')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Your details' }).closest('[inert]')).not.toBeNull()
    await act(async () => finish(new Response('{}', { status: 500 }))) // the send fails
    expect(screen.getByLabelText('Name').closest('[inert]')).toBeNull()
  })
})

describe('DetailsScreen pill', () => {
  it('names Send order with the total of a 6 x RM 4.00 cart, inside the form and a dock', () => {
    // catches: a name that drops the total, or Send leaving the form or the dock
    renderDetails({ 'knot-tying': 6 })
    const send = screen.getByRole('button', { name: 'Send order RM 24.00' })
    expect(send.closest('form')).not.toBeNull()
    const names = PILL_DOCK.split(' ')
    let dock: Element | null = send.parentElement
    while (dock && !names.every((name) => dock?.classList.contains(name))) dock = dock.parentElement
    expect(dock).not.toBeNull()
  })

  it('keeps the bottom padding that clears the line, the gap and the pill', () => {
    // catches: the end of the form hidden behind the floating pill
    renderDetails({ 'knot-tying': 1 })
    expect(screen.getByRole('heading', { name: 'Your details' }).parentElement).toHaveClass('pb-24')
  })
})

describe('DetailsScreen failure note padding', () => {
  it('grows the bottom padding while the failure note shows, and returns it when it is dismissed', async () => {
    // catches: the failure note covering the line that says what is missing, with focus landing under it
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 }))) // the send fails
    renderDetails({ 'knot-tying': 6 })
    const column = screen.getByRole('heading', { name: 'Your details' }).parentElement
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    await screen.findByRole('alert')
    expect(column).toHaveClass('pb-60')
    expect(column).not.toHaveClass('pb-24')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(column).toHaveClass('pb-24'))
  })
})

describe('DetailsScreen while sending', () => {
  it('keeps Send order focused and outside the inert area, and says "Sending…" in a polite live region', async () => {
    // catches: focus dropping to the page and nothing announced when the whole dock goes inert
    let finish: (response: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))),
    ) // never answers until told
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderDetails({ 'knot-tying': 1 })
    fillForm()
    const live = document.querySelector('[aria-live="polite"]') // mounted before the send, so the first announcement is heard
    expect(live).not.toBeNull()
    expect(live).toHaveTextContent('')
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    const send = screen.getByRole('button', { name: 'Sending…' })
    expect(send.closest('[inert]')).toBeNull()
    expect(send).toHaveFocus()
    expect(send).toHaveAttribute('aria-disabled', 'true')
    expect(live).toHaveTextContent('Sending…')
    expect(live?.closest('[aria-busy="true"]')).toBeNull() // a busy ancestor can hold back the announcement
    expect(screen.getByLabelText('Name').closest('[aria-busy="true"]')).not.toBeNull() // the fields are the busy part
    expect(screen.getByLabelText('Name').closest('[inert]')).not.toBeNull() // everything else still waits
    await act(async () => finish(new Response('{}', { status: 500 }))) // the send fails
    expect(live).toHaveTextContent('')
    expect(screen.getByRole('button', { name: /^Send order/ })).toHaveFocus() // focus back on Send after a failure
  })

  it('sends once when Send order is pressed again while sending', async () => {
    // catches: a Send that stays pressable while sending, once it is outside the inert area
    const fetchFn = vi.fn(() => new Promise<Response>(() => {})) // never answers
    vi.stubGlobal('fetch', fetchFn)
    renderDetails({ 'knot-tying': 1 })
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Sending…' }))
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})
