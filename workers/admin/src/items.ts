// Admin reads and the guarded save: pages of items for the list, and changes written only if the admin's view is still current.

import type { AdminItem, AdminMeta, AdminPage, ItemChange, SaveResult } from './admin-types' // The shared shapes.
import { CATEGORIES } from './categories' // The fixed category list.
import { encodeCursor, type ItemQuery } from './item-query' // The checked query and the cursor codec.
import { readSubcategories, subcategoryFits, type SubcategoryLists } from './subcategories' // The subcategory lists and the belongs check.

// Rows per page; one more is read to know whether another page exists.
const PAGE_SIZE = 50
// The columns the admin sees, in the shape of a raw row.
const COLUMNS = "id, name, category, subcategory_id AS subcategoryId, (SELECT name FROM subcategories WHERE id = items.subcategory_id) AS subcategory, status, stock, price_cents AS priceCents, image, issued_by = 'Club' AS clubAdded, created_at AS createdAt, modified_at AS modifiedAt" // The subcategory name comes from a primary-key subquery, so no JOIN makes a column ambiguous.
// The order of a list of named ids (the rows of a save).
const ORDER = 'ORDER BY name COLLATE NOCASE, id'
// A statement that raises "integer overflow" (the only way a batch statement can abort the batch) when its item no longer exists.
const MISSING_GUARD = 'SELECT CASE WHEN EXISTS (SELECT 1 FROM items WHERE id = ?) THEN 0 ELSE abs(-9223372036854775807 - 1) END'

// A row as D1 returns it: the Club flag is 0 or 1.
type RawItem = Omit<AdminItem, 'clubAdded'> & { clubAdded: number }

/**
 * Turns a raw row into the API shape.
 * @param row The row from D1.
 * @return The item with a real boolean.
 */
function toItem(row: RawItem): AdminItem {
  return { ...row, clubAdded: row.clubAdded === 1 } // Only the flag changes.
}

/**
 * Builds the SQL and bound values of one page of the list.
 * @param query The checked query.
 * @return The statement text and its values; it reads 51 rows, in an index's own order.
 */
export function pageSql(query: ItemQuery): { sql: string; params: (string | number)[] } {
  const timeColumn = query.sort === 'newest' ? 'created_at' : 'modified_at' // Used by the two time sorts.
  const where: string[] = [] // AND-ed conditions.
  const params: (string | number)[] = [] // Their values, in order.
  if (query.category !== null) { // The category filter.
    where.push('category = ?') // The category condition.
    params.push(query.category) // Its value.
  }
  for (const word of query.words) { // Every word must be in the name; instr takes `%` and `_` literally.
    where.push('instr(lower(name), ?) > 0') // One word condition.
    params.push(word) // Its value.
  }
  const { cursor } = query // Where the page starts.
  if (cursor !== null && query.sort === 'name') { // Name order continues after (name, id).
    where.push('name COLLATE NOCASE >= ?', '(name COLLATE NOCASE, id) > (?, ?)') // The first line bounds the index range.
    params.push(cursor.name, cursor.name, cursor.id)
  } else if (cursor !== null) { // Time order continues after (time desc, name, id).
    where.push(`${timeColumn} <= ?`, `(${timeColumn} < ? OR (${timeColumn} = ? AND (name COLLATE NOCASE, id) > (?, ?)))`) // The first line bounds the index range.
    params.push(cursor.time as string, cursor.time as string, cursor.time as string, cursor.name, cursor.id) // Checked by decodeCursor.
  }
  const order = query.sort === 'name' ? 'name COLLATE NOCASE, id' : `${timeColumn} DESC, name COLLATE NOCASE, id` // The order each index holds.
  const clause = where.length === 0 ? '' : ` WHERE ${where.join(' AND ')}` // No WHERE when nothing filters.
  return { sql: `SELECT ${COLUMNS} FROM items${clause} ORDER BY ${order} LIMIT ${PAGE_SIZE + 1}`, params } // Values only ever bound, never joined in.
}

/**
 * Reads one page of the list, hidden items included.
 * @param db The D1 database.
 * @param query The checked query.
 * @return Up to 50 items in the requested order and a cursor for the next page, or null at the end.
 */
export async function readAdminPage(db: D1Database, query: ItemQuery): Promise<AdminPage> {
  const { sql, params } = pageSql(query) // The statement.
  const { results } = await db.prepare(sql).bind(...params).all<RawItem>() // Up to 51 rows.
  const items = results.slice(0, PAGE_SIZE).map(toItem) // The page itself.
  const last = items[items.length - 1] // The row the next page follows.
  if (results.length <= PAGE_SIZE || last === undefined) return { items, nextCursor: null } // That was the end.
  const time = query.sort === 'newest' ? last.createdAt : last.modifiedAt // The sort's time.
  return { items, nextCursor: encodeCursor(query.sort, query.sort === 'name' ? { name: last.name, id: last.id } : { time, name: last.name, id: last.id }) } // More follow.
}

/**
 * Reads the settings the Add sheet needs, the category list and the subcategories of each.
 * @param db The D1 database.
 * @return The meta answer.
 * @throws Error when the settings row is missing.
 */
export async function readMeta(db: D1Database): Promise<AdminMeta> {
  const row = await db.prepare('SELECT currency, default_price_cents AS defaultPriceCents FROM settings WHERE id = 1').first<{ currency: string; defaultPriceCents: number }>() // The single row.
  if (row === null) throw new Error('settings-missing') // Surfaces as a 500 with a short code.
  return { currency: row.currency, defaultPriceCents: row.defaultPriceCents, categories: [...CATEGORIES], subcategories: await readSubcategories(db) } // A copy of the names, so no caller edits the list.
}

/**
 * Reads items by id for the admin, hidden ones included.
 * @param db The D1 database.
 * @param ids The ids to read; ids that do not exist are absent from the answer.
 * @return The items in name order.
 */
export async function readAdminItems(db: D1Database, ids: string[]): Promise<AdminItem[]> {
  const { results } = await db.prepare(`SELECT ${COLUMNS} FROM items WHERE id IN (SELECT value FROM json_each(?)) ${ORDER}`).bind(JSON.stringify(ids)).all<RawItem>() // One parameter whatever the count.
  return results.map(toItem) // In list order.
}

/**
 * Tells whether a stored item differs from what a change says the admin saw.
 * @param item The stored row.
 * @param change The requested change.
 * @return True when any changed field's `from` is no longer the stored value.
 */
function isStale(item: AdminItem, change: ItemChange): boolean {
  return ( // Any one field moving makes the whole row stale.
    (change.stock !== undefined && change.stock.from !== item.stock) || // Stock moved.
    (change.status !== undefined && change.status.from !== item.status) || // Status moved.
    (change.name !== undefined && change.name.from !== item.name) || // Name moved.
    (change.category !== undefined && change.category.from !== item.category) || // Category moved.
    (change.subcategoryId !== undefined && change.subcategoryId.from !== item.subcategoryId) || // Subcategory moved.
    (change.priceCents !== undefined && change.priceCents.from !== item.priceCents) // Price moved.
  )
}

/**
 * Finds the items whose stored values differ from what the admin saw.
 * @param current The current rows of the changed items.
 * @param changes The requested changes.
 * @return The current rows that no longer match their `from` values.
 */
function mismatched(current: AdminItem[], changes: ItemChange[]): AdminItem[] {
  const byId = new Map(changes.map((change) => [change.id, change])) // Change per id.
  return current.filter((item) => { // Keep the stale ones.
    const change = byId.get(item.id) // This item's change.
    return change !== undefined && isStale(item, change) // Only changed items count.
  })
}

/**
 * Tells whether every changed field of every item already holds its wanted `to` value.
 * @param current The current rows of the changed items.
 * @param changes The requested changes.
 * @return True when all changes are already stored.
 */
function allApplied(current: AdminItem[], changes: ItemChange[]): boolean {
  const byId = new Map(current.map((item) => [item.id, item])) // Row per id.
  return changes.every((change) => { // Every change must be applied.
    const item = byId.get(change.id) // The stored row.
    return ( // Compare to the stored row.
      item !== undefined && // The row must exist.
      (change.stock === undefined || change.stock.to === item.stock) && // Stock is applied.
      (change.status === undefined || change.status.to === item.status) && // Status is applied.
      (change.name === undefined || change.name.to === item.name) && // Name is applied.
      (change.category === undefined || change.category.to === item.category) && // Category is applied.
      (change.subcategoryId === undefined || change.subcategoryId.to === item.subcategoryId) && // Subcategory is applied.
      (change.priceCents === undefined || change.priceCents.to === item.priceCents) // Every changed field equals `to`.
    )
  })
}

/**
 * Finds the items whose changed subcategory does not belong to the category the item will have.
 * @param current The current rows of the changed items.
 * @param changes The requested changes.
 * @param lists The subcategories read in the same request.
 * @return The current rows whose wanted subcategory is unknown or from another category.
 */
function misfits(current: AdminItem[], changes: ItemChange[], lists: SubcategoryLists): AdminItem[] { // Pure check on rows already read.
  const byId = new Map(changes.map((change) => [change.id, change])) // Change per id.
  return current.filter((item) => { // Keep the misfits.
    const to = byId.get(item.id)?.subcategoryId?.to // The wanted subcategory, if the change sets one.
    if (to === undefined) return false // This change leaves the subcategory alone.
    return !subcategoryFits(lists, byId.get(item.id)?.category?.to ?? item.category, to) // Checked against the new category when it changes too.
  })
}

/**
 * Merges the stale rows and the misfits into one list, in the order of the current rows.
 * @param current The current rows of the changed items.
 * @param changes The requested changes.
 * @param lists The subcategories read in the same request.
 * @return The current rows that are stale or misfit, each once.
 */
function refused(current: AdminItem[], changes: ItemChange[], lists: SubcategoryLists): AdminItem[] { // Stale plus misfit.
  const bad = new Set([...mismatched(current, changes), ...misfits(current, changes, lists)].map((item) => item.id)) // Ids of either kind.
  return current.filter((item) => bad.has(item.id)) // Each once, in read order.
}

/**
 * Builds the guarded UPDATE of one item: a field whose value moved since the read breaks a CHECK.
 * @param db The D1 database.
 * @param change The change.
 * @param now The request's time, written as modified_at.
 * @return The prepared, bound statement.
 */
function guardedUpdate(db: D1Database, change: ItemChange, now: string): D1PreparedStatement {
  const sets: string[] = [] // SET clauses.
  const values: (string | number | null)[] = [] // Their bound values, in order.
  if (change.stock !== undefined) { // A stock change.
    sets.push('stock = CASE WHEN stock = ? THEN ? ELSE -1 END') // -1 trips the stock CHECK.
    values.push(change.stock.from, change.stock.to) // Bound in clause order.
  }
  if (change.status !== undefined) { // A status change.
    sets.push("status = CASE WHEN status = ? THEN ? ELSE 'changed' END") // 'changed' trips the status CHECK.
    values.push(change.status.from, change.status.to) // Bound in clause order.
  }
  if (change.name !== undefined) { // A name change.
    sets.push("name = CASE WHEN name = ? THEN ? ELSE '' END") // '' trips the name CHECK.
    values.push(change.name.from, change.name.to) // Bound in clause order.
  }
  if (change.category !== undefined) { // A category change.
    sets.push("category = CASE WHEN category = ? THEN ? ELSE '' END") // '' trips the category CHECK.
    values.push(change.category.from, change.category.to) // Bound in clause order.
  }
  if (change.subcategoryId !== undefined) { // A subcategory change.
    const { from, to } = change.subcategoryId // The guard and the target.
    sets.push('subcategory_id = CASE WHEN subcategory_id IS ? THEN (CASE WHEN ? IS NULL OR EXISTS (SELECT 1 FROM subcategories s WHERE s.id = ? AND s.category = COALESCE(?, items.category)) THEN ? ELSE 0 END) ELSE 0 END') // 0 is no subcategory, so the foreign key aborts the batch when the guard or the belongs check fails.
    values.push(from, to, to, change.category?.to ?? null, to) // Bound in clause order; the new category when it changes in the same change.
  } else if (change.category !== undefined) { // Only the category changes: keep a subcategory that still fits, else clear it.
    sets.push('subcategory_id = CASE WHEN EXISTS (SELECT 1 FROM subcategories s WHERE s.id = items.subcategory_id AND s.category = ?) THEN subcategory_id ELSE NULL END') // The old row's subcategory against the new category.
    values.push(change.category.to) // Bound in clause order.
  }
  if (change.priceCents !== undefined) { // A price change.
    sets.push('price_cents = CASE WHEN price_cents = ? THEN ? ELSE -1 END') // -1 trips the price CHECK.
    values.push(change.priceCents.from, change.priceCents.to) // Bound in clause order.
  }
  sets.push('modified_at = ?') // Every admin edit stamps the time; an order's stock drop does not go through here.
  values.push(now) // One time per request.
  return db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).bind(...values, change.id) // Values first, then the id.
}

/**
 * Finds the changes whose new name another item already holds, ignoring case.
 * @param db The D1 database.
 * @param changes The requested changes.
 * @return The ids of those changes.
 */
async function nameTakenIds(db: D1Database, changes: ItemChange[]): Promise<string[]> {
  const taken: string[] = [] // Ids whose name is taken.
  for (const change of changes) { // Each rename.
    if (change.name === undefined) continue // Not a rename.
    const holder = await db.prepare('SELECT 1 AS held FROM items WHERE name = ? COLLATE NOCASE AND id <> ?').bind(change.name.to, change.id).first() // Another row with that name.
    if (holder !== null) taken.push(change.id) // Taken.
  }
  return taken // The ids.
}

/**
 * Finds renames that would give two items one name in the same save, ignoring case.
 * @param changes The requested changes.
 * @return The ids of those renames, in change order.
 */
function duplicateNameIds(changes: ItemChange[]): string[] {
  const renames = changes.filter((change) => change.name !== undefined) // Only renames.
  const counts = new Map<string, number>() // New name, folded, to how many renames want it.
  for (const change of renames) counts.set(change.name!.to.toLowerCase(), (counts.get(change.name!.to.toLowerCase()) ?? 0) + 1) // Count per name (stricter than the index's ASCII fold, never looser).
  return renames.filter((change) => counts.get(change.name!.to.toLowerCase())! > 1).map((change) => change.id) // The ones that share.
}

/**
 * Saves changes all or nothing, refusing any whose `from` is no longer the stored value.
 * @param db The D1 database.
 * @param now The request's time, written as modified_at of every saved row.
 * @param changes The validated changes.
 * @return `saved` with the new rows; `conflict` with the current rows of the mismatched items and the ids that are gone; or `name-taken`. Nothing is written unless `saved`.
 */
export async function saveItemChanges(db: D1Database, now: string, changes: ItemChange[]): Promise<SaveResult> {
  const ids = changes.map((change) => change.id) // Ids to read.
  const current = await readAdminItems(db, ids) // The first read.
  const present = new Set(current.map((item) => item.id)) // Ids that exist.
  const gone = ids.filter((id) => !present.has(id)) // Deleted by another admin.
  const stale = refused(current, changes, await readSubcategories(db)) // Rows that moved since the admin's view, or whose wanted subcategory does not fit.
  if (stale.length > 0 || gone.length > 0) return { kind: 'conflict', items: stale, deletedIds: gone } // Nothing written.
  const duplicated = duplicateNameIds(changes) // Two renames to one name in this save.
  if (duplicated.length > 0) return { kind: 'name-taken', ids: duplicated } // Refused before any write.
  try { // The write.
    await db.batch([...ids.map((id) => db.prepare(MISSING_GUARD).bind(id)), ...changes.map((change) => guardedUpdate(db, change, now))]) // One transaction: a tripped CHECK or a missing row rolls back all.
  } catch (error) { // The write failed.
    const after = await readAdminItems(db, ids) // The rows as they are now.
    const afterIds = new Set(after.map((item) => item.id)) // Ids that still exist.
    const goneNow = ids.filter((id) => !afterIds.has(id)) // Deleted after the read.
    if (goneNow.length > 0) return { kind: 'conflict', items: refused(after, changes, await readSubcategories(db)), deletedIds: goneNow } // A conflict, nothing written.
    if (allApplied(after, changes)) return { kind: 'saved', items: after } // The write landed and only the answer was lost.
    const movedNow = refused(after, changes, await readSubcategories(db)) // Was it a row that moved after the read, or a subcategory that no longer fits?
    if (movedNow.length > 0) return { kind: 'conflict', items: movedNow, deletedIds: [] } // Yes: a conflict, nothing written.
    const taken = await nameTakenIds(db, changes) // Was it a name another item holds? A swap lands here too: the batch checks the unique index per statement, so a rename onto a name another row is leaving in the same save is refused, and the admin renames through a temporary name in two saves.
    if (taken.length > 0) return { kind: 'name-taken', ids: taken } // Yes.
    throw error // No: a real failure, for the handler to answer 500.
  }
  return { kind: 'saved', items: await readAdminItems(db, ids) } // The rows as saved.
}
