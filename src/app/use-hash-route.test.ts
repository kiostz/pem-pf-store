// Tests for useHashRoute: which screen the address hash names, so the cart screen has a link-able address.

import { act, renderHook } from '@testing-library/react' // run the hook
import { afterEach, describe, expect, it } from 'vitest' // test API
import { useHashRoute, useShopCategory, useShopSubcategory } from './use-hash-route.ts' // code under test

afterEach(() => {
  window.location.hash = '' // leave the address as found
})

describe('useHashRoute', () => {
  it('names the cart for #/cart', () => {
    // catches: the cart address not opening the cart
    window.location.hash = '#/cart'
    const { result } = renderHook(() => useHashRoute())
    expect(result.current).toBe('cart')
  })

  it('names the details page for #/details', () => {
    // catches: the details address opening the catalogue
    window.location.hash = '#/details'
    const { result } = renderHook(() => useHashRoute())
    expect(result.current).toBe('details')
  })

  it('names the order confirmation for #/order-sent', () => {
    // catches: the confirmation address opening the catalogue
    window.location.hash = '#/order-sent'
    const { result } = renderHook(() => useHashRoute())
    expect(result.current).toBe('order-sent')
  })

  it.each(['', '#/', '#/nowhere', '#/admin', '#/shop/x', '#/cart?x', '#/cart/x', '#/details/x', '#/order-sent/x'])(
    'names Home for "%s"',
    (hash) => {
      // catches: the old "anything else is the catalogue"
      window.location.hash = hash
      const { result } = renderHook(() => useHashRoute())
      expect(result.current).toBe('home')
    },
  )

  it.each(['#/shop', '#/shop?category=Nature', '#/shop?x=1'])('names the catalogue for "%s"', (hash) => {
    // catches: the shop address or its query not opening the shop
    window.location.hash = hash
    const { result } = renderHook(() => useHashRoute())
    expect(result.current).toBe('catalogue')
  })

  it('updates useShopCategory on hashchange', () => {
    // catches: a category read once and never again
    window.location.hash = '#/shop'
    const { result } = renderHook(() => useShopCategory())
    expect(result.current).toBeNull()
    act(() => {
      window.location.hash = '#/shop?category=Recreation'
      window.dispatchEvent(new HashChangeEvent('hashchange')) // synchronous
    })
    expect(result.current).toBe('Recreation')
  })

  it('follows hashchange', () => {
    // catches: a screen that is stuck on the address it first saw
    const { result } = renderHook(() => useHashRoute())
    expect(result.current).toBe('home')
    act(() => {
      window.location.hash = '#/cart' // the buyer opens the cart
      window.dispatchEvent(new HashChangeEvent('hashchange')) // jsdom fires its own later; this makes it synchronous
    })
    expect(result.current).toBe('cart')
    act(() => {
      window.location.hash = '#/shop' // the buyer goes back to the shop
      window.dispatchEvent(new HashChangeEvent('hashchange')) // synchronous, as above
    })
    expect(result.current).toBe('catalogue')
  })
})

describe('useShopSubcategory', () => { // the subcategory the address names
  it('updates on hashchange', () => { // follows the address
    // catches: a subcategory read once and never again
    window.location.hash = '#/shop?category=Honors' // no subcategory yet
    const { result } = renderHook(() => useShopSubcategory()) // the hook under test
    expect(result.current).toBeNull() // none at first
    act(() => { // inside act so React sees the change
      window.location.hash = '#/shop?category=Honors&subcategory=Nature' // a chip pick
      window.dispatchEvent(new HashChangeEvent('hashchange')) // synchronous
    })
    expect(result.current).toBe('Nature') // follows the address
  })
})
