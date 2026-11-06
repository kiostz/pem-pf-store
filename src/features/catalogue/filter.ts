// Search, category filter, Subcategory filter, the Shop's stock-first order and the Category label text for the catalogue, as plain functions so the screen only renders their result.

import type { Item } from '@/shared/data/types.ts' // the shape of one item
import { byText } from '@/shared/sort/sort-by-name.ts' // A to Z compare

// What the buyer has typed and picked; a null category is All categories, a null subcategory is All.
export type CatalogueFilter = { query: string; category: string | null; subcategory: string | null } // the query and the two picks

/**
 * Keeps the items that match the search words and the category.
 * @param items every item the shop lists
 * @param filter the typed query, the chosen category and the chosen subcategory (null for All)
 * @return the matching items in their input order
 */
export function filterItems(
  items: Item[], // every item the shop lists
  filter: CatalogueFilter, // the typed query, chosen category and subcategory
): Item[] { // the matching items
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean) // blank input gives no words
  return items.filter( // keep the matching items
    (item) => // the item under test
      (filter.category === null || item.category === filter.category) && // the category
      (filter.subcategory === null || item.subcategory === filter.subcategory) && // the subcategory
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

/**
 * Lists the chips of the Subcategory filter.
 * @param items every item the shop lists
 * @param category the picked category
 * @return each subcategory of a listed item in that category, once, A to Z; empty when there are none
 */
export function subcategoryNames(items: Item[], category: string): string[] { // the items and the picked category
  const names = items.filter((item) => item.category === category).map((item) => item.subcategory) // that category's subcategories
  return [...new Set(names.filter((name): name is string => name !== null))].sort(byText) // skip null, dedupe, then A to Z
}

/**
 * Puts the Shop's items in order: in stock first, then Sold out, each group A to Z.
 * @param items the items to order
 * @return a new array; the input is left as it was, and equal names keep their input order
 */
export function shopOrder(items: Item[]): Item[] { // the items to order
  const soldOut = (item: Item): number => (item.stock > 0 ? 0 : 1) // 0 sorts first: in stock before Sold out
  return [...items].sort((a, b) => soldOut(a) - soldOut(b) || byText(a.name, b.name)) // copy, then stock group, then A to Z
}

/**
 * Writes the text of a card's Category label.
 * @param item the item whose category and subcategory to show
 * @return "Honors · Nature", or the category alone when there is no subcategory
 */
export function categoryLabel(item: Pick<Item, 'category' | 'subcategory'>): string { // the fields the label needs
  return item.subcategory === null ? item.category : `${item.category} · ${item.subcategory}` // a middle dot with a space either side
}
