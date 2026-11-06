// Reads the subcategories per category and checks that a subcategory id belongs to a category, so an item never pairs with another category's subcategory.

import type { AdminMeta } from './admin-types' // The shared shapes.
import { CATEGORIES } from './categories' // The fixed category list.

// The subcategory lists as the meta answer carries them: every category has a key.
export type SubcategoryLists = AdminMeta['subcategories'] // One list per category.

/**
 * Reads every subcategory, grouped under each of the three categories.
 * @param db The D1 database.
 * @return A list per category name, A-Z ignoring case, empty when a category has none.
 */
export async function readSubcategories(db: D1Database): Promise<SubcategoryLists> { // One read of the whole table.
  const { results } = await db.prepare('SELECT id, category, name FROM subcategories ORDER BY name COLLATE NOCASE, id').all<{ id: number; category: string; name: string }>() // All rows, in list order.
  const lists: SubcategoryLists = Object.fromEntries(CATEGORIES.map((category) => [category, []])) // A key for every category.
  for (const row of results) lists[row.category]?.push({ id: row.id, name: row.name }) // A row under an unknown category is ignored.
  return lists // Grouped.
}

/**
 * Tells whether a subcategory id belongs to a category.
 * @param lists The lists read in the same request.
 * @param category The item's category.
 * @param subcategoryId The id to check, or null for none (always fits).
 * @return True for null, or when the category's list holds the id.
 */
export function subcategoryFits(lists: SubcategoryLists, category: string, subcategoryId: number | null): boolean { // Pure check on lists already read.
  return subcategoryId === null || (lists[category] ?? []).some((entry) => entry.id === subcategoryId) // Null always fits; else the id must be in that category's list.
}
