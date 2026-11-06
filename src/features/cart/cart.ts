// Cart maths: quantity rules, the A to Z order lines and exact money in cents, so every screen shows the same numbers.

import type { Item } from '@/shared/data/types.ts' // the shape of an item
import { sortByName } from '@/shared/sort/sort-by-name.ts' // names A to Z

export const MAX_QUANTITY = 99 // the most of one honor in a cart
export const GONE_NAME = 'Item no longer in the shop' // what a line shows when its honor is gone from the data

/**
 * Names an order line for a screen reader; gone honors carry their id so two of them differ.
 * @param honor the honor on the line, or null when it is gone from the data
 * @param honorId the id saved in the cart
 * @return the honor's name, or the gone name with the id
 */
export function lineLabel(honor: Item | null, honorId: string): string { // the item, null when gone
  return honor?.name ?? `${GONE_NAME} (${honorId})` // the id tells gone lines apart
}

// Item id to quantity, 1 to 99; 0 is never kept.
export type CartQuantities = Record<string, number>

// One honor and its quantity in the cart.
export type OrderLine = { honor: Item; quantity: number } // an order line is an item and its quantity

/**
 * Forces a quantity into the whole numbers 0 to a maximum.
 * @param value any number
 * @param max the most allowed, 99 unless a stock is lower
 * @return the whole part, never below 0 or above the maximum; NaN gives 0
 */
export function clampQuantity(value: number, max: number = MAX_QUANTITY): number {
  if (Number.isNaN(value)) return 0 // nothing usable typed
  return Math.min(max, Math.max(0, Math.floor(value))) // whole numbers inside the limits
}

/**
 * Gives the most of one honor a buyer may pick.
 * @param honor the honor
 * @return the lower of 99 and its stock
 */
export function quantityCap(honor: Item): number { // the cap comes from the item's stock
  return Math.min(MAX_QUANTITY, honor.stock) // never more than is left, never more than 99
}

/**
 * Tells whether an order line asks for more than is left, which includes any quantity of a Sold out honor.
 * @param line the order line
 * @return true when the quantity is above the stock
 */
export function exceedsStock(line: OrderLine): boolean {
  return line.quantity > line.honor.stock // equal to the stock is still fine
}

/**
 * Sets one honor's quantity.
 * @param quantities the cart now
 * @param honorId the honor to change
 * @param quantity the new quantity; clamped, and 0 removes the honor
 * @return a new cart; the input is left as it was
 */
export function setQuantity(
  quantities: CartQuantities,
  honorId: string,
  quantity: number,
): CartQuantities {
  const next = { ...quantities } // a copy, so the input stays as it was
  const clamped = clampQuantity(quantity) // 0 to 99
  if (clamped === 0)
    delete next[honorId] // 0 deletes the key
  else next[honorId] = clamped // otherwise store it
  return next // the new cart
}

/**
 * Turns the cart into order lines A to Z.
 * @param quantities the cart
 * @param honors every honor the shop lists
 * @return the order lines by name, and the cart's ids that the shop no longer lists
 */
export function resolveCart(
  quantities: CartQuantities,
  honors: Item[], // every listed item
): {
  lines: OrderLine[]
  unavailable: Array<{ honorId: string }>
} {
  const inCart = honors.filter((honor) => quantities[honor.id] !== undefined) // honors the cart names; the shop lists only active ones
  const known = new Set(inCart.map((honor) => honor.id)) // ids the data has
  return {
    lines: sortByName(inCart).map((honor) => ({
      honor, // the honor
      quantity: quantities[honor.id], // how many are in the cart
    })), // A to Z with quantities
    unavailable: Object.keys(quantities)
      .filter((honorId) => !known.has(honorId)) // ids the shop no longer lists, hidden honors included
      .map((honorId) => ({ honorId })), // the cart stores ids only
  } // the order lines and what to take out
}

/**
 * Prices one order line in cents.
 * @param line the order line
 * @return price in cents times quantity, a whole number
 */
export function lineTotalCents(line: OrderLine): number {
  return Math.round(line.honor.price * 100) * line.quantity // cents first, so 1.15 stays 115
}

/**
 * Adds the line totals.
 * @param lines the order lines
 * @return the estimated total in cents
 */
export function estimatedTotalCents(lines: OrderLine[]): number {
  return lines.reduce((sum, line) => sum + lineTotalCents(line), 0) // shown lines always add up to this
}

/**
 * Gives the Item count of the cart.
 * @param lines the order lines
 * @return the sum of all quantities
 */
export function cartCount(lines: OrderLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0) // quantities, not lines
}
