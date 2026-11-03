// Deletes a Club-added honor, only if it is still the row the admin saw; built-in honors are never deleted.

import type { AdminHonor, DeleteRequest } from './admin-types' // The shapes.
import { readAdminHonors } from './honors' // Reads the current row.

// The outcome of a Delete.
export type DeleteResult =
  | { kind: 'deleted' } // Gone now, or already gone.
  | { kind: 'built-in' } // Not Club-added.
  | { kind: 'conflict'; honors: AdminHonor[] } // The row changed since the admin saw it; nothing deleted.

/**
 * Tells whether a stored row is exactly what the admin saw, including the stock a sale lowers without touching modified_at.
 * @param honor The stored row.
 * @param seen The admin's view.
 * @return True when every guard field matches.
 */
function matches(honor: AdminHonor, seen: DeleteRequest['seen']): boolean {
  return (
    honor.name === seen.name && // Name.
    honor.category === seen.category && // Category.
    honor.priceCents === seen.priceCents && // Price.
    honor.status === seen.status && // Status.
    honor.stock === seen.stock && // Stock, which a sale lowers without touching the time.
    honor.modifiedAt === seen.modifiedAt // The last edit.
  ) // Every field.
}

/**
 * Deletes a Club-added honor guarded by the row as seen.
 * @param db The D1 database.
 * @param request The checked request.
 * @return `deleted` (also when already gone), `built-in`, or `conflict` with the current row.
 */
export async function deleteHonor(db: D1Database, request: DeleteRequest): Promise<DeleteResult> {
  const [current] = await readAdminHonors(db, [request.id]) // The stored row, if any.
  if (current === undefined) return { kind: 'deleted' } // Already gone: the goal is met.
  if (!current.clubAdded) return { kind: 'built-in' } // Never deleted.
  if (!matches(current, request.seen)) return { kind: 'conflict', honors: [current] } // Changed since viewing.
  const { seen } = request // The guard values.
  const result = await db
    .prepare("DELETE FROM honors WHERE id = ? AND issued_by = 'Club' AND name = ? AND category = ? AND price_cents = ? AND status = ? AND stock = ? AND modified_at = ?")
    .bind(request.id, seen.name, seen.category, seen.priceCents, seen.status, seen.stock, seen.modifiedAt)
    .run() // The same guard again, in the statement itself, so a change after the read still stops it.
  if (result.meta.changes === 1) return { kind: 'deleted' } // Deleted.
  const [after] = await readAdminHonors(db, [request.id]) // Why not: gone, or changed just now.
  return after === undefined ? { kind: 'deleted' } : { kind: 'conflict', honors: [after] } // Gone is fine.
}
