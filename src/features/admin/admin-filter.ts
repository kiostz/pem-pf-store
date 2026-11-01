// The admin items filter: search words and category over every item, Hidden ones included, as plain functions.

import type { AdminHonor } from '../../../workers/admin/src/admin-types.ts' // the row shape

// What the admin typed and picked; a null category is All categories.
export type AdminFilter = { query: string; category: string | null }

/**
 * Keeps the rows that match every search word and the category.
 * @param honors every row
 * @param filter the typed query and chosen category
 * @return the matching rows in their input order
 */
export function filterAdminHonors(
  honors: AdminHonor[],
  filter: AdminFilter,
): AdminHonor[] {
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean) // blank input gives no words
  return honors.filter(
    (honor) =>
      (filter.category === null || honor.category === filter.category) && // the category
      words.every((word) => honor.name.toLowerCase().includes(word)), // every word somewhere in the name
  )
}

/**
 * Lists the categories for the filter.
 * @param honors every row
 * @return each category once, A to Z
 */
export function adminCategoryNames(honors: AdminHonor[]): string[] {
  return [...new Set(honors.map((honor) => honor.category))].sort((a, b) =>
    a.localeCompare(b, 'en'),
  ) // all rows count, Hidden too
}
