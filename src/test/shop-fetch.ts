// Test helpers for the shop's one /shop request: an item builder and a fetch fake, so no test hand-writes the response shape.

import { vi } from 'vitest' // the mock function
import type { Club, Item } from '@/shared/data/types.ts' // the shapes the screens use

/**
 * Builds one item as the screens see it.
 * @param id the item id
 * @param name the display name
 * @param extras fields to replace, such as price or stock
 * @return the item, RM 4 with 10 in stock and no picture unless extras say otherwise
 */
export function item(id: string, name: string, extras: Partial<Item> = {}): Item { // builds a listed item with defaults
  return { id, name, category: 'Recreation', subcategory: null, price: 4, stock: 10, image: null, ...extras } // defaults first, then the test's own fields
}

/**
 * Builds the JSON body GET /shop answers with.
 * @param items the items to list
 * @param clubs the clubs to list
 * @param currency the currency code
 * @return the body, with every price turned into whole cents
 */
export function shopBody(items: Item[], clubs: Club[] = [], currency = 'MYR') { // the items for the /shop body
  return {
    items: items.map(({ price, ...rest }) => ({ ...rest, priceCents: Math.round(price * 100) })), // the wire shape has cents
    clubs, // already the wire shape
    settings: { currency }, // public settings only
  }
}

/**
 * Makes the fetch fake that answers every request with a /shop body.
 * @param items the items to list
 * @param clubs the clubs to list
 * @param other answers any request that is not the shop's (such as the order send; it also gets the request's init), or returns undefined to let the shop answer
 * @return the fake, to install with vi.stubGlobal and to count calls on
 */
export function shopFetch(items: Item[], clubs: Club[] = [], other?: (url: string, init?: RequestInit) => Response | Promise<Response> | undefined) { // the items for the canned fetch
  return vi.fn(async (url: string, init?: RequestInit) => (await other?.(url, init)) ?? new Response(JSON.stringify(shopBody(items, clubs)))) // the other answer if there is one, else the canned shop body
}
