// Adds a Club-added item: Hidden, stock 0, a slug id with a -2..-9 suffix on a clash, both times set to the request time.

import type { AdminItem, NewItem } from './admin-types' // The shapes.
import { itemIdFromName } from './item-id-from-name' // The id rule.
import { readAdminItems } from './items' // Reads the new row back.

// The outcome of an Add.
export type AddResult =
  | { kind: 'added'; item: AdminItem } // The new row.
  | { kind: 'name-taken' } // Another item has this name, in any case.
  | { kind: 'id-taken' } // The id and its eight suffixes are all taken.

/**
 * Tells why D1 refused a write: its message plus the SQLite reason it keeps in the cause.
 * @param error The thrown value.
 * @return Text to look in; never logged.
 */
function reasonOf(error: unknown): string {
  return error instanceof Error ? `${error.message} ${String(error.cause ?? '')}` : '' // Both places D1 puts it.
}

/**
 * Inserts a new Club-added item, trying the id and then `-2` to `-9`.
 * @param db The D1 database.
 * @param input The checked name, category and price.
 * @param now The request's time, written as created_at and modified_at.
 * @return The new row, or why it was not added.
 */
export async function addItem(db: D1Database, input: NewItem, now: string): Promise<AddResult> {
  const base = itemIdFromName(input.name) // The id the name makes.
  for (let attempt = 1; attempt <= 9; attempt++) { // The id, then -2 to -9.
    const id = attempt === 1 ? base : `${base}-${attempt}` // This attempt's id.
    try { // A clash throws.
      await db
        .prepare("INSERT INTO items (id, name, category, issued_by, status, stock, price_cents, created_at, modified_at) VALUES (?, ?, ?, 'Club', 'hidden', 0, ?, ?, ?)")
        .bind(id, input.name, input.category, input.priceCents, now, now)
        .run() // Hidden, stock 0, issued by the Club.
    } catch (error) { // Refused.
      const reason = reasonOf(error) // Why.
      if (!reason.includes('UNIQUE')) throw error // A real failure.
      if (reason.includes('items.id')) continue // The id is taken: try the next suffix.
      return { kind: 'name-taken' } // The unique name index.
    }
    return { kind: 'added', item: (await readAdminItems(db, [id]))[0] } // Read back with its times.
  }
  return { kind: 'id-taken' } // Nine ids used.
}
