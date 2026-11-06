// Deletes a Club-added item, only if it is still the row the admin saw; built-in items are never deleted.

import type { AdminItem, DeleteRequest } from './admin-types' // The shapes.
import { readAdminItems } from './items' // Reads the current row.

// The outcome of a Delete.
export type DeleteResult =
  | { kind: 'deleted' } // Gone now, or already gone.
  | { kind: 'built-in' } // Not Club-added.
  | { kind: 'conflict'; items: AdminItem[] } // The row changed since the admin saw it; nothing deleted.

/**
 * Tells whether a stored row is exactly what the admin saw, including the stock a sale lowers without touching modified_at.
 * @param item The stored row.
 * @param seen The admin's view.
 * @return True when every guard field matches.
 */
function matches(item: AdminItem, seen: DeleteRequest['seen']): boolean {
  return (
    item.name === seen.name && // Name.
    item.category === seen.category && // Category.
    item.priceCents === seen.priceCents && // Price.
    item.status === seen.status && // Status.
    item.stock === seen.stock && // Stock, which a sale lowers without touching the time.
    item.modifiedAt === seen.modifiedAt // The last edit.
  ) // Every field.
}

/**
 * Deletes a Club-added item guarded by the row as seen.
 * @param db The D1 database.
 * @param bucket The picture bucket; the deleted item's picture object is removed from it.
 * @param request The checked request.
 * @return `deleted` (also when already gone), `built-in`, or `conflict` with the current row.
 */
export async function deleteItem(db: D1Database, bucket: R2Bucket, request: DeleteRequest): Promise<DeleteResult> {
  const [current] = await readAdminItems(db, [request.id]) // The stored row, if any.
  if (current === undefined) return { kind: 'deleted' } // Already gone: the goal is met.
  if (!current.clubAdded) return { kind: 'built-in' } // Never deleted.
  if (!matches(current, request.seen)) return { kind: 'conflict', items: [current] } // Changed since viewing.
  const { seen } = request // The guard values.
  const result = await db
    .prepare("DELETE FROM items WHERE id = ? AND issued_by = 'Club' AND name = ? AND category = ? AND price_cents = ? AND status = ? AND stock = ? AND modified_at = ?")
    .bind(request.id, seen.name, seen.category, seen.priceCents, seen.status, seen.stock, seen.modifiedAt)
    .run() // The same guard again, in the statement itself, so a change after the read still stops it.
  if (result.meta.changes === 1) { // Deleted.
    if (current.image !== null) await bucket.delete(current.image).catch((error: unknown) => console.error('picture cleanup failed', error instanceof Error ? error.name : 'unknown')) // Best effort; an orphan is harmless, and only the class is logged.
    return { kind: 'deleted' } // Done.
  }
  const [after] = await readAdminItems(db, [request.id]) // Why not: gone, or changed just now.
  return after === undefined ? { kind: 'deleted' } : { kind: 'conflict', items: [after] } // Gone is fine.
}
