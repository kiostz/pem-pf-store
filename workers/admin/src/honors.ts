// Admin reads and the guarded save: all honors for the list, and changes written only if the admin's view is still current.

import type { AdminHonor, HonorChange, SaveResult } from './admin-types' // The shared shapes.

// Thrown when a save names an id that is not in the database.
export class UnknownHonorError extends Error { // Marks a client error.
  /** @param count How many ids were unknown. */
  constructor(count: number) { // Message holds a count.
    super(`unknown-honors:${count}`) // A count only, never the ids.
    this.name = 'UnknownHonorError' // Logged by class.
  }
}

// The columns the admin sees, in AdminHonor shape.
const COLUMNS = 'id, name, category, status, stock'
// The list order: names ignoring case, ties by id.
const ORDER = 'ORDER BY name COLLATE NOCASE, id'

/**
 * Reads honors for the admin, hidden ones included.
 * @param db The D1 database.
 * @param ids Only these ids; every honor when omitted.
 * @return The honors in name order.
 */
export async function readAdminHonors(db: D1Database, ids?: string[]): Promise<AdminHonor[]> {
  const statement = // Pick the statement.
    ids === undefined // No id list means everything.
      ? db.prepare(`SELECT ${COLUMNS} FROM honors ${ORDER}`) // Everything.
      : db.prepare(`SELECT ${COLUMNS} FROM honors WHERE id IN (SELECT value FROM json_each(?)) ${ORDER}`).bind(JSON.stringify(ids)) // One parameter whatever the count.
  const { results } = await statement.all<AdminHonor>() // Rows typed as the response.
  return results // In list order.
}

/**
 * Finds the honors whose stored values differ from what the admin saw.
 * @param current The current rows of the changed honors.
 * @param changes The requested changes.
 * @return The current rows that no longer match their `from` values.
 */
function mismatched(current: AdminHonor[], changes: HonorChange[]): AdminHonor[] {
  const byId = new Map(changes.map((change) => [change.id, change])) // Change per id.
  return current.filter((honor) => { // Keep the stale ones.
    const change = byId.get(honor.id) // This honor's change.
    return ( // Compare to the change.
      change !== undefined && // Only changed honors count.
      ((change.stock !== undefined && change.stock.from !== honor.stock) || // Stock differs.
        (change.status !== undefined && change.status.from !== honor.status)) // Either field differs.
    )
  })
}

/**
 * Tells whether every changed field of every honor already holds its wanted `to` value.
 * @param current The current rows of the changed honors.
 * @param changes The requested changes.
 * @return True when all changes are already stored.
 */
function allApplied(current: AdminHonor[], changes: HonorChange[]): boolean {
  const byId = new Map(current.map((honor) => [honor.id, honor])) // Row per id.
  return changes.every((change) => { // Every change must be applied.
    const honor = byId.get(change.id) // The stored row.
    return ( // Compare to the stored row.
      honor !== undefined && // The row must exist.
      (change.stock === undefined || change.stock.to === honor.stock) && // Stock is applied.
      (change.status === undefined || change.status.to === honor.status) // Every changed field equals `to`.
    )
  })
}

/**
 * Builds the guarded UPDATE of one honor: a field whose value moved since the read breaks a CHECK.
 * @param db The D1 database.
 * @param change The change.
 * @return The prepared, bound statement.
 */
function guardedUpdate(db: D1Database, change: HonorChange): D1PreparedStatement {
  const sets: string[] = [] // SET clauses.
  const values: (string | number)[] = [] // Their bound values, in order.
  if (change.stock !== undefined) { // A stock change.
    sets.push('stock = CASE WHEN stock = ? THEN ? ELSE -1 END') // -1 trips the stock CHECK.
    values.push(change.stock.from, change.stock.to) // Bound in clause order.
  }
  if (change.status !== undefined) { // A status change.
    sets.push("status = CASE WHEN status = ? THEN ? ELSE 'changed' END") // 'changed' trips the status CHECK.
    values.push(change.status.from, change.status.to) // Bound in clause order.
  }
  return db.prepare(`UPDATE honors SET ${sets.join(', ')} WHERE id = ?`).bind(...values, change.id) // Values first, then the id.
}

/**
 * Saves changes all or nothing, refusing any whose `from` is no longer the stored value.
 * @param db The D1 database.
 * @param changes The validated changes.
 * @return `saved` with the new rows, or `conflict` with the current rows of the mismatched honors; nothing written on conflict.
 * @throws UnknownHonorError when an id is not in the database.
 */
export async function saveHonorChanges(db: D1Database, changes: HonorChange[]): Promise<SaveResult> {
  const ids = changes.map((change) => change.id) // Ids to read.
  const current = await readAdminHonors(db, ids) // The first read.
  if (current.length !== ids.length) throw new UnknownHonorError(ids.length - current.length) // Ids are unique, so a short read means unknown ids.
  const stale = mismatched(current, changes) // Rows that moved since the admin's view.
  if (stale.length > 0) return { kind: 'conflict', honors: stale } // Nothing written.
  try { // The write.
    await db.batch(changes.map((change) => guardedUpdate(db, change))) // One transaction: a tripped CHECK rolls back all.
  } catch (error) { // The write failed.
    const now = await readAdminHonors(db, ids) // The rows as they are now.
    if (allApplied(now, changes)) return { kind: 'saved', honors: now } // The write landed and only the answer was lost.
    const after = mismatched(now, changes) // Was it a row that moved after the read?
    if (after.length > 0) return { kind: 'conflict', honors: after } // Yes: a conflict, nothing written.
    throw error // No: a real failure, for the handler to answer 500.
  }
  return { kind: 'saved', honors: await readAdminHonors(db, ids) } // The rows as saved.
}
