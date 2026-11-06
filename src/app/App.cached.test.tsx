// Tests for App when the items are already loaded at the first draw (a cached load), so the Unavailable line and banner cannot depend on a slow load.

import { fireEvent, render, screen } from '@testing-library/react' // render and query the page
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import { CART_STORAGE_KEY } from '@/features/cart/cart-storage.ts' // the stored cart's key
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

// The one load answers at once, as a cache would: ready on the very first render.
vi.mock('@/features/catalogue/use-catalogue-data.ts', async () => {
  const { item } = await import('@/test/shop-fetch.ts') // the mock factory runs before imports, so it loads the builder itself
  const loaded = {
    state: {
      status: 'ready',
      items: [item('knot-tying', 'Knot Tying')], // Africa Lore is not listed, like a Hidden item
      settings: { currency: 'MYR' },
      clubs: [],
    },
    showSkeleton: false,
    retry: () => {},
  } // the same object every render
  return { useCatalogueData: () => loaded }
})

beforeEach(() => {
  window.location.hash = '#/shop' // the shop, where the tab pill is
})

afterEach(() => {
  window.location.hash = '' // back to the catalogue address
})

describe('App with items loaded at the first draw', () => { // the App when items are cached at the first draw
  it('shows the Unavailable line and banner when the cart is opened from the catalogue', async () => {
    // catches: the unavailable line taken out on first mount of the catalogue, so a buyer is never shown what went
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":1,"africa-lore":1}}') // a saved cart holding an item the shop no longer lists
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: /^Cart, / })) // open the cart
    expect(await screen.findByText('1 item is no longer available')).toBeInTheDocument() // told once
    expect(screen.getByText('Item no longer in the shop')).toBeInTheDocument() // and still in the list
  })
})
