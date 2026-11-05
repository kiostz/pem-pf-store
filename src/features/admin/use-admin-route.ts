// The admin's hash route: which tab is open and, on Orders, the order number a link carries; the admin's own reader, since the shop's stays in the app shell.

import { useEffect, useState } from 'react' // state and the hashchange listener

// The three tabs.
export type AdminTab = 'items' | 'orders' | 'settings'
// Where the admin is.
export type AdminRoute = { tab: AdminTab; number: string | null }

/**
 * Decodes the number part of the hash without throwing.
 * @param part the raw text after `#/orders/`, or undefined
 * @return the upper-cased number, or null when it is missing or not valid percent-encoding
 */
function readNumber(part: string | undefined): string | null {
  if (!part) return null // no number
  try {
    return decodeURIComponent(part).toUpperCase() // the number as typed in the link
  } catch {
    return null // a mangled link opens the list
  }
}

/**
 * Reads the current hash as a route.
 * @return the tab, and the upper-cased order number from `#/orders/<number>`
 */
function readRoute(): AdminRoute {
  const [, first, second] = window.location.hash.split('/') // "#", the tab, the number
  if (first === 'settings') return { tab: 'settings', number: null } // Settings
  if (first === 'orders') return { tab: 'orders', number: readNumber(second) } // Orders, maybe one order
  return { tab: 'items', number: null } // Items, and the fallback
}

/**
 * Follows the hash, so links and the back button switch tabs.
 * @return the route now
 */
export function useAdminRoute(): AdminRoute {
  const [route, setRoute] = useState(readRoute) // read once, then on change
  useEffect(() => {
    const onChange = () => setRoute(readRoute()) // a link or the back button
    window.addEventListener('hashchange', onChange) // listen
    return () => window.removeEventListener('hashchange', onChange) // and stop
  }, [])
  return route
}
