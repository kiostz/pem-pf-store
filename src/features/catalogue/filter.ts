// Search, category filter and A to Z sort for the catalogue, as plain functions so the screen only renders their result.

import type { Item } from '@/shared/data/types.ts' // the shape of one item
import { byText } from '@/shared/sort/sort-by-name.ts' // A to Z compare

// What the buyer has typed and picked; a null category is All categories.
export type CatalogueFilter = { query: string; category: string | null }

/**
 * Keeps the items that match the search words and the category.
 * @param items every item the shop lists
 * @param filter the typed query and the chosen category (null for All categories)
 * @return the matching items in their input order
 */
export function filterItems(
  items: Item[], // every item the shop lists
  filter: CatalogueFilter, // the typed query and chosen category
): Item[] { // the matching items
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean) // blank input gives no words
  return items.filter( // keep the matching items
    (item) => // the item under test
      (filter.category === null || item.category === filter.category) && // the category
      words.every((word) => item.name.toLowerCase().includes(word)), // every word somewhere in the name
  )
}

/**
 * Lists the categories for the category filter.
 * @param items every item the shop lists
 * @return each category of a listed item, once, A to Z
 */
export function categoryNames(items: Item[]): string[] { // the items to take categories from
  return [
    // the option names
    ...new Set(items.map((item) => item.category)),
  ].sort(byText) // dedupe, then A to Z
}
