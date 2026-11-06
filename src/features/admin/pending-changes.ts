// The admin's pending changes as plain functions: edits per field kept with a snapshot of the row as the admin saw it, so counting, saving and rebasing never disagree and a row off the loaded page keeps its `from`.

import type {
  AdminItem,
  ItemChange,
  ItemStatus,
} from '../../../workers/admin/src/admin-types.ts' // the row and change shapes

// The fields an admin edits.
export type ItemEdits = {
  name?: string // the new name
  category?: string // the new category
  priceCents?: number // the new price in whole cents
  status?: ItemStatus // the new status
  stock?: number // the new stock
}
// Edits not yet saved, by item id: the row as seen, and only the fields that differ from it.
export type PendingChanges = Record<
  string,
  { seen: AdminItem; edits: ItemEdits }
>

const FIELDS = ['name', 'category', 'priceCents', 'status', 'stock'] as const // every editable field, in the request's order

/**
 * Sets or clears one field of one row, dropping the row when it has no edit left.
 * @param pending the edits so far
 * @param row the row as shown now; it becomes the snapshot only when the row has no edit yet
 * @param field which field
 * @param value the wanted value
 * @return a new pending object
 */
export function setEdit<Field extends keyof ItemEdits>(
  pending: PendingChanges, // the edits so far
  row: AdminItem, // the row as shown
  field: Field, // the field
  value: AdminItem[Field], // the wanted value
): PendingChanges {
  const seen = pending[row.id]?.seen ?? row // the first view is the snapshot
  const edits: ItemEdits = { ...pending[row.id]?.edits } // a copy of the row's edits
  if (value === seen[field])
    delete edits[field] // setting it back removes it
  else (edits as Record<string, unknown>)[field] = value // a real edit
  const others = { ...pending } // every row
  delete others[row.id] // put back below, if it still has an edit
  return Object.keys(edits).length === 0
    ? others
    : { ...others, [row.id]: { seen, edits } } // an empty row goes
}

/**
 * Counts the edited fields.
 * @param pending the edits
 * @return how many fields are edited, over all rows
 */
export const countChanges = (pending: PendingChanges): number =>
  Object.values(pending).reduce(
    (total, entry) => total + Object.keys(entry.edits).length,
    0,
  ) // each field is one change

/**
 * Builds the request's changes.
 * @param pending the edits
 * @return one change per edited row, each `from` taken from the snapshot
 */
export function toItemChanges(pending: PendingChanges): ItemChange[] {
  return Object.entries(pending).map(([id, { seen, edits }]) => {
    const change: Record<string, unknown> = { id } // the row's change
    for (const field of FIELDS)
      if (edits[field] !== undefined)
        change[field] = { from: seen[field], to: edits[field] } // what was seen and what is wanted
    return change as unknown as ItemChange // built field by field above
  })
}

/**
 * Puts newer rows under the edits: each becomes the snapshot, and an edit it already holds drops out.
 * @param pending the edits
 * @param rows the newer rows
 * @return the new pending object, and the rows whose edited field moved
 */
function rebase(pending: PendingChanges, rows: AdminItem[]) {
  let next = pending // grows row by row
  const moved: AdminItem[] = [] // rows whose edited field is not what the admin saw
  for (const row of rows) {
    const entry = pending[row.id] // the row's edits
    if (entry === undefined) continue // nothing pending for it
    if (
      FIELDS.some(
        (field) =>
          entry.edits[field] !== undefined && entry.seen[field] !== row[field],
      )
    )
      moved.push(row) // an edited field moved
    const edits: ItemEdits = {} // what still differs
    for (const field of FIELDS)
      if (entry.edits[field] !== undefined && entry.edits[field] !== row[field])
        (edits as Record<string, unknown>)[field] = entry.edits[field] // kept only if it differs
    const others = { ...next } // every row
    delete others[row.id] // put back below, if it still has an edit
    next =
      Object.keys(edits).length === 0
        ? others
        : { ...others, [row.id]: { seen: row, edits } } // the new snapshot
  }
  return { pending: next, moved } // the result
}

/**
 * Folds a save's answer into the rows the admin saw: only the saved fields and the new change time are taken, so a field another admin changed stays as the admin saw it until a refetch or a conflict shows it.
 * @param sent the pending edits as they were when the save was sent
 * @param saved the rows the Worker answered with
 * @return the rows as the admin now sees them
 */
export function mergeSaved(
  sent: PendingChanges,
  saved: AdminItem[],
): AdminItem[] {
  return saved.map((row) => {
    const entry = sent[row.id] // what was sent for the row
    if (entry === undefined) return row // nothing sent: the answer stands
    const merged: Record<string, unknown> = {
      ...entry.seen,
      modifiedAt: row.modifiedAt,
    } // the old view with the new change time
    for (const field of FIELDS)
      if (entry.edits[field] !== undefined) merged[field] = row[field] // the saved fields
    return merged as unknown as AdminItem // a row again
  })
}

/**
 * Finds saved rows whose answer differs from the folded row, so the screen can say the shown values are out of date.
 * @param shown the rows from `mergeSaved`
 * @param saved the rows the Worker answered with
 * @return the answered rows that hold a different value in any editable field
 */
export const staleRows = (
  shown: AdminItem[],
  saved: AdminItem[],
): AdminItem[] =>
  saved.filter((row) => {
    const mine = shown.find((entry) => entry.id === row.id) // the row as shown
    return (
      mine !== undefined && FIELDS.some((field) => mine[field] !== row[field])
    ) // some field is not what the Worker holds
  })

/**
 * Puts the rows a save wrote under the edits.
 * @param pending the edits
 * @param saved the saved rows
 * @return the edits left: what was written is gone, what was typed meanwhile stays
 */
export const applySaved = (
  pending: PendingChanges,
  saved: AdminItem[],
): PendingChanges => rebase(pending, saved).pending // flags do not matter after a save

/**
 * Rebases the edits onto a fetched page.
 * @param pending the edits
 * @param fetched the rows of the page
 * @return the new pending object, and the rows to flag because an edited field moved
 */
export function rebaseOnFetch(pending: PendingChanges, fetched: AdminItem[]) {
  const { pending: next, moved } = rebase(pending, fetched) // the rebase
  return { pending: next, flagged: moved } // a difference only in unedited fields updates the snapshot without a flag
}

/**
 * Takes the current rows of a refused save as the new snapshots and keeps the admin's edits.
 * @param pending the edits
 * @param current the current rows of the items that no longer matched
 * @param deletedIds the ids another admin deleted
 * @return the new pending object and the ids to flag
 */
export function rebaseAfterConflict(
  pending: PendingChanges,
  current: AdminItem[],
  deletedIds: string[],
) {
  return {
    pending: rebase(dropIds(pending, deletedIds), current).pending, // gone items lose their edits; the rest rebase
    conflictedIds: current.map((row) => row.id), // every refused row is flagged
  }
}

/**
 * Removes the edits of some items.
 * @param pending the edits
 * @param ids the items to drop
 * @return a new pending object
 */
export const dropIds = (
  pending: PendingChanges,
  ids: string[],
): PendingChanges =>
  Object.fromEntries(
    Object.entries(pending).filter(([id]) => !ids.includes(id)),
  ) // the other rows stay
