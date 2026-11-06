// Tests for CartProvider: start from storage, write each change, keep unavailable honors until takeOutUnavailable removes them in one write.

import { StrictMode } from 'react' // React's double render and double effect run in development
import { act, fireEvent, render, screen } from '@testing-library/react' // render and query
import { beforeEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import type { Item } from '@/shared/data/types.ts' // the shape of an item
import { honor } from '@/test/shop-fetch.ts' // the honor builder
import { CART_STORAGE_KEY } from './cart-storage.ts' // the key under test
import { CartProvider } from './CartProvider.tsx' // code under test
import { useCart } from './use-cart.ts' // reads the cart

const honors: Item[] = [honor('knot-tying', 'Knot Tying'), honor('ants', 'Ants')] // Africa Lore is not listed, like a Hidden item

/**
 * Shows the cart as text and offers one button to change it.
 * @return the quantities and buttons
 */
function Probe() {
  const { quantities, setQuantity, removeOrderLines, takeOutUnavailable } = useCart() // the cart
  return (
    <>
      <p data-testid="quantities">{JSON.stringify(quantities)}</p>
      <button onClick={takeOutUnavailable}>take out unavailable</button>
      <button onClick={() => setQuantity('knot-tying', 5)}>five knots</button>
      <button
        onClick={() =>
          removeOrderLines([
            { itemId: 'knot-tying', quantity: 2 },
            { itemId: 'ants', quantity: 1 },
          ])
        }
      >
        remove sent lines
      </button>
    </>
  )
}

/**
 * Renders the probe inside a provider.
 * @param honorsNow the honors prop
 * @return RTL's rerender, which keeps the probe
 */
function renderProvider(honorsNow: Item[] | null) { // the items prop, null while loading
  const view = render(
    <CartProvider honors={honorsNow}>
      <Probe />
    </CartProvider>,
  )
  return (next: Item[] | null) => // rerenders with the next items
    view.rerender(
      <CartProvider honors={next}>
        <Probe />
      </CartProvider>,
    )
}

describe('CartProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks() // fresh spies
  })

  it('starts from the stored cart', () => {
    // catches: a reload that forgets the cart
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":2}}')
    renderProvider(null)
    expect(screen.getByTestId('quantities')).toHaveTextContent('{"knot-tying":2}')
  })

  it('writes each change at once', () => {
    // catches: a save that waits, or a stale value after the last change
    renderProvider(null)
    fireEvent.click(screen.getByText('five knots'))
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe('{"version":1,"quantities":{"knot-tying":5}}')
  })

  it('removeOrderLines takes the sent order lines out of the cart and its stored copy', () => {
    // catches: a sent order whose order lines come back after a reload
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":2,"ants":1}}')
    renderProvider(null)
    fireEvent.click(screen.getByText('remove sent lines'))
    expect(screen.getByTestId('quantities')).toHaveTextContent('{}')
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe('{"version":1,"quantities":{}}')
  })

  it('removeOrderLines leaves what was added or raised after the order was sent', () => {
    // catches: a successful send wiping an honor added, or the extra quantity, while the order was on its way
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      '{"version":1,"quantities":{"knot-tying":5,"ants":1,"africa-lore":4}}',
    )
    renderProvider(null)
    fireEvent.click(screen.getByText('remove sent lines'))
    expect(screen.getByTestId('quantities')).toHaveTextContent('{"knot-tying":3,"africa-lore":4}')
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe(
      '{"version":1,"quantities":{"knot-tying":3,"africa-lore":4}}',
    )
  })

  it('does not write on start, so a failed load leaves the stored value as it was', () => {
    // catches: a start-up write that replaces a bad or unread stored cart with an empty one
    window.localStorage.setItem(CART_STORAGE_KEY, 'not json')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderProvider(null)
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe('not json')
  })

  it('takes nothing out while honors is null', () => {
    // catches: an emptied cart while the data is still loading or after a failed load
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"africa-lore":1,"gone":2}}')
    renderProvider(null)
    expect(screen.getByTestId('quantities')).toHaveTextContent('{"africa-lore":1,"gone":2}')
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe('{"version":1,"quantities":{"africa-lore":1,"gone":2}}')
  })

  it('keeps unavailable ids when honors arrive, with no write', () => {
    // catches: the old take-out on load, which hides an unavailable line before the buyer sees it
    const stored = '{"version":1,"quantities":{"knot-tying":2,"africa-lore":1,"no-such-honor":3}}'
    window.localStorage.setItem(CART_STORAGE_KEY, stored)
    const setItem = vi.spyOn(Storage.prototype, 'setItem') // counts the writes
    const rerender = renderProvider(null)
    act(() => rerender(honors))
    expect(screen.getByTestId('quantities')).toHaveTextContent('{"knot-tying":2,"africa-lore":1,"no-such-honor":3}')
    expect(setItem).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe(stored)
  })

  it('keeps the unavailable lines across a reload (storage round trip)', () => {
    // catches: a stored cart that loses the unavailable line, so a reload hides it
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"africa-lore":1,"ants":2}}')
    const first = render(
      <CartProvider honors={honors}>
        <Probe />
      </CartProvider>,
    )
    fireEvent.click(screen.getByText('five knots')) // a write, so storage holds the whole cart
    first.unmount() // the page closes
    renderProvider(honors) // and opens again
    expect(screen.getByTestId('quantities')).toHaveTextContent('{"africa-lore":1,"ants":2,"knot-tying":5}')
  })

  it('takeOutUnavailable removes every unavailable id in one write and keeps the rest', () => {
    // catches: an unavailable line left in an order, or a take-out that writes twice or drops an orderable line
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      '{"version":1,"quantities":{"knot-tying":2,"africa-lore":1,"no-such-honor":3}}',
    )
    const setItem = vi.spyOn(Storage.prototype, 'setItem') // counts the writes
    renderProvider(honors)
    fireEvent.click(screen.getByText('take out unavailable'))
    expect(screen.getByTestId('quantities')).toHaveTextContent('{"knot-tying":2}')
    expect(setItem.mock.calls.map(([, value]) => value)).toEqual(['{"version":1,"quantities":{"knot-tying":2}}']) // one write
  })

  it('takeOutUnavailable writes once under StrictMode', () => {
    // catches: a take-out that writes twice when React runs updaters and effects twice
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      '{"version":1,"quantities":{"knot-tying":2,"africa-lore":1,"no-such-honor":3}}',
    ) // a stored cart with an unavailable and a missing honor
    const setItem = vi.spyOn(Storage.prototype, 'setItem') // counts the writes
    render(
      <StrictMode>
        <CartProvider honors={honors}>
          <Probe />
        </CartProvider>
      </StrictMode>,
    ) // the same provider under StrictMode
    fireEvent.click(screen.getByText('take out unavailable'))
    expect(screen.getByTestId('quantities')).toHaveTextContent('{"knot-tying":2}')
    expect(setItem.mock.calls.map(([, value]) => value)).toEqual(['{"version":1,"quantities":{"knot-tying":2}}']) // one write
  })

  it('takeOutUnavailable writes nothing when every id is orderable', () => {
    // catches: a write (and a re-render) on every Checkout press
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":2}}')
    const setItem = vi.spyOn(Storage.prototype, 'setItem') // counts the writes
    renderProvider(honors)
    fireEvent.click(screen.getByText('take out unavailable'))
    expect(setItem).not.toHaveBeenCalled()
  })

  it('takeOutUnavailable writes nothing while honors is null', () => {
    // catches: an emptied cart before the data is known, which would drop orderable lines too
    const stored = '{"version":1,"quantities":{"africa-lore":1,"gone":2}}'
    window.localStorage.setItem(CART_STORAGE_KEY, stored)
    const setItem = vi.spyOn(Storage.prototype, 'setItem') // counts the writes
    renderProvider(null)
    fireEvent.click(screen.getByText('take out unavailable'))
    expect(screen.getByTestId('quantities')).toHaveTextContent('{"africa-lore":1,"gone":2}')
    expect(setItem).not.toHaveBeenCalled()
  })

  it('keeps working in memory when storage throws', () => {
    // catches: blocked storage breaking the cart
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    renderProvider(honors)
    fireEvent.click(screen.getByText('five knots'))
    expect(screen.getByTestId('quantities')).toHaveTextContent('{"knot-tying":5}')
  })
})
