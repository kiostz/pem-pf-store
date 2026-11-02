// Test helpers for the shop's one /shop request: an honor builder and a fetch fake, so no test hand-writes the response shape.

import { vi } from 'vitest' // the mock function
import type { Club, Honor } from '@/shared/data/types.ts' // the shapes the screens use

/**
 * Builds one honor as the screens see it.
 * @param id the honor id
 * @param name the display name
 * @param extras fields to replace, such as price or stock
 * @return the honor, RM 4 with 10 in stock and no picture unless extras say otherwise
 */
export function honor(id: string, name: string, extras: Partial<Honor> = {}): Honor {
  return { id, name, category: 'Recreation', price: 4, stock: 10, image: null, ...extras } // defaults first, then the test's own fields
}

/**
 * Builds the JSON body GET /shop answers with.
 * @param honors the honors to list
 * @param clubs the clubs to list
 * @param currency the currency code
 * @return the body, with every price turned into whole cents
 */
export function shopBody(honors: Honor[], clubs: Club[] = [], currency = 'MYR') {
  return {
    items: honors.map(({ price, ...rest }) => ({ ...rest, priceCents: Math.round(price * 100) })), // the wire shape has cents
    clubs, // already the wire shape
    settings: { currency }, // public settings only
  }
}

/**
 * Makes the fetch fake that answers every request with a /shop body.
 * @param honors the honors to list
 * @param clubs the clubs to list
 * @param other answers any request that is not the shop's (such as the order send; it also gets the request's init), or returns undefined to let the shop answer
 * @return the fake, to install with vi.stubGlobal and to count calls on
 */
export function shopFetch(honors: Honor[], clubs: Club[] = [], other?: (url: string, init?: RequestInit) => Response | Promise<Response> | undefined) {
  return vi.fn(async (url: string, init?: RequestInit) => (await other?.(url, init)) ?? new Response(JSON.stringify(shopBody(honors, clubs)))) // the other answer if there is one, else the canned shop body
}
