// Tests for the admin's hash route: which tab, and the order number a link carries.

import { act, renderHook } from '@testing-library/react' // hook rendering
import { afterEach, describe, expect, it } from 'vitest' // test API
import { useAdminRoute } from './use-admin-route.ts' // the code under test

afterEach(() => {
  window.location.hash = '' // no hash leaks into the next test
})

describe('useAdminRoute', () => {
  it('reads #/orders/<number> as the Orders tab with the number upper-cased', () => {
    // Catches a lower-case number that the Worker would refuse.
    window.location.hash = '#/orders/pf-20261105-abcd'
    const { result } = renderHook(() => useAdminRoute())
    expect(result.current).toEqual({ tab: 'orders', number: 'PF-20261105-ABCD' })
  })

  it('falls back to Items for an empty or unknown hash', () => {
    // Catches a blank page on a typo or the bare address.
    window.location.hash = '#/nowhere'
    expect(renderHook(() => useAdminRoute()).result.current).toEqual({ tab: 'items', number: null })
    window.location.hash = ''
    expect(renderHook(() => useAdminRoute()).result.current).toEqual({ tab: 'items', number: null })
  })

  it('reads #/orders and #/settings with no number', () => {
    // Catches a number leaking from one route to the next.
    window.location.hash = '#/settings'
    expect(renderHook(() => useAdminRoute()).result.current).toEqual({ tab: 'settings', number: null })
    window.location.hash = '#/orders'
    expect(renderHook(() => useAdminRoute()).result.current).toEqual({ tab: 'orders', number: null })
  })

  it('reads #/clubs as the Clubs tab and still sends unknown addresses to Items', () => {
    // Catches a Clubs link that lands on Items, or a new tab that breaks the fallback.
    window.location.hash = '#/clubs'
    expect(renderHook(() => useAdminRoute()).result.current).toEqual({ tab: 'clubs', number: null })
    window.location.hash = '#/club'
    expect(renderHook(() => useAdminRoute()).result.current).toEqual({ tab: 'items', number: null })
  })

  it('follows the back button: a hash change switches the tab', () => {
    // Catches a route read once at mount.
    window.location.hash = '#/items'
    const { result } = renderHook(() => useAdminRoute())
    act(() => {
      window.location.hash = '#/orders'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(result.current.tab).toBe('orders')
    act(() => {
      window.location.hash = '#/items'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(result.current.tab).toBe('items')
  })

  it('reads a malformed number as the Orders list instead of throwing', () => {
    // Catches a mangled email link that blanks the whole admin page.
    window.location.hash = '#/orders/%E0%A4'
    expect(renderHook(() => useAdminRoute()).result.current).toEqual({ tab: 'orders', number: null })
  })
})
