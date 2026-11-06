// Tests for App: the header and the catalogue under it, with fetch mocked at the boundary.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react' // render and query the page
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import { CART_STORAGE_KEY } from '@/features/cart/cart-storage.ts' // the stored cart's key
import { writeSentOrder } from '@/features/order/sent-order-storage.ts' // fills the stored order
import { item, shopFetch } from '@/test/shop-fetch.ts' // the item builder and the /shop fake
import { App } from './App.tsx' // code under test

// The real captcha loads Turnstile's script, which a test must not do; this stand-in ticks and expires on demand.
vi.mock('@/features/order/Captcha.tsx', () => ({
  Captcha: ({ onToken }: { onToken: (token: string | null) => void }) => (
    <div>
      <button type="button" onClick={() => onToken('token-1')}>
        Solve captcha
      </button>
      <button type="button" onClick={() => onToken(null)}>
        Expire captcha
      </button>
    </div>
  ),
}))

beforeEach(() => {
  window.location.hash = '#/shop' // most cases start on the shop, where the tab pill is
})

afterEach(() => {
  window.sessionStorage.clear() // no sent order left
  vi.unstubAllGlobals() // restore fetch
  vi.restoreAllMocks() // a spy left by a failed test must not leak into the next case
  window.location.hash = '' // back to the catalogue address
})

/** Makes the global fetch answer with two items at RM 4 and the settings. */
function serveTwoItems() {
  vi.stubGlobal(
    'fetch',
    shopFetch([item('knot-tying', 'Knot Tying'), item('ants', 'Ants')]), // the shop answers with these items
  ) // the shop answers
}

describe('App', () => {
  it('shows the header with the site name and the theme control, and the catalogue', async () => {
    // catches: the shell rendering without the catalogue, without its header, or without the theme control in it
    vi.stubGlobal(
      'fetch',
      shopFetch([item('knot-tying', 'Knot Tying')]), // the shop answers with these items
    ) // one item
    render(<App />)
    const header = screen.getByRole('banner') // the header band
    expect(within(header).getByRole('heading', { name: 'PEM Pathfinder Store' })).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: /^Theme:/ })).toBeInTheDocument()
    expect(await screen.findByText('Knot Tying')).toBeInTheDocument()
  })

  it.each([
    ['#/cart', 'Your cart'],
    ['#/details', 'Your details'],
  ])('shows Back, a small PEM Pathfinder Store and no theme control in the header of %s', async (hash, title) => {
    // catches: the theme control or the big name leaking onto inner screens, or a screen with no way back in the header
    serveTwoItems() // two items
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":1}}') // an orderable line, so the details page stays
    window.location.hash = hash // opened by address
    render(<App />)
    const header = screen.getByRole('banner') // the header band
    expect(within(header).getByRole('link', { name: 'Back' })).toBeInTheDocument()
    expect(within(header).getByText('PEM Pathfinder Store')).toBeInTheDocument()
    expect(within(header).queryByRole('button', { name: /^Theme:/ })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument() // the page title below it
    expect(screen.queryByRole('link', { name: 'Back to cart' })).not.toBeInTheDocument() // the quiet link is gone
  })

  it('has no Back button in the header of the catalogue', async () => {
    // catches: a Back button on the first screen, where there is nothing behind it
    serveTwoItems() // two items
    render(<App />)
    expect(within(screen.getByRole('banner')).queryByRole('link', { name: 'Back' })).not.toBeInTheDocument()
    await screen.findByText('Knot Tying') // let the load settle
  })

  it('keeps the header controls off paper and the band readable without its background', async () => {
    // catches: the Back button or theme control printed, or stone title text printed onto white paper
    serveTwoItems() // two items
    window.location.hash = '#/order-sent' // opened by address
    const sent = render(<App />)
    const sentBand = screen.getByRole('banner') // the inner-screen band
    const back = within(sentBand).getByRole('link', { name: 'Back' }) // the < button
    expect(back.closest('.print\\:hidden')).not.toBeNull()
    expect(sentBand).toHaveClass('print:bg-transparent', 'print:text-text-default')
    sent.unmount()
    window.location.hash = '#/shop' // the catalogue
    render(<App />)
    const theme = within(screen.getByRole('banner')).getByRole('button', { name: /^Theme:/ }) // the Theme control
    expect(theme.closest('.print\\:hidden')).not.toBeNull()
  })

  it('leads from Back on the confirmation to the catalogue', async () => {
    // catches: a confirmation whose header Back goes nowhere
    serveTwoItems() // two items
    window.location.hash = '#/order-sent' // opened by address
    render(<App />)
    fireEvent.click(within(screen.getByRole('banner')).getByRole('link', { name: 'Back' }))
    expect(await screen.findByRole('searchbox', { name: 'Search items' })).toBeInTheDocument()
  })

  it('grows the Cart tab when Add is pressed on a card', async () => {
    // catches: cards and the pill holding separate state, or a Cart tab that never grows
    vi.stubGlobal(
      'fetch',
      shopFetch([item('knot-tying', 'Knot Tying')]), // the shop answers with these items
    ) // one item at RM 4
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add Knot Tying' }))
    expect(screen.getByRole('link', { name: 'Cart, 1 item, estimated total RM 4.00' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'One more Knot Tying' })) // the stepper that replaced Add
    expect(screen.getByRole('link', { name: 'Cart, 2 items, estimated total RM 8.00' })).toBeInTheDocument()
  })

  it('shows a plain Cart tab when the load fails', async () => {
    // catches: a count or a crash in the pill over an error screen
    vi.spyOn(console, 'error').mockImplementation(() => {}) // the failed load is logged
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    ) // every file fails
    render(<App />)
    await screen.findByRole('button', { name: 'Try again' })
    expect(screen.getByRole('link', { name: 'Cart' })).toBeInTheDocument()
    vi.restoreAllMocks() // put console back
  })

  it('keeps the stored cart as it was after a failed load', async () => {
    // catches: a failed load clearing or rewriting the saved cart, so the buyer loses it
    vi.spyOn(console, 'error').mockImplementation(() => {}) // the failed load is logged
    const stored = '{"version":1,"quantities":{"knot-tying":2,"gone":1}}' // a saved cart
    window.localStorage.setItem(CART_STORAGE_KEY, stored)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 }))) // the shop fails
    render(<App />)
    await screen.findByRole('button', { name: 'Try again' })
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe(stored)
  })

  it('has no footer', async () => {
    // catches: a wiki credit footer coming back
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    ) // never answers; the shell alone is checked
    render(<App />)
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
  })

  it('opens the cart from the Cart tab with its heading focused and the title changed', async () => {
    // catches: a Cart tab that does not lead to the cart, focus left behind, or a stale tab title
    serveTwoItems() // the shop lists two items
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add Knot Tying' }))
    expect(document.title).toBe('Shop · PEM Pathfinder Store')
    fireEvent.click(screen.getByRole('link', { name: /^Cart, / }))
    const heading = await screen.findByRole('heading', { name: 'Your cart' })
    expect(heading).toHaveFocus()
    expect(document.title).toBe('Your cart · PEM Pathfinder Store')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument() // no pill on the cart screen
    expect(screen.getByText('Estimated total · 1 item')).toBeInTheDocument()
  })

  it('keeps a typed search in the hidden catalogue and focuses the Cart tab on return', async () => {
    // catches: a catalogue that is rebuilt on return and loses the search, or focus dropped on the page
    serveTwoItems() // the shop lists two items
    render(<App />)
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Search items' }), { target: { value: 'knot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Knot Tying' }))
    fireEvent.click(screen.getByRole('link', { name: /^Cart, / }))
    await screen.findByRole('heading', { name: 'Your cart' })
    fireEvent.click(screen.getByRole('link', { name: 'Back' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Your cart' })).not.toBeInTheDocument())
    expect(screen.getByRole('searchbox', { name: 'Search items' })).toHaveValue('knot')
    expect(screen.getByRole('link', { name: /^Cart, / })).toHaveFocus()
    expect(document.title).toBe('Shop · PEM Pathfinder Store')
  })

  it('hides the catalogue from readers while the cart shows', async () => {
    // catches: the catalogue staying in the accessibility tree under the cart
    serveTwoItems() // the shop lists two items
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add Knot Tying' }))
    fireEvent.click(screen.getByRole('link', { name: /^Cart, / }))
    await screen.findByRole('heading', { name: 'Your cart' })
    expect(screen.queryByRole('searchbox', { name: 'Search items' })).not.toBeInTheDocument()
  })

  it('goes home from a cart opened by address, and focuses main when the cart is empty', async () => {
    // catches: Browse more that does nothing without history, or focus lost with an empty cart
    serveTwoItems() // the shop lists two items
    window.location.hash = '#/cart' // opened by address, not from the catalogue
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Browse more' }))
    expect(await screen.findByRole('searchbox', { name: 'Search items' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/shop')
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('never calls history back from Browse more on a cart opened by address', async () => {
    // catches: Browse more calling history.back() for a cart the buyer reached by address, which leaves the site
    serveTwoItems() // the shop lists two items
    window.location.hash = '#/cart' // opened by address
    render(<App />)
    const back = vi.spyOn(window.history, 'back') // count history moves
    fireEvent.click(await screen.findByRole('button', { name: 'Browse more' }))
    expect(back).not.toHaveBeenCalled()
    expect(await screen.findByRole('searchbox', { name: 'Search items' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/shop')
    back.mockRestore() // put history back
  })

  it.each([
    ['Ctrl click', 'click', { ctrlKey: true }],
    ['Meta click', 'click', { metaKey: true }],
    ['Shift click', 'click', { shiftKey: true }],
    ['Alt click', 'click', { altKey: true }],
    ['middle auxclick', 'auxclick', { button: 1 }],
    ['click with button 1 (defensive: real browsers send auxclick for a middle button)', 'click', { button: 1 }],
  ])(
    'does not mark a cart entry after a %s on the Cart tab that opens another tab',
    async (_label, eventType, eventInit) => {
      // catches: a stale tab-click flag from this click marking a later address-opened cart, so Back leaves the store
      serveTwoItems() // two items
      window.location.hash = '#/cart' // opened by address
      render(<App />) // draw the app
      fireEvent.click(await screen.findByRole('link', { name: 'Back' })) // to the catalogue
      fireEvent.click(await screen.findByRole('button', { name: 'Add Knot Tying' })) // pick one
      const bar = screen.getByRole('link', { name: /^Cart, / }) // the Cart tab's link
      bar.addEventListener('click', (event) => event.preventDefault()) // a browser opens a new tab: this tab's address stays
      fireEvent(bar, new MouseEvent(eventType, { ...eventInit, bubbles: true, cancelable: true })) // the click under test
      act(() => window.history.back()) // the buyer presses the browser's Back: the address-opened cart
      await screen.findByRole('heading', { name: 'Your cart' }) // the cart shows
      const back = vi.spyOn(window.history, 'back') // count history moves
      fireEvent.click(screen.getByRole('link', { name: 'Back' })) // the link under test
      expect(back).not.toHaveBeenCalled() // went home instead
      expect(await screen.findByRole('searchbox', { name: 'Search items' })).toBeInTheDocument() // on the catalogue
      back.mockRestore() // put history back
    },
  )

  it('goes back in history from a cart opened by the Cart tab', async () => {
    // catches: Browse more pushing a new entry when the Cart tab opened the cart, so back and the link disagree
    serveTwoItems() // the shop lists two items
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add Knot Tying' }))
    fireEvent.click(screen.getByRole('link', { name: /^Cart, / }))
    await screen.findByRole('heading', { name: 'Your cart' })
    const back = vi.spyOn(window.history, 'back') // count history moves
    fireEvent.click(screen.getByRole('link', { name: 'Back' }))
    expect(back).toHaveBeenCalledTimes(1)
    await screen.findByRole('searchbox', { name: 'Search items' })
    back.mockRestore() // put history back
  })

  it('saves the catalogue scroll on leaving and restores it on return, and the cart opens at the top', async () => {
    // catches: a scroll listener left running on the cart (saving the clamped 0), or no restore on return
    serveTwoItems() // the shop lists two items
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) // jsdom does not scroll
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add Knot Tying' }))
    Object.defineProperty(window, 'scrollY', { value: 92, configurable: true })
    fireEvent.scroll(window) // the buyer scrolled to 92
    fireEvent.click(screen.getByRole('link', { name: /^Cart, / }))
    await screen.findByRole('heading', { name: 'Your cart' })
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0) // the cart opens at its top
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    fireEvent.scroll(window) // the hidden catalogue makes the browser clamp to 0; it must not be saved
    fireEvent.click(screen.getByRole('link', { name: 'Back' }))
    await screen.findByRole('searchbox', { name: 'Search items' })
    expect(scrollTo).toHaveBeenLastCalledWith(0, 92) // back where the buyer was
    delete (window as { scrollY?: number }).scrollY // jsdom's own again
    scrollTo.mockRestore() // put scrollTo back
  })

  it('keeps an unavailable line in the cart, and Checkout takes it out, opens the details page, and Back shows the cart without it', async () => {
    // catches: an unavailable line hidden on load, or one that stays in the cart that goes to the details page
    vi.stubGlobal(
      'fetch',
      shopFetch([item('knot-tying', 'Knot Tying')]), // the shop answers with these items
    ) // Africa Lore is not listed, like a Hidden item
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":1,"africa-lore":1}}') // a saved cart holding it
    window.location.hash = '#/cart' // opened by address
    render(<App />)
    expect(await screen.findByText('1 item is no longer available')).toBeInTheDocument()
    expect(screen.getByText('Item no longer in the shop')).toBeInTheDocument() // greyed, still there; the cart stores ids only, so its name is gone
    fireEvent.click(screen.getByRole('button', { name: 'Checkout' }))
    expect(await screen.findByRole('heading', { name: 'Your details' })).toHaveFocus()
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe('{"version":1,"quantities":{"knot-tying":1}}')
    fireEvent.click(screen.getByRole('link', { name: 'Back' }))
    await screen.findByRole('heading', { name: 'Your cart' })
    expect(screen.queryByText('Item no longer in the shop')).not.toBeInTheDocument()
    expect(screen.queryByText(/no longer available/)).not.toBeInTheDocument()
  })

  it('sends a typed #/details address with an unavailable line back to the cart', async () => {
    // catches: the details page opening by address with a line that cannot be ordered
    vi.stubGlobal(
      'fetch',
      shopFetch([item('knot-tying', 'Knot Tying')]), // the shop answers with these items
    ) // Africa Lore is not listed, like a Hidden item
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":1,"africa-lore":1}}')
    window.location.hash = '#/details'
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Your cart' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/cart')
    expect(screen.getByText('Item no longer in the shop')).toBeInTheDocument()
  })

  it('opens the details page from Checkout with its title, and Back to cart returns to the cart', async () => {
    // catches: a Checkout that leads nowhere, a stale tab title, or a Back that skips the cart
    serveTwoItems() // the shop lists two items
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add Knot Tying' }))
    fireEvent.click(screen.getByRole('link', { name: /^Cart, / }))
    await screen.findByRole('heading', { name: 'Your cart' })
    fireEvent.click(screen.getByRole('button', { name: 'Checkout' }))
    expect(await screen.findByRole('heading', { name: 'Your details' })).toHaveFocus()
    expect(document.title).toBe('Your details · PEM Pathfinder Store')
    expect(window.location.hash).toBe('#/details')
    const back = vi.spyOn(window.history, 'back') // history back when the cart came before
    fireEvent.click(screen.getByRole('link', { name: 'Back' }))
    expect(back).toHaveBeenCalledTimes(1)
    await screen.findByRole('heading', { name: 'Your cart' })
    expect(document.title).toBe('Your cart · PEM Pathfinder Store')
    back.mockRestore() // put history back
  })

  it('goes to the cart from Back to cart on a details page opened by address', async () => {
    // catches: a Back to cart that leaves the store when there is no history behind it
    serveTwoItems() // the shop lists two items
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":1}}')
    window.location.hash = '#/details'
    render(<App />)
    fireEvent.click(await screen.findByRole('link', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Your cart' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/cart')
  })

  it('takes over scroll restoration so the saved position wins', () => {
    // catches: the browser restoring the scroll after the app and landing on a clamped value
    serveTwoItems() // the shop lists two items
    render(<App />)
    expect(window.history.scrollRestoration).toBe('manual')
  })

  it('keeps a typed name in the order form while the buyer goes back to add an item and returns', async () => { // a typed name survives leaving for the shop and coming back
    // catches: form values kept inside the details page, which unmounts when the buyer goes back to the catalogue
    serveTwoItems() // the shop lists two items
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add Knot Tying' }))
    fireEvent.click(screen.getByRole('link', { name: /^Cart, / }))
    fireEvent.click(await screen.findByRole('button', { name: 'Checkout' }))
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Jo Tan' } })
    fireEvent.click(screen.getByRole('link', { name: 'Back' })) // to the cart
    await screen.findByRole('heading', { name: 'Your cart' }) // the cart shows before the next Back
    fireEvent.click(screen.getByRole('link', { name: 'Back' })) // to the catalogue
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Your cart' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('link', { name: /^Cart, / }))
    fireEvent.click(await screen.findByRole('button', { name: 'Checkout' }))
    expect(await screen.findByLabelText('Name')).toHaveValue('Jo Tan')
  })

  it('shows the confirmation at #/order-sent with its heading focused, its title and no pill or catalogue', async () => {
    // catches: the confirmation address opening the catalogue, a stale title, focus left behind, or a pill over the confirmation
    serveTwoItems() // the shop lists two items
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":2}}') // would grow the Cart tab on the shop
    writeSentOrder({
      number: 'PF-20261028-4K7Q',
      sentAt: '2026-10-28T10:00:00.000Z',
      currency: 'MYR',
      lines: [],
      totalCents: 0,
      contact: { name: 'J. Cruz', email: 'jc@mail.com', phone: '+60 12-345 6789' },
      club: { subject: 'Eagles', email: 'Eagles' },
      changesNotSent: false,
    })
    window.location.hash = '#/order-sent'
    render(<App />)
    const heading = await screen.findByRole('heading', { name: 'Order sent' })
    expect(heading).toHaveFocus()
    expect(document.title).toBe('Order sent · PEM Pathfinder Store')
    expect(screen.getByText('PF-20261028-4K7Q')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox', { name: 'Search items' })).not.toBeInTheDocument()
  })

  it('sends an order from the cart and lands on the confirmation with an empty cart', async () => {
    // catches: pieces that work alone but do not join: the cart not cleared, no confirmation, or the number not shown
    vi.stubGlobal(
      'fetch',
      shopFetch([item('knot-tying', 'Knot Tying')], [], (url) => // the shop answers with these items
        url.endsWith('/orders')
          ? new Response(
              JSON.stringify({
                number: 'PF-20261102-4K7Q',
                createdAt: '2026-11-01T17:00:00.000Z',
                currency: 'MYR',
                totalCents: 400,
                lines: [{ itemId: 'knot-tying', name: 'Knot Tying', quantity: 1, priceCents: 400 }],
              }),
              { status: 201 },
            )
          : undefined,
      ),
    ) // the shop and the Worker answer
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add Knot Tying' }))
    fireEvent.click(screen.getByRole('link', { name: /^Cart, / }))
    fireEvent.click(await screen.findByRole('button', { name: 'Checkout' }))
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Jo Tan' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jc@mail.com' } })
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '0312345678' } })
    fireEvent.change(screen.getByLabelText('Club name'), { target: { value: 'Hilltop Club' } })
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    expect(await screen.findByRole('heading', { name: 'Order sent' })).toHaveFocus()
    expect(screen.getByText('PF-20261102-4K7Q')).toBeInTheDocument() // the Worker's number
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe('{"version":1,"quantities":{}}')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    act(() => window.history.back()) // the buyer presses Back on the confirmation
    expect(await screen.findByRole('heading', { name: 'Your cart' })).toBeInTheDocument() // the cart, now empty, not the catalogue
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Browse more' })).toBeInTheDocument()
  })

  describe('Home, Shop and the centred header', () => {
    /** Serves one Nature and two Recreation items. */
    function serveCategories() {
      /**
       * Builds one item at RM 4.
       * @param id the id
       * @param name the name
       * @param category the category
       * @return the item
       */
      const itemIn = (id: string, name: string, category: string) => item(id, name, { category }) // one item
      vi.stubGlobal(
        'fetch',
        shopFetch([itemIn('ants', 'Ants', 'Nature'), itemIn('knot-tying', 'Knot Tying', 'Recreation'), itemIn('camping', 'Camping', 'Recreation')]), // the shop answers with these items
      ) // three items in two categories
    }

    it('shows Home at #/ with the PEM Pathfinder Store heading, the theme button, no Back and the plain title', async () => {
      // catches: an old link to #/ still opening the grid, or a Back on the first screen
      serveCategories()
      window.location.hash = '#/'
      render(<App />)
      const header = screen.getByRole('banner')
      expect(within(header).getByRole('heading', { level: 1, name: 'PEM Pathfinder Store' })).toBeInTheDocument()
      expect(within(header).getByRole('button', { name: /^Theme:/ })).toBeInTheDocument()
      expect(within(header).queryByRole('link', { name: 'Back' })).not.toBeInTheDocument()
      const title = within(header).getByRole('heading', { level: 1, name: 'PEM Pathfinder Store' }) // the big name
      expect(title).toHaveClass('text-balance') // a wrap leaves two even lines, never a lone "Store"
      expect(title).toHaveClass('text-lg') // 18 px under 400 px so the long name fits on one line
      expect(await screen.findByRole('link', { name: 'Nature' })).toBeInTheDocument()
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
      expect(document.title).toBe('PEM Pathfinder Store')
    })

    it('shows Shop at #/shop with a small PEM Pathfinder Store over Shop, the theme button, no Back and its own title', async () => {
      // catches: Shop drawn like an inner screen
      serveCategories()
      render(<App />)
      const header = screen.getByRole('banner')
      expect(within(header).getByRole('heading', { level: 1, name: 'PEM Pathfinder Store' })).toBeInTheDocument()
      expect(within(header).getByRole('heading', { level: 2, name: 'Shop' })).toBeInTheDocument()
      expect(within(header).getByRole('button', { name: /^Theme:/ })).toBeInTheDocument()
      expect(within(header).queryByRole('link', { name: 'Back' })).not.toBeInTheDocument()
      await screen.findByText('Ants')
      expect(document.title).toBe('Shop · PEM Pathfinder Store')
    })

    it('opens the grid at the top after a tile, even when Shop was scrolled before', async () => {
      // catches: a fresh arrival restoring the old scroll instead of the top
      serveCategories()
      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) // jsdom does not scroll
      render(<App />)
      await screen.findByText('Ants')
      Object.defineProperty(window, 'scrollY', { value: 92, configurable: true })
      fireEvent.scroll(window) // the buyer scrolled Shop to 92
      act(() => {
        window.location.hash = '#/' // Home
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      })
      fireEvent.click(await screen.findByRole('link', { name: 'Nature' }))
      await waitFor(() => expect(window.location.hash).toBe('#/shop?category=Nature'))
      await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith(0, 0))
      delete (window as { scrollY?: number }).scrollY // jsdom's own again
      scrollTo.mockRestore() // put scrollTo back
    })

    it('opens the grid at the top when a typed address names another category while Shop shows', async () => {
      // catches: a typed #/shop?category= leaving the buyer mid-page on the new filter
      serveCategories()
      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) // jsdom does not scroll
      render(<App />)
      await screen.findByText('Ants')
      scrollTo.mockClear() // only the arrival counts
      act(() => {
        window.location.hash = '#/shop?category=Nature' // typed over the shop address
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      })
      await waitFor(() => expect(screen.queryByText('Knot Tying')).not.toBeInTheDocument())
      expect(scrollTo).toHaveBeenLastCalledWith(0, 0)
      scrollTo.mockRestore() // put scrollTo back
    })

    it('keeps search, filter and scroll when the buyer goes to the cart and comes back', async () => {
      // catches: the hidden grid forgetting its category once the address is #/cart
      serveCategories()
      window.location.hash = '#/shop?category=Recreation'
      render(<App />)
      fireEvent.change(await screen.findByRole('searchbox', { name: 'Search items' }), { target: { value: 'knot' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Knot Tying' }))
      fireEvent.click(screen.getByRole('link', { name: /^Cart, / }))
      await screen.findByRole('heading', { name: 'Your cart' })
      fireEvent.click(screen.getByRole('link', { name: 'Back' }))
      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Your cart' })).not.toBeInTheDocument())
      expect(screen.getByRole('searchbox', { name: 'Search items' })).toHaveValue('knot')
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveDisplayValue('Recreation')
      expect(screen.queryByText('Ants')).not.toBeInTheDocument() // still filtered
    })

    it('opens Home for an unknown address without rewriting it', async () => {
      // catches: a typo or #/admin opening the grid, or the address being replaced
      serveCategories()
      window.location.hash = '#/admin'
      render(<App />)
      expect(await screen.findByRole('link', { name: 'Browse the shop' })).toBeInTheDocument()
      expect(window.location.hash).toBe('#/admin')
    })

    it('keeps the title in a 44 px, title, 44 px grid on Home, Shop and an inner screen', () => {
      // catches: a header whose title moves when the < button appears
      serveCategories()
      for (const hash of ['#/', '#/shop', '#/cart']) {
        window.location.hash = hash
        const { unmount } = render(<App />)
        const grid = screen.getByRole('banner').firstElementChild!
        expect(grid.className).toContain('grid-cols-[2.75rem_minmax(0,1fr)_2.75rem]')
        unmount()
      }
    })

    it('opens Shop on the tile\'s category with an empty search, even after a search was typed', async () => {
      // catches: a tile that opens an unfiltered grid, or a stale search surviving the tile
      serveCategories()
      render(<App />)
      fireEvent.change(await screen.findByRole('searchbox', { name: 'Search items' }), { target: { value: 'camp' } })
      act(() => {
        window.location.hash = '#/' // Home
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      })
      fireEvent.click(await screen.findByRole('link', { name: 'Nature' }))
      await waitFor(() => expect(window.location.hash).toBe('#/shop?category=Nature')) // the browser follows the link a moment later
      expect(await screen.findByRole('searchbox', { name: 'Search items' })).toHaveValue('')
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveDisplayValue('Nature')
      expect(screen.queryByText('Knot Tying')).not.toBeInTheDocument()
    })

    it('puts a dropdown pick in the address without a new history entry', async () => {
      // catches: every filter pick adding a Back step
      serveCategories()
      render(<App />)
      await screen.findByText('Ants')
      const length = window.history.length // entries before the pick
      fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'Recreation' } })
      expect(window.location.hash).toBe('#/shop?category=Recreation')
      expect(window.history.length).toBe(length)
      fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: '' } })
      expect(window.location.hash).toBe('#/shop')
    })

    it('keeps the filter after a reload of a filtered address', async () => {
      // catches: a filter held only in memory
      serveCategories()
      window.location.hash = '#/shop?category=Nature'
      render(<App />)
      await screen.findByText('Ants')
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveDisplayValue('Nature')
      expect(screen.queryByText('Knot Tying')).not.toBeInTheDocument()
    })

    it('sends focus to main on Browse the shop', async () => {
      // catches: focus left on a link that has gone, or on the search box where a phone keyboard would open
      serveCategories()
      window.location.hash = '#/'
      render(<App />)
      fireEvent.click(await screen.findByRole('link', { name: 'Browse the shop' }))
      act(() => window.dispatchEvent(new HashChangeEvent('hashchange')))
      await screen.findByRole('searchbox', { name: 'Search items' })
      expect(screen.getByRole('main')).toHaveFocus()
    })

    it('focuses main without scrolling it into view, so the page stays at its top', async () => {
      // catches: focus() pulling the page down by the header's height after a screen change
      serveCategories()
      window.location.hash = '#/'
      const focus = vi.spyOn(HTMLElement.prototype, 'focus') // watch every focus call
      render(<App />)
      fireEvent.click(await screen.findByRole('link', { name: 'Browse the shop' }))
      await screen.findByRole('searchbox', { name: 'Search items' })
      const onMain = focus.mock.instances.map((element, index) => [element, focus.mock.calls[index][0]] as const).filter(([element]) => element === screen.getByRole('main'))
      expect(onMain.length).toBeGreaterThan(0)
      for (const [, options] of onMain) expect(options).toEqual({ preventScroll: true })
    })

    it('leads from < on a cart opened by address to #/shop', async () => {
      // catches: < leading to Home or leaving the site
      serveCategories()
      window.location.hash = '#/cart'
      render(<App />)
      fireEvent.click(await screen.findByRole('link', { name: 'Back' }))
      expect(window.location.hash).toBe('#/shop')
    })

    it('replaces the address when the empty cart sends the buyer to Shop', async () => {
      // catches: Browse more adding a history entry, so Back returns to the empty cart
      serveCategories()
      window.location.hash = '#/cart'
      render(<App />)
      const length = window.history.length // entries before
      fireEvent.click(await screen.findByRole('button', { name: 'Browse more' }))
      expect(window.location.hash).toBe('#/shop')
      expect(window.history.length).toBe(length)
    })

    describe('tab pill', () => {
      /**
       * Moves to an address the way a followed link does, once the page has reacted.
       * @param hash the address to open
       */
      const goTo = (hash: string) => {
        act(() => {
          window.location.hash = hash // the new address
          window.dispatchEvent(new HashChangeEvent('hashchange')) // jsdom may not announce it at once
        })
      }

      it.each([
        ['Home', '#/', true],
        ['Shop', '#/shop', true],
        ['the cart', '#/cart', false],
        ['the details page', '#/details', false],
        ['Order sent', '#/order-sent', false],
      ])('shows the Main pill on %s: %s', async (_name, hash, shown) => {
        // catches: a pill on a screen with its own bottom bar, or none on Home and Shop; and the old cart bar element
        serveCategories()
        window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":1}}') // an orderable line, so the details page stays
        window.location.hash = hash
        render(<App />)
        await screen.findByRole('heading', { level: 1, name: 'PEM Pathfinder Store' })
        const pill = screen.queryByRole('navigation', { name: 'Main' })
        if (shown) expect(pill).toBeInTheDocument()
        else expect(pill).not.toBeInTheDocument()
        expect(screen.queryByTestId('cart-bar')).not.toBeInTheDocument()
      })

      it('leaves 112 px at the bottom of every screen, which clears the 86 px pill by 26 px', async () => {
        // catches: the last row of cards or the steps card ending under the pill
        serveCategories()
        for (const hash of ['#/', '#/shop']) {
          window.location.hash = hash
          const { unmount } = render(<App />)
          expect(screen.getByRole('main')).toHaveClass('pb-28')
          expect(screen.getByRole('navigation', { name: 'Main' })).toHaveClass('bottom-5.5', 'h-16')
          unmount()
        }
      })

      it('opens the cart from Home by the Cart tab, and < returns to Home with focus on the Cart tab', async () => {
        // catches: < leaving the buyer on the cart, or focus dropped when the pill is drawn again
        serveCategories()
        window.location.hash = '#/'
        render(<App />)
        fireEvent.click(await screen.findByRole('link', { name: 'Cart' }))
        await screen.findByRole('heading', { name: 'Your cart' })
        expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('link', { name: 'Back' }))
        await screen.findByRole('link', { name: 'Browse the shop' })
        expect(screen.getByRole('link', { name: 'Cart' })).toHaveFocus()
        expect(window.location.hash).toBe('#/')
      })

      it('keeps focus on the tapped tab when the buyer goes Home to Shop and back', async () => {
        // catches: focus thrown to the page body or the main region on a tab change
        serveCategories()
        window.location.hash = '#/'
        render(<App />)
        const nav = within(await screen.findByRole('navigation', { name: 'Main' }))
        nav.getByRole('link', { name: 'Shop' }).focus()
        fireEvent.click(nav.getByRole('link', { name: 'Shop' }))
        await screen.findByRole('searchbox', { name: 'Search items' })
        expect(nav.getByRole('link', { name: 'Shop' })).toHaveFocus()
        nav.getByRole('link', { name: 'Home' }).focus()
        fireEvent.click(nav.getByRole('link', { name: 'Home' }))
        await screen.findByRole('link', { name: 'Browse the shop' })
        expect(nav.getByRole('link', { name: 'Home' })).toHaveFocus()
      })

      it('brings back Nature, the search and the scroll when the Shop tab follows the Home tab', async () => {
        // catches: the Shop tab resetting the filter, the search or the scroll
        serveCategories()
        const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) // jsdom does not scroll
        window.location.hash = '#/shop?category=Nature'
        render(<App />)
        fireEvent.change(await screen.findByRole('searchbox', { name: 'Search items' }), { target: { value: 'ant' } })
        Object.defineProperty(window, 'scrollY', { value: 92, configurable: true })
        fireEvent.scroll(window) // the buyer scrolled Shop to 92
        const nav = within(screen.getByRole('navigation', { name: 'Main' }))
        fireEvent.click(nav.getByRole('link', { name: 'Home' }))
        await screen.findByRole('link', { name: 'Browse the shop' })
        const shopHref = nav.getByRole('link', { name: 'Shop' }).getAttribute('href') // the last Shop address
        expect(shopHref).toBe('#/shop?category=Nature')
        fireEvent.click(nav.getByRole('link', { name: 'Shop' }))
        await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Search items' })).toBeVisible())
        expect(screen.getByRole('searchbox', { name: 'Search items' })).toHaveValue('ant')
        expect(screen.getByRole('combobox', { name: 'Category' })).toHaveDisplayValue('Nature')
        expect(scrollTo).toHaveBeenLastCalledWith(0, 92)
        delete (window as { scrollY?: number }).scrollY // jsdom's own again
        scrollTo.mockRestore() // put scrollTo back
      })

      it('does not push two history entries for a double click on the Cart tab', async () => {
        // catches: a double tap stacking two cart entries, so Back needs two presses
        serveCategories()
        render(<App />)
        const tab = await screen.findByRole('link', { name: 'Cart' })
        const length = window.history.length // entries before
        fireEvent.click(tab)
        fireEvent.click(tab)
        await screen.findByRole('heading', { name: 'Your cart' })
        expect(window.history.length).toBe(length + 1)
      })

      it('lands Back on Home, not on a dead copy of Shop, after Home, Shop, Cart tab and the empty cart\'s Browse more', async () => {
        // catches: Browse more replacing the cart entry with #/shop when the entry before it is already Shop, so the next Back looks dead
        serveCategories()
        window.location.hash = '#/'
        render(<App />)
        const nav = within(await screen.findByRole('navigation', { name: 'Main' }))
        fireEvent.click(nav.getByRole('link', { name: 'Shop' }))
        await screen.findByRole('searchbox', { name: 'Search items' })
        fireEvent.click(screen.getByRole('link', { name: 'Cart' }))
        fireEvent.click(await screen.findByRole('button', { name: 'Browse more' }))
        await screen.findByRole('searchbox', { name: 'Search items' })
        expect(window.location.hash).toBe('#/shop')
        act(() => window.history.back()) // the buyer presses Back
        expect(await screen.findByRole('link', { name: 'Browse the shop' })).toBeInTheDocument() // Home, not Shop again
        expect(window.location.hash).toBe('#/')
      })

      it('still lands Back on Home after Home, Cart tab and the empty cart\'s Browse more', async () => {
        // catches: the fix for the Shop case breaking the Home case
        serveCategories()
        window.location.hash = '#/'
        render(<App />)
        fireEvent.click(await screen.findByRole('link', { name: 'Cart' }))
        fireEvent.click(await screen.findByRole('button', { name: 'Browse more' }))
        await screen.findByRole('searchbox', { name: 'Search items' })
        expect(window.location.hash).toBe('#/shop')
        act(() => window.history.back())
        expect(await screen.findByRole('link', { name: 'Browse the shop' })).toBeInTheDocument()
      })

      it('keeps the Shop search when Browse more comes from a cart the Shop tab opened', async () => {
        // catches: Browse more rebuilding the grid and dropping what the buyer typed
        serveCategories()
        render(<App />)
        fireEvent.change(await screen.findByRole('searchbox', { name: 'Search items' }), { target: { value: 'knot' } })
        fireEvent.click(screen.getByRole('link', { name: 'Cart' }))
        fireEvent.click(await screen.findByRole('button', { name: 'Browse more' }))
        await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Search items' })).toBeVisible())
        expect(screen.getByRole('searchbox', { name: 'Search items' })).toHaveValue('knot')
        expect(screen.getByRole('main')).toHaveFocus() // not the Cart tab: the buyer asked to browse
      })

      it('goes to #/shop by Browse more for a cart opened by address', async () => {
        // catches: the new back rule applying to an address-opened cart, which has no Shop entry behind it
        serveCategories()
        goTo('#/cart')
        render(<App />)
        fireEvent.click(await screen.findByRole('button', { name: 'Browse more' }))
        expect(window.location.hash).toBe('#/shop')
      })
    })
  })
})
