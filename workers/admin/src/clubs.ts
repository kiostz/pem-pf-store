// Club reads and writes for the admin: each write is guarded by what the admin saw, answers the whole list, and never touches an order.

import type { AdminClub, ClubEdit, ClubFields, ClubOrder, ClubRemove, ClubResult } from './admin-types' // The shapes.

// The columns the admin sees, in the shape of a club.
const COLUMNS = 'id, name, area, language, location, church_name AS churchName'

/**
 * Reads every club in shown order.
 * @param db The D1 database.
 * @return The clubs by position, then id.
 */
export async function readAdminClubs(db: D1Database): Promise<AdminClub[]> {
  return (await db.prepare(`SELECT ${COLUMNS} FROM clubs ORDER BY position, id`).all<AdminClub>()).results // Nulls stay null.
}

/**
 * Tells whether a club's stored fields equal the given ones.
 * @param club The stored club.
 * @param fields The fields to compare.
 * @return True when every field matches.
 */
function holds(club: AdminClub, fields: ClubFields): boolean {
  return club.name === fields.name && club.area === fields.area && club.language === fields.language && club.location === fields.location && club.churchName === fields.churchName // Field by field.
}

/**
 * Tells whether another club holds a name, ignoring case.
 * @param db The D1 database.
 * @param name The name.
 * @param exceptId The club that may keep its own name (0 for none).
 * @return True when another club has it.
 */
async function nameHeld(db: D1Database, name: string, exceptId: number): Promise<boolean> {
  return (await db.prepare('SELECT 1 AS held FROM clubs WHERE name = ? COLLATE NOCASE AND id <> ?').bind(name, exceptId).first()) !== null // Another row with that name.
}

/**
 * Tells whether an error is the clubs table's UNIQUE name error (a race lost after the check).
 * @param error The thrown value.
 * @return True for a UNIQUE failure.
 */
function isUniqueError(error: unknown): boolean {
  return error instanceof Error && /UNIQUE/i.test(error.message) // D1 puts the constraint in the message.
}

/**
 * Adds a club last in the list.
 * @param db The D1 database.
 * @param fields The checked fields.
 * @return `saved` with the list, or `name-taken` with nothing written.
 */
export async function addClub(db: D1Database, fields: ClubFields): Promise<ClubResult> {
  if (await nameHeld(db, fields.name, 0)) return { kind: 'name-taken' } // Refused before any write.
  try { // The write.
    await db.prepare('INSERT INTO clubs (name, area, language, location, church_name, position) VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM clubs))').bind(fields.name, fields.area, fields.language, fields.location, fields.churchName).run() // Last position.
  } catch (error) { // A race may have taken the name.
    if (isUniqueError(error)) return { kind: 'name-taken' } // The exact-case UNIQUE.
    throw error // A real failure, for the handler to answer 500.
  }
  return { kind: 'saved', clubs: await readAdminClubs(db) } // The list as saved.
}

/**
 * Edits a club if it is still what the admin saw.
 * @param db The D1 database.
 * @param edit The checked edit.
 * @return `saved`; `conflict` with the current list; or `name-taken`. Nothing is written unless `saved`.
 */
export async function editClub(db: D1Database, edit: ClubEdit): Promise<ClubResult> {
  const { id, from, to } = edit // What was seen and wanted.
  const row = (await readAdminClubs(db)).find((club) => club.id === id) // The stored club.
  if (row !== undefined && holds(row, to)) return { kind: 'saved', clubs: await readAdminClubs(db) } // A retry after a lost answer.
  if (row === undefined || !holds(row, from)) return { kind: 'conflict', clubs: await readAdminClubs(db) } // Gone or changed.
  if (await nameHeld(db, to.name, id)) return { kind: 'name-taken' } // Another club has the name.
  try { // The guarded write: every field compared with IS so nulls match.
    const result = await db.prepare('UPDATE clubs SET name = ?, area = ?, language = ?, location = ?, church_name = ? WHERE id = ? AND name IS ? AND area IS ? AND language IS ? AND location IS ? AND church_name IS ?').bind(to.name, to.area, to.language, to.location, to.churchName, id, from.name, from.area, from.language, from.location, from.churchName).run() // One statement, atomic.
    if (result.meta.changes === 0) return { kind: 'conflict', clubs: await readAdminClubs(db) } // Moved after the read.
  } catch (error) { // A race may have taken the name.
    if (isUniqueError(error)) return { kind: 'name-taken' } // The exact-case UNIQUE.
    throw error // A real failure.
  }
  return { kind: 'saved', clubs: await readAdminClubs(db) } // The list as saved.
}

/**
 * Removes a club if it is still what the admin saw; orders keep their club text.
 * @param db The D1 database.
 * @param remove The checked removal.
 * @return `saved` (also when already gone) or `conflict` with the current list.
 */
export async function removeClub(db: D1Database, remove: ClubRemove): Promise<ClubResult> {
  const { id, seen } = remove // What was seen.
  const row = (await readAdminClubs(db)).find((club) => club.id === id) // The stored club.
  if (row !== undefined && !holds(row, seen)) return { kind: 'conflict', clubs: await readAdminClubs(db) } // Changed since viewing.
  const result = row === undefined ? null : await db.prepare('DELETE FROM clubs WHERE id = ? AND name IS ? AND area IS ? AND language IS ? AND location IS ? AND church_name IS ?').bind(id, seen.name, seen.area, seen.language, seen.location, seen.churchName).run() // Guarded delete.
  const clubs = await readAdminClubs(db) // The list now.
  if (result !== null && result.meta.changes === 0 && clubs.some((club) => club.id === id)) return { kind: 'conflict', clubs } // Moved after the read.
  return { kind: 'saved', clubs } // Removed, or already gone.
}

/**
 * Tells whether a list holds exactly these ids in this order.
 * @param clubs The list.
 * @param ids The ids.
 * @return True when equal.
 */
function inOrder(clubs: { id: number }[], ids: number[]): boolean {
  return clubs.length === ids.length && clubs.every((club, index) => club.id === ids[index]) // Same order.
}

/**
 * Renumbers the clubs 1..n in the wanted order if the list is still what the admin saw.
 * @param db The D1 database.
 * @param order The checked reorder.
 * @return `saved`, or `conflict` with the current list and nothing written.
 */
export async function reorderClubs(db: D1Database, order: ClubOrder): Promise<ClubResult> {
  const rows = (await db.prepare('SELECT id, position FROM clubs ORDER BY position, id').all<{ id: number; position: number }>()).results // One read: the order checked and the positions guarded come from the same rows.
  const seenAt = new Map(rows.map((row) => [row.id, row.position])) // Id to the position read.
  if (inOrder(rows, order.to)) return { kind: 'saved', clubs: await readAdminClubs(db) } // A retry after a lost answer.
  if (!inOrder(rows, order.from)) return { kind: 'conflict', clubs: await readAdminClubs(db) } // Added, removed or moved since viewing.
  try { // All or nothing.
    await db.batch([
      db.prepare('SELECT CASE WHEN (SELECT count(*) FROM clubs) = ? THEN 0 ELSE abs(-9223372036854775807 - 1) END').bind(order.to.length), // A club added or removed since the read trips this ("integer overflow" is the only way a batch statement can abort the batch).
      ...order.to.map((id) => db.prepare('SELECT CASE WHEN EXISTS (SELECT 1 FROM clubs WHERE id = ?) THEN 0 ELSE abs(-9223372036854775807 - 1) END').bind(id)), // A club that vanished trips this.
      ...order.to.map((id, index) => db.prepare('UPDATE clubs SET position = CASE WHEN position = ? THEN ? ELSE NULL END WHERE id = ?').bind(seenAt.get(id), index + 1, id)), // A moved row gets NULL, which trips NOT NULL.
    ]) // One transaction.
  } catch (error) { // The write failed.
    const after = await readAdminClubs(db) // The list as it is now.
    if (inOrder(after, order.to)) return { kind: 'saved', clubs: after } // The write landed and only the answer was lost.
    if (!inOrder(after, order.from)) return { kind: 'conflict', clubs: after } // Another change got in first; nothing written.
    throw error // A real failure.
  }
  return { kind: 'saved', clubs: await readAdminClubs(db) } // The list as saved.
}
