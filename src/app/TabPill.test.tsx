// Tests for the tab pill: three tabs, the current one marked, and a Cart tab that stays plain while the cart is empty and grows into the item count and estimated total.

import { fireEvent, render, screen, within } from '@testing-library/react' // render and query
import { describe, expect, it } from 'vitest' // test API
import { CartProvider } from '@/features/cart/CartProvider.tsx' // the state the pill reads
import { useCart } from '@/features/cart/use-cart.ts' // reads and sets the cart
import type { Item } from '@/shared/data/types.ts' // the shape of an item
import { item } from '@/test/shop-fetch.ts' // the item builder
import { PILL_DOCK, PILL_SURFACE } from '@/shared/ui/floating-pill-box.ts' // the shared pill classes
import { TabPill } from './TabPill.tsx' // code under test

const items: Item[] = [item('knot-tying', 'Knot Tying'), item('ants', 'Ants')] // two listed at RM 4; africa-lore is not listed, like a Hidden item

/**
 * Renders the pill with buttons that set quantities.
 * @param options the pill's current tab, items (null while loading) and shop address
 * @return nothing; query the screen
 */
function renderPill({
  current = 'catalogue',
  itemList = items, // the items, null while loading
  shopHref = '#/shop',
}: { current?: 'home' | 'catalogue'; itemList?: Item[] | null; shopHref?: string } = {}) { // the options type: the items may be null while loading
  /**
   * Test buttons that stand in for the steppers.
   * @return one button per quantity change
   */
  function Controls() {
    const { setQuantity } = useCart() // the same state the pill reads
    return (
      <>
        <button onClick={() => setQuantity('knot-tying', 2)}>two knots</button>
        <button onClick={() => setQuantity('ants', 3)}>three ants</button>
        <button onClick={() => setQuantity('knot-tying', 1)}>one knot</button>
        <button onClick={() => setQuantity('knot-tying', 0)}>no knots</button>
        <button onClick={() => setQuantity('ants', 0)}>no ants</button>
        <button onClick={() => setQuantity('africa-lore', 2)}>two not listed</button>
      </>
    )
  }
  render(
    <CartProvider
      items={itemList} // the items the pill counts
    >
      <TabPill
        current={current} // the tab the test marks as open
        items={itemList} // the items the pill counts
        currency={itemList ? 'MYR' : null} // a currency only once items exist
        shopHref={shopHref} // where the Shop tab links
      />
      <Controls />
    </CartProvider>,
  )
}

/**
 * Finds the three tabs.
 * @return the Home, Shop and Cart links inside the Main nav
 */
function tabs() {
  const nav = screen.getByRole('navigation', { name: 'Main' }) // the pill
  return {
    home: within(nav).getByRole('link', { name: 'Home' }),
    shop: within(nav).getByRole('link', { name: 'Shop' }),
    cart: within(nav).getByRole('link', { name: /^Cart/ }),
  }
}

describe('TabPill', () => {
  it('has a Main nav with Home, Shop and a Cart tab named exactly "Cart" while the cart is empty', () => {
    // catches: a missing tab, an unlabelled nav, or a plain Cart tab that announces a count
    renderPill()
    const { home, shop, cart } = tabs()
    expect(home).toHaveAttribute('href', '#/')
    expect(shop).toHaveAttribute('href', '#/shop')
    expect(cart).toHaveAttribute('href', '#/cart')
    expect(cart).toHaveAccessibleName('Cart')
  })

  it.each([
    ['catalogue', 'Shop'],
    ['home', 'Home'],
  ] as const)('marks only the %s tab as the current page', (current, name) => {
    // catches: two tabs current, or none
    renderPill({ current })
    const links = tabs()
    expect(screen.getAllByRole('link', { current: 'page' })).toHaveLength(1)
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name, current: 'page' })).toBeInTheDocument()
    expect(links.cart).not.toHaveAttribute('aria-current')
  })

  it('points the Shop tab at the shop address it is given', () => {
    // catches: a Shop tab that resets the category, the search and the scroll
    renderPill({ shopHref: '#/shop?category=Nature' })
    expect(tabs().shop).toHaveAttribute('href', '#/shop?category=Nature')
  })

  it('names the grown Cart tab with the count and the estimated total, and shows both', () => {
    // catches: counting lines instead of quantities, a wrong total, or a name a screen reader cannot use
    renderPill()
    fireEvent.click(screen.getByText('two knots'))
    fireEvent.click(screen.getByText('three ants'))
    const { cart } = tabs()
    expect(cart).toHaveAccessibleName('Cart, 5 items, estimated total RM 20.00')
    expect(within(cart).getByText('5 items')).toBeInTheDocument()
    expect(within(cart).getByText('RM 20.00')).toBeInTheDocument()
  })

  it('says "1 item" for one', () => {
    // catches: "1 items"
    renderPill()
    fireEvent.click(screen.getByText('one knot'))
    expect(tabs().cart).toHaveAccessibleName('Cart, 1 item, estimated total RM 4.00')
    expect(within(tabs().cart).getByText('1 item')).toBeInTheDocument()
  })

  it('does not count an item the shop no longer lists', () => {
    // catches: the pill disagreeing with the Checkout bar about what is orderable
    renderPill()
    fireEvent.click(screen.getByText('one knot'))
    fireEvent.click(screen.getByText('two not listed'))
    expect(tabs().cart).toHaveAccessibleName('Cart, 1 item, estimated total RM 4.00')
  })

  it('stays plain when only a gone item is in the cart', () => { // a cart holding only an Unavailable item
    // catches: a grown tab over a cart with nothing to order
    renderPill()
    fireEvent.click(screen.getByText('two not listed'))
    expect(tabs().cart).toHaveAccessibleName('Cart')
  })

  it('shows the plain tab while the items are not loaded', () => { // the pill with items still null, as before the data loads
    // catches: a count or a crash before the data arrives
    renderPill({ itemList: null }) // pill with no items loaded
    expect(tabs().cart).toHaveAccessibleName('Cart')
  })

  it('goes back to a plain tab when every quantity is 0', () => {
    // catches: a grown tab left over an empty cart
    renderPill()
    fireEvent.click(screen.getByText('two knots'))
    fireEvent.click(screen.getByText('no knots'))
    expect(tabs().cart).toHaveAccessibleName('Cart')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('keeps its polite status region mounted and empty with no lines, and fills that same element on the first add', () => {
    // catches: the first add going unannounced because the region entered the page in the same render as its text
    renderPill()
    const region = screen.getByRole('status') // present while the cart is empty
    expect(region).toBeEmptyDOMElement()
    fireEvent.click(screen.getByText('one knot'))
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('1 item, Estimated total RM 4.00')
  })

  it('announces the new count when it changes', () => {
    // catches: a screen reader user never hearing that the cart changed
    renderPill()
    fireEvent.click(screen.getByText('two knots'))
    expect(screen.getByRole('status')).toHaveTextContent('2 items, Estimated total RM 8.00')
  })

  it('gives all three tabs the same growing width while the cart is empty', () => {
    // catches: unequal tabs on an empty cart (jsdom cannot time a transition, so the layout classes are checked)
    renderPill()
    for (const tab of Object.values(tabs())) {
      expect(tab).toHaveClass('grow', 'basis-0')
      expect(tab).not.toHaveClass('grow-0')
    }
  })

  it('shrinks Home and Shop to a 64 px basis and lets Cart take the rest while the cart has items', () => {
    // catches: the Cart tab not growing, or Home and Shop staying wide
    renderPill()
    fireEvent.click(screen.getByText('one knot'))
    const { home, shop, cart } = tabs()
    for (const tab of [home, shop]) expect(tab).toHaveClass('grow-0', 'basis-16')
    expect(cart).toHaveClass('grow', 'basis-0')
  })

  it('spreads the grown Cart tab\'s content to its edges, and centres the plain tabs\' content', () => {
    // catches: justify-center beating justify-between, so the arrow sits against the text instead of at the right edge
    renderPill()
    const plain = tabs()
    for (const tab of Object.values(plain)) expect(tab).toHaveClass('justify-center')
    fireEvent.click(screen.getByText('one knot'))
    const { home, cart } = tabs()
    expect(cart).toHaveClass('justify-between')
    expect(cart).not.toHaveClass('justify-center')
    expect(home).toHaveClass('justify-center')
  })

  it('is hidden on paper', () => {
    // catches: a floating pill printed over the page
    renderPill()
    expect(screen.getByRole('navigation', { name: 'Main' })).toHaveClass('print:hidden')
  })
})

describe('TabPill shell', () => {
  it('carries the dock and surface classes the cart and details pills share', () => {
    // catches: the tab pill and the action pills drifting apart in size, position or look
    renderPill()
    const nav = screen.getByRole('navigation', { name: 'Main' })
    for (const name of [...PILL_DOCK.split(' '), ...PILL_SURFACE.split(' ')]) expect(nav).toHaveClass(name)
  })
})
