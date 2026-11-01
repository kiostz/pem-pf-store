// The admin's pending changes as plain functions: edits per field against what the admin saw, so counting, saving and rebasing never disagree.

import type {
  AdminHonor,
  HonorChange,
  HonorStatus,
} from '../../../workers/admin/src/admin-types.ts' // the row and change shapes

// Edits not yet saved, by honor id: only the fields that differ from the base.
export type PendingChanges = Record<
  string,
  { status?: HonorStatus; stock?: number }
>

/**
 * Sets or clears one field of one row, dropping the row when it has no edit left.
 * @param pending the edits so far
 * @param base the rows as the admin saw them
 * @param id the row's id
 * @param field which field
 * @param value the wanted value
 * @return a new pending object
 */
function setField<Field extends 'status' | 'stock'>(
  pending: PendingChanges, // the edits so far
  base: AdminHonor[], // the rows as seen
  id: string, // the row
  field: Field, // the field
  value: AdminHonor[Field], // the wanted value
): PendingChanges {
  const row = base.find((honor) => honor.id === id) // the row as the admin saw it
  if (row === undefined) return pending // an unknown row: nothing to edit
  const edits: Record<string, unknown> = { ...pending[id] } // a copy of the row's edits
  if (value === row[field])
    delete edits[field] // setting it back removes it
  else edits[field] = value // a real edit
  const others = { ...pending } // every row
  delete others[id] // the row is put back below, if it still has an edit
  return Object.keys(edits).length === 0
    ? others // an empty row goes
    : { ...others, [id]: edits as PendingChanges[string] } // the row with its edits
}

/**
 * Sets a row's status edit.
 * @param pending the edits so far
 * @param base the rows as seen
 * @param id the row's id
 * @param status the wanted status
 * @return a new pending object
 */
export const setStatus = (
  pending: PendingChanges,
  base: AdminHonor[],
  id: string,
  status: HonorStatus,
): PendingChanges => setField(pending, base, id, 'status', status) // the status field

/**
 * Sets a row's stock edit.
 * @param pending the edits so far
 * @param base the rows as seen
 * @param id the row's id
 * @param stock the wanted stock
 * @return a new pending object
 */
export const setStock = (
  pending: PendingChanges,
  base: AdminHonor[],
  id: string,
  stock: number,
): PendingChanges => setField(pending, base, id, 'stock', stock) // the stock field

/**
 * Counts the edited fields.
 * @param pending the edits
 * @return how many fields are edited, over all rows
 */
export const countChanges = (pending: PendingChanges): number =>
  Object.values(pending).reduce(
    (total, edits) => total + Object.keys(edits).length,
    0,
  ) // each field is one change

/**
 * Builds the request's changes.
 * @param pending the edits
 * @param base the rows as seen: the source of every `from`
 * @return one change per edited row
 */
export function toHonorChanges(
  pending: PendingChanges,
  base: AdminHonor[],
): HonorChange[] {
  return Object.entries(pending).flatMap(([id, edits]) => {
    const row = base.find((honor) => honor.id === id) // what the admin saw
    if (row === undefined) return [] // a row that is gone has nothing to send
    const change: HonorChange = { id } // the row's change
    if (edits.status !== undefined)
      change.status = { from: row.status, to: edits.status } // the status edit
    if (edits.stock !== undefined)
      change.stock = { from: row.stock, to: edits.stock } // the stock edit
    return [change] // one change for this row
  })
}

/**
 * Puts rows from the Worker over the base.
 * @param base the rows as seen
 * @param honors the rows to put over it, by id
 * @return a new base
 */
export function applySaved(
  base: AdminHonor[],
  honors: AdminHonor[],
): AdminHonor[] {
  const byId = new Map(honors.map((honor) => [honor.id, honor])) // the new rows
  return base.map((honor) => byId.get(honor.id) ?? honor) // replaced where given
}

/**
 * Drops every edit that already equals the base.
 * @param pending the edits
 * @param base the rows as seen
 * @return the edits that still differ
 */
export function prunePending(
  pending: PendingChanges,
  base: AdminHonor[],
): PendingChanges {
  let result: PendingChanges = {} // built field by field
  for (const [id, edits] of Object.entries(pending)) {
    if (edits.status !== undefined)
      result = setStatus(result, base, id, edits.status) // kept only if it differs
    if (edits.stock !== undefined)
      result = setStock(result, base, id, edits.stock) // kept only if it differs
  }
  return result
}

/**
 * Takes the current rows of a refused save as the new base and keeps the admin's edits.
 * @param base the rows as seen
 * @param pending the edits
 * @param current the current rows of the honors that no longer matched
 * @return the new base, the edits that still differ from it, and the ids to flag
 */
export function rebaseAfterConflict(
  base: AdminHonor[],
  pending: PendingChanges,
  current: AdminHonor[],
) {
  const nextBase = applySaved(base, current) // the current values are now what the admin saw
  return {
    base: nextBase, // the new base
    pending: prunePending(pending, nextBase), // an edit that is now true drops out
    conflictedIds: current.map((honor) => honor.id), // the rows to flag
  }
}
