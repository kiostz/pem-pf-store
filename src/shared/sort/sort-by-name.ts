// The A to Z name sort shared by the catalogue and the cart, so both list items in the same order without importing each other.

import type { Item } from '@/shared/data/types.ts' // the shape of one item

/**
 * Compares two strings A to Z for display order.
 * @param a first string
 * @param b second string
 * @return negative, zero or positive for sort()
 */
export const byText = (a: string, b: string): number => a.localeCompare(b, 'en') // locale-aware A to Z

/**
 * Puts items A to Z by name.
 * @param items the items to sort
 * @return a new array, names A to Z; the input is left as it was
 */
export function sortByName(
  items: Item[], // the items to sort
): Item[] { // the sorted items
  return [...items].sort((a, b) => byText(a.name, b.name)) // copy first so the caller's array keeps its order
}
