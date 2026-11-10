// The Items screen's state in one hook: the pages, the meta, the pending changes with their snapshots, the save and its outcome, Add and Delete, the changes view, and Discard with its 5 s Undo.

import { useEffect, useRef, useState } from 'react' // state, the timers and refs
import type {
  AdminItem,
  AdminMeta,
  ItemStatus,
  NewItem,
} from '../../../workers/admin/src/admin-types.ts' // the row shape
import { addItem, deleteItem, loadMeta, sendItemChanges, uploadPicture } from './admin-api.ts' // the calls
import {
  applySaved,
  countChanges,
  dropIds,
  mergeSaved,
  rebaseAfterConflict,
  rebaseOnFetch,
  setEdit,
  staleRows,
  toItemChanges,
  type PendingChanges,
} from './pending-changes.ts' // the pending-changes functions
import { useItemPages } from './use-item-pages.ts' // the list's pages

const SAVED_NOTE_MS = 4000 // how long "Saved n changes." and the Add and Delete notes stay
const UNDO_MS = 5000 // how long Undo stays after Discard

// Where the save stands.
export type SaveState =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'conflict'
  | 'name-taken'
  | 'failed'
  | 'signed-out'
// What an Add ended in, for the sheet.
export type AddOutcome =
  'added' | 'name-taken' | 'id-taken' | 'signed-out' | 'error'
// What a Delete ended in, for the dialog.
export type DeleteOutcome =
  | { kind: 'deleted' | 'built-in' | 'signed-out' | 'error' }
  | { kind: 'conflict'; latest: AdminItem } // the item's current values
// What a picture upload ended in, for the sheet.
export type PictureOutcome = 'saved' | 'conflict' | 'signed-out' | 'error'
// What Discard set aside, so Undo can bring it back.
type DiscardSnapshot = {
  pending: PendingChanges
  conflicts: Record<string, AdminItem>
}

/**
 * The state and actions of the Items screen.
 * @return the pages, meta, pending changes, save state, and the actions on them
 */
export function useAdminItems() {
  const [pending, setPending] = useState<PendingChanges>({}) // the unsaved edits
  const pendingRef = useRef(pending) // the same edits, read between renders (a save's answer, a page arriving)
  const [conflicts, setConflicts] = useState<Record<string, AdminItem>>({}) // the current rows of flagged items
  const [staleFlags, setStaleFlags] = useState<Record<string, AdminItem>>({}) // rows flagged because a save's reply differed from what is shown; only a fetch of the row clears them
  const [conflictInfo, setConflictInfo] = useState({
    changed: false,
    deleted: false,
  }) // what the conflict note says
  const [takenName, setTakenName] = useState('') // the name a refused save shows
  const [saveState, setSaveState] = useState<SaveState>('idle') // the save
  const [savedCount, setSavedCount] = useState(0) // how many changes the last save wrote
  const [notice, setNotice] = useState<string | null>(null) // a short note after Add or Delete
  const [snapshot, setSnapshot] = useState<DiscardSnapshot | null>(null) // set while Undo is on offer
  const [meta, setMeta] = useState<AdminMeta | null>(null) // the currency, default price and categories
  const [metaFailed, setMetaFailed] = useState(false) // the meta did not load
  const [metaAttempt, setMetaAttempt] = useState(0) // bumped by Try again to load the meta again
  const [changesView, setChangesView] = useState(false) // the list shows only the pending rows
  const count = countChanges(pending) // the edited fields
  // While a save is in flight, a restock reload and a picture save's row update wait here and run once the save's answer has been applied, so a reload started after the save never reads D1 before the save's write. A save that starts while the list is loading queues one more reload behind itself, whose start aborts the running one. A Load more already running when a save starts is not covered by the queue; that is harmless because a next page never holds a row that is already listed, so none the save touched.
  const savingRef = useRef(false) // a save is in flight
  const [flushTick, setFlushTick] = useState(0) // bumped when a save ends, so the queue is looked at after the render that follows
  const queued = useRef<{ reload: boolean; updates: (() => void)[] }>({ reload: false, updates: [] }) // what waits for the save: one reload, and the picture updates in arrival order

  /**
   * Replaces the pending edits.
   * @param next the new edits
   */
  const commitPending = (next: PendingChanges) => {
    pendingRef.current = next // the next read sees it
    setPending(next) // the screen sees it
  }

  /**
   * Flags rows with their current values.
   * @param items the current rows
   */
  const flag = (items: AdminItem[]) =>
    setConflicts((current) => ({
      ...current,
      ...Object.fromEntries(items.map((item) => [item.id, item])),
    })) // the latest values show under the note

  /**
   * Drops the save-raised flags of some rows.
   * @param ids the rows whose newer values are now shown
   */
  const dropStale = (ids: string[]) =>
    setStaleFlags((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => !ids.includes(id)),
      ),
    ) // an older "Latest" line must not come back after a conflict showed newer values

  const pages = useItemPages((fetched) => {
    const result = rebaseOnFetch(pendingRef.current, fetched) // pending rows move onto what the list shows
    commitPending(result.pending) // the new snapshots
    if (result.flagged.length > 0) flag(result.flagged) // an edited field moved
    setStaleFlags((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([id]) => !fetched.some((row) => row.id === id),
        ),
      ),
    ) // a fetched row shows its latest values, so its stale flag is done
  })

  /** Loads the first page again with the applied filters, or after the running save when one is in flight (any number of calls make one reload). */
  const reloadList = () => { // the reload, now or queued
    if (savingRef.current) queued.current.reload = true // waits for the save
    else pages.retry() // no save: at once
  }

  // Runs what waited for a save, after the render that shows the save's answer: the picture updates in order, then one reload that reads D1 after the save's write.
  useEffect(() => { // looks at the queue
    if (savingRef.current) return // a save is still running (the ref is always cleared when it ends, even by a throw)
    const { reload, updates } = queued.current // what waited
    if (!reload && updates.length === 0) return // nothing waited
    queued.current = { reload: false, updates: [] } // taken
    updates.forEach((update) => update()) // each picture update, in order
    if (reload) pages.retry() // the one reload
  }, [saveState, flushTick, pages]) // pages is a new object every render, so this runs after every render by design; it does nothing unless a save has ended with something waiting

  // Loads the meta once, and again after Try again while it is missing.
  useEffect(() => {
    if (meta !== null) return // already loaded
    let cancelled = false // ignored after unmount
    void loadMeta().then((result) => {
      if (cancelled) return // stale
      if (result.kind === 'ok')
        setMeta(result.meta) // the meta
      else setMetaFailed(true) // say so, with Try again
    })
    return () => void (cancelled = true) // stop listening
  }, [meta, metaAttempt])

  // Closes the saved note after 4 s.
  useEffect(() => {
    if (saveState !== 'saved') return // no note
    const timer = window.setTimeout(() => setSaveState('idle'), SAVED_NOTE_MS) // the note ends
    return () => window.clearTimeout(timer) // a new save cancels it
  }, [saveState])

  // Closes the Add or Delete note after 4 s.
  useEffect(() => {
    if (notice === null) return // no note
    const timer = window.setTimeout(() => setNotice(null), SAVED_NOTE_MS) // the note ends
    return () => window.clearTimeout(timer) // a new note cancels it
  }, [notice])

  // Closes the Discard note, and its Undo, after 5 s.
  useEffect(() => {
    if (snapshot === null) return // no note
    const timer = window.setTimeout(() => setSnapshot(null), UNDO_MS) // the Undo ends
    return () => window.clearTimeout(timer) // a new edit or save cancels it
  }, [snapshot])

  // A failure or conflict note means nothing once no change is left to save, except the sentence about deleted items (state adjusted during render, not in an effect).
  if (
    count === 0 &&
    (saveState === 'failed' ||
      saveState === 'name-taken' ||
      (saveState === 'conflict' && !conflictInfo.deleted))
  )
    setSaveState('idle') // the note goes; signed-out stays
  if (changesView && count === 0) setChangesView(false) // nothing left to show

  // Warns before leaving while changes are pending.
  const hasPending = count > 0 // whether anything would be lost
  useEffect(() => {
    if (!hasPending) return // nothing to lose
    /**
     * Asks the browser to confirm leaving.
     * @param event the unload warning
     */
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault() // the browser asks
      event.returnValue = '' // older browsers need a value
    }
    window.addEventListener('beforeunload', warn) // on
    return () => window.removeEventListener('beforeunload', warn) // off when nothing is pending
  }, [hasPending])

  /** Loads the meta again after a failure. */
  const retryMeta = () => {
    setMetaFailed(false) // the line goes while it loads
    setMetaAttempt((value) => value + 1) // the effect loads
  }

  /** Loads the list again after a failure, and the meta too when it is missing. */
  const retry = () => {
    pages.retry() // the first page
    if (meta === null) retryMeta() // the meta, if it failed
  }

  /**
   * Edits one field of a row.
   * @param row the row as shown
   * @param field which field
   * @param value the wanted value
   */
  const edit = <
    Field extends 'name' | 'category' | 'subcategoryId' | 'priceCents' | 'status' | 'stock', // the fields a row edit can set, subcategory included
  >(
    row: AdminItem,
    field: Field,
    value: AdminItem[Field],
  ) => {
    setSnapshot(null) // a new edit closes Undo
    commitPending(setEdit(pendingRef.current, row, field, value)) // record it
  }

  /**
   * Edits a row's status.
   * @param row the row
   * @param next the wanted status
   */
  const setStatus = (row: AdminItem, next: ItemStatus) =>
    edit(row, 'status', next)

  /**
   * Edits the fields the admin changed in the Item sheet; a field left out keeps its pending or shown value.
   * @param row the row as shown now
   * @param values the changed fields among name, category, subcategory, price and stock
   * @param saw the stored value the admin saw for each changed field; it becomes that field's `from`, so a value another admin changed since meets the stale-stock check even when the row already had pending edits
   */
  const setDetails = (
    row: AdminItem,
    values: Partial<{ name: string; category: string; subcategoryId: number | null; priceCents: number; stock: number }>, // the fields the sheet changed
    saw: Partial<{ name: string; category: string; subcategoryId: number | null; priceCents: number; stock: number }> = {}, // what the admin saw for each
  ) => {
    setSnapshot(null) // a new edit closes Undo
    let next = pendingRef.current // the edits so far
    const entry = next[row.id] // the row's earlier edits, if any
    const seen = { ...(entry?.seen ?? row), ...saw } // the snapshot: the admin's seen values for the changed fields; the rest as the row or its entry has them, with the latest picture and change time
    if (entry !== undefined) next = { ...next, [row.id]: { ...entry, seen } } // the entry's snapshot takes the seen values too, so it cannot move under a sheet edit
    if (values.name !== undefined) next = setEdit(next, seen, 'name', values.name) // the name
    if (values.category !== undefined) next = setEdit(next, seen, 'category', values.category) // the category
    if (values.subcategoryId !== undefined) next = setEdit(next, seen, 'subcategoryId', values.subcategoryId) // the subcategory, null being None
    if (values.priceCents !== undefined) next = setEdit(next, seen, 'priceCents', values.priceCents) // the price
    if (values.stock !== undefined) next = setEdit(next, seen, 'stock', values.stock) // the stock
    commitPending(next) // one commit for the changed fields
  }

  /** Sends every pending change in one save and handles the outcome. */
  const save = async () => {
    if (saveState === 'saving' || count === 0) return // one request at a time
    setSnapshot(null) // a save closes Undo
    setNotice(null) // an old note goes
    setSaveState('saving') // the pill shows Saving…
    savingRef.current = true // restock reloads and picture updates now wait their turn
    if (pages.pageState === 'loading') queued.current.reload = true // a list request already running may have read before this save's write: a reload behind the save will abort it
    try { // so the flag below is cleared even when the save throws
      await runSave() // the request and its outcome
    } catch { // an unexpected throw ends the save as failed
      setSaveState('failed') // a throw ends in the failed note, so the list and Save work again
    } finally { // runs after a success, a conflict, a failure and a throw alike
      savingRef.current = false // the save is over, whatever it answered
      setFlushTick((tick) => tick + 1) // so the queue is looked at after the render that shows the answer
    }
  }

  /** Sends every pending change and applies the answer: the part of a save that runs while the queue holds other updates back. */
  const runSave = async () => { // sends the changes and applies the answer
    const sentPending = pendingRef.current // what is being sent
    const sent = countChanges(sentPending) // for the note
    const result = await sendItemChanges(toItemChanges(sentPending)) // the one request
    if (result.kind === 'saved') {
      const seen = mergeSaved(sentPending, result.items) // the saved fields and times only
      commitPending(applySaved(pendingRef.current, seen)) // what was written is no longer pending; edits made during the save stay
      pages.applyRows(seen) // the saved rows stay in place until the next fetch
      setConflicts({}) // conflict flags have been dealt with
      const savedIds = result.items.map((row) => row.id) // the rows this save answered for
      setStaleFlags((current) => ({
        ...Object.fromEntries(
          Object.entries(current).filter(([id]) => !savedIds.includes(id)),
        ), // flags of other rows stay
        ...Object.fromEntries(
          staleRows(seen, result.items).map((row) => [row.id, row]),
        ), // a shown value that is out of date gets the same note as a conflict
      }))
      setSavedCount(sent) // for the note
      setSaveState('saved') // the note
    } else if (result.kind === 'conflict') {
      const rebased = rebaseAfterConflict(
        pendingRef.current,
        result.items,
        result.deletedIds,
      ) // the current values become the snapshots
      commitPending(rebased.pending) // the admin's edits stay, with `from` rebased
      pages.applyRows(result.items) // the list shows the latest values
      pages.removeRows(result.deletedIds) // another admin deleted these
      flag(result.items) // flag the refused rows
      dropStale(result.items.map((row) => row.id)) // their conflict values replace any older save-raised flag
      setConflictInfo({
        changed: result.items.length > 0,
        deleted: result.deletedIds.length > 0,
      }) // what the note says
      setSaveState('conflict') // the note
    } else if (result.kind === 'name-taken') {
      const first = pendingRef.current[result.ids[0]] // the first refused row
      setTakenName(first?.edits.name ?? first?.seen.name ?? '') // the name the note shows
      setSaveState('name-taken') // the note; the edits stay
    } else setSaveState(result.kind === 'signed-out' ? 'signed-out' : 'failed') // the edits stay
  }

  /** Sets every pending change and flag aside, and offers Undo. */
  const discard = () => {
    if (saveState === 'saving' || count === 0) return // dead while saving, and nothing to discard
    setSnapshot({ pending, conflicts }) // what Undo brings back
    commitPending({}) // no edits
    setConflicts({}) // no flags
    setSaveState('idle') // an old note goes
  }

  /** Brings back what Discard set aside. */
  const undoDiscard = () => {
    if (snapshot === null) return // nothing to bring back
    commitPending(snapshot.pending) // the edits
    setConflicts(snapshot.conflicts) // the flags
    setSnapshot(null) // Undo is used
  }

  /**
   * Adds an item at once, and moves the search to its name.
   * @param item the name, category and price
   * @return what happened, for the sheet to show
   */
  const add = async (item: NewItem): Promise<AddOutcome> => {
    const result = await addItem(item) // the one request
    if (result.kind !== 'added') return result.kind // the sheet says why
    pages.showOnly(result.item.name) // the new item is the search
    setNotice(`Added ${result.item.name}. It's Hidden until you switch it on.`) // the note
    return 'added' // the sheet closes
  }

  /**
   * Deletes a Club-added item the admin saw unchanged.
   * @param row the row as shown
   * @return what happened, for the dialog to show
   */
  const remove = async (row: AdminItem): Promise<DeleteOutcome> => {
    const seen = pendingRef.current[row.id]?.seen ?? row // the guard is what the admin saw
    const result = await deleteItem({
      id: row.id,
      seen: {
        name: seen.name,
        category: seen.category,
        priceCents: seen.priceCents,
        status: seen.status,
        stock: seen.stock,
        modifiedAt: seen.modifiedAt,
      },
    }) // the one request
    if (result.kind === 'deleted') {
      pages.removeRows([row.id]) // the row goes
      commitPending(dropIds(pendingRef.current, [row.id])) // so do its edits
      setConflicts((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id]) => id !== row.id),
        ),
      ) // and its flag
      setStaleFlags((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id]) => id !== row.id),
        ),
      ) // and its stale flag
      setNotice(`Deleted ${row.name}.`) // the note
    } else if (result.kind === 'conflict') {
      commitPending(
        rebaseAfterConflict(pendingRef.current, result.items, []).pending,
      ) // the row changed: its edits rebase
      pages.applyRows(result.items) // the list shows the latest values
      flag(result.items) // and flags them
      dropStale(result.items.map((row) => row.id)) // the conflict values replace any older save-raised flag
      return { kind: 'conflict', latest: result.items[0] ?? row } // the dialog shows what changed
    }
    return { kind: result.kind } // the dialog says what happened
  }

  /**
   * Uploads an item's picture at once and folds the answer into the list; the item's pending edits stay.
   * @param row the row as shown (its picture key is the one the admin saw)
   * @param picture the resized picture
   * @return what happened, for the sheet to show
   */
  const uploadItemPicture = async (row: AdminItem, picture: Blob): Promise<PictureOutcome> => {
    const result = await uploadPicture(row.id, row.image, picture) // the one request
    if (savingRef.current) { // a save is in flight
      queued.current.updates.push(() => applyPictureResult(row, result)) // a save is in flight: the row update waits for it, then lands on the saved row
      if (result.kind === 'conflict') queued.current.reload = true // a conflict's rows may predate the save's write: a reload after the save corrects them
    }
    else applyPictureResult(row, result) // no save: at once
    return result.kind // the sheet says what happened
  }

  /**
   * Folds a picture save's answer into the list and the pending state.
   * @param row the row as the sheet showed it
   * @param result the picture call's answer
   */
  const applyPictureResult = (row: AdminItem, result: Awaited<ReturnType<typeof uploadPicture>>) => { // applies a picture answer to the list and the pending state
    if (result.kind === 'saved') {
      const listed = pages.listedRow(row.id) ?? row // the row as listed now
      const shown = { ...listed, image: result.item.image, modifiedAt: result.item.modifiedAt > listed.modifiedAt ? result.item.modifiedAt : listed.modifiedAt } // only the picture and the later change time move, so other shown fields stay as the admin sees them and a save written after the picture keeps its time
      pages.applyRows([shown]) // the row stays in place
      const entry = pendingRef.current[row.id] // the row's unsaved edits, if any
      if (entry !== undefined)
        commitPending({
          ...pendingRef.current,
          [row.id]: { ...entry, seen: { ...entry.seen, image: shown.image, modifiedAt: shown.modifiedAt } },
        }) // the snapshot follows, so a later Delete guard sees the new change time; the edits stay
      setStaleFlags((current) => ({
        ...Object.fromEntries(Object.entries(current).filter(([id]) => id !== row.id)), // this row's old flag goes
        ...Object.fromEntries(staleRows([shown], [result.item]).map((stale) => [stale.id, stale])), // a shown value that is out of date gets the same note as a conflict
      })) // the other flags stay
    } else if (result.kind === 'conflict') {
      const rebased = rebaseOnFetch(dropIds(pendingRef.current, result.deletedIds), result.items) // gone items lose their edits; the rest move onto the current rows
      commitPending(rebased.pending) // the edits stay
      pages.applyRows(result.items) // the list shows the latest values
      dropStale(result.items.map((row) => row.id)) // the latest values replace any older save-raised flag
      pages.removeRows(result.deletedIds) // another admin deleted these
      if (rebased.flagged.length > 0) flag(rebased.flagged) // an edited field moved
      setConflicts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !result.deletedIds.includes(id)))) // deleted rows lose their flag
      setStaleFlags((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !result.deletedIds.includes(id)))) // and their stale flag
    } else if (result.kind === 'signed-out') setSaveState('signed-out') // the existing signed-out note
  }

  return {
    pages, // the list's pages and controls
    retry, // Try again
    reloadList, // reload the first page now, or right after a running save
    meta, // the currency, default price and categories
    metaFailed, // the meta did not load
    retryMeta, // Try again for the meta
    pending, // the edits
    conflicts: { ...staleFlags, ...conflicts }, // the flagged rows: a conflict's values win over a stale flag's
    count, // the edited fields
    setStatus, // edit a status
    setDetails, // edit name, category, price and stock
    save, // Save
    saveState, // the save
    savedCount, // the last save's size
    takenName, // the name a refused save shows
    conflictInfo, // what the conflict note says
    notice, // a note after Add or Delete
    discard, // Discard
    undoDiscard, // Undo
    discarded: snapshot !== null, // Undo is on offer
    changesView, // only the pending rows are listed
    setChangesView, // Show changes
    add, // Add item
    remove, // Delete item
    uploadItemPicture, // Save picture
  }
}
