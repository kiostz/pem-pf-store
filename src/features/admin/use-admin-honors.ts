// The Items screen's state in one hook: the load, the filter, the pending changes, the save and its outcome, and Discard with its 5 s Undo.

import { useEffect, useState } from 'react' // state and the timers
import type {
  AdminHonor,
  HonorStatus,
} from '../../../workers/admin/src/admin-types.ts' // the row shape
import { loadAdminHonors, sendHonorChanges } from './admin-api.ts' // the two calls
import {
  applySaved,
  countChanges,
  prunePending,
  rebaseAfterConflict,
  setStatus as setPendingStatus,
  setStock as setPendingStock,
  toHonorChanges,
  type PendingChanges,
} from './pending-changes.ts' // the pending-changes functions

const SKELETON_DELAY_MS = 300 // the value of the `--delay-loader` token in src/styles/index.css (keep in step): a quick load flashes nothing
const SAVED_NOTE_MS = 4000 // how long "Saved n changes." stays
const UNDO_MS = 5000 // how long Undo stays after Discard

// Where the load stands.
export type LoadStatus = 'loading' | 'ready' | 'error' | 'signed-out'
// Where the save stands.
export type SaveState =
  'idle' | 'saving' | 'saved' | 'conflict' | 'failed' | 'signed-out'
// What Discard set aside, so Undo can bring it back.
type DiscardSnapshot = {
  pending: PendingChanges
  conflicts: Record<string, AdminHonor>
}

/**
 * The state and actions of the Items screen.
 * @return the load, rows, filter, pending changes, save state, and the actions on them
 */
export function useAdminHonors() {
  const [status, setLoadStatus] = useState<LoadStatus>('loading') // the load
  const [attempt, setAttempt] = useState(0) // bumped by Try again to run the load again
  const [delayPassed, setDelayPassed] = useState(false) // the loader delay has passed
  const [base, setBase] = useState<AdminHonor[]>([]) // the rows as the admin saw them
  const [query, setQuery] = useState('') // what the admin typed
  const [category, setCategory] = useState<string | null>(null) // the chosen category
  const [pending, setPending] = useState<PendingChanges>({}) // the unsaved edits
  const [conflicts, setConflicts] = useState<Record<string, AdminHonor>>({}) // the current rows of flagged items
  const [saveState, setSaveState] = useState<SaveState>('idle') // the save
  const [savedCount, setSavedCount] = useState(0) // how many changes the last save wrote
  const [snapshot, setSnapshot] = useState<DiscardSnapshot | null>(null) // set while Undo is on offer
  const count = countChanges(pending) // the edited fields

  // Loads the rows, again whenever Try again bumps `attempt`.
  useEffect(() => {
    let cancelled = false // a result that arrives after unmount or a newer attempt is ignored
    void loadAdminHonors().then((result) => {
      if (cancelled) return // stale
      if (result.kind === 'ok') {
        setBase(result.honors) // the rows
        setLoadStatus('ready') // show them
      } else setLoadStatus(result.kind) // signed-out or error
    })
    return () => void (cancelled = true) // stop listening
  }, [attempt])

  // Lets the skeleton show only after the loader delay.
  useEffect(() => {
    if (status !== 'loading') return // nothing is waiting
    const timer = window.setTimeout(
      () => setDelayPassed(true), // show the skeleton
      SKELETON_DELAY_MS, // after the delay
    ) // the delay ends
    return () => window.clearTimeout(timer) // a quick load cancels it
  }, [status, attempt])

  // Closes the saved note after 4 s.
  useEffect(() => {
    if (saveState !== 'saved') return // no note
    const timer = window.setTimeout(() => setSaveState('idle'), SAVED_NOTE_MS) // the note ends
    return () => window.clearTimeout(timer) // a new save cancels it
  }, [saveState])

  // Closes the Discard note, and its Undo, after 5 s.
  useEffect(() => {
    if (snapshot === null) return // no note
    const timer = window.setTimeout(() => setSnapshot(null), UNDO_MS) // the Undo ends
    return () => window.clearTimeout(timer) // a new edit or save cancels it
  }, [snapshot])

  // A failure or conflict note means nothing once no change is left to save (state adjusted during render, not in an effect).
  if (count === 0 && (saveState === 'failed' || saveState === 'conflict'))
    setSaveState('idle') // the note goes; signed-out stays

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

  /** Runs the load again after a failure or a signed-out load. */
  const retry = () => {
    setLoadStatus('loading') // back to waiting
    setDelayPassed(false) // the skeleton waits again
    setAttempt((value) => value + 1) // the effect loads
  }

  /**
   * Edits an item's status.
   * @param id the item
   * @param next the wanted status
   */
  const setStatus = (id: string, next: HonorStatus) => {
    setSnapshot(null) // a new edit closes Undo
    setPending((current) => setPendingStatus(current, base, id, next)) // record it
  }

  /**
   * Edits an item's stock.
   * @param id the item
   * @param next the wanted stock
   */
  const setStock = (id: string, next: number) => {
    setSnapshot(null) // a new edit closes Undo
    setPending((current) => setPendingStock(current, base, id, next)) // record it
  }

  /** Sends every pending change in one save and handles the outcome. */
  const save = async () => {
    if (saveState === 'saving' || count === 0) return // one request at a time
    setSnapshot(null) // a save closes Undo
    setSaveState('saving') // the pill shows Saving…
    const changes = toHonorChanges(pending, base) // what to send
    const sent = countChanges(pending) // for the note
    const result = await sendHonorChanges(changes) // the one request
    if (result.kind === 'saved') {
      const nextBase = applySaved(base, result.honors) // the saved rows are the new base
      setBase(nextBase) // shown as saved
      setPending((current) => prunePending(current, nextBase)) // what was written is no longer pending; edits made during the save stay
      setConflicts({}) // flags have been dealt with
      setSavedCount(sent) // for the note
      setSaveState('saved') // the note
    } else if (result.kind === 'conflict') {
      setBase(applySaved(base, result.honors)) // the current values are the new base
      setPending(
        (current) => rebaseAfterConflict(base, current, result.honors).pending,
      ) // the edits that still differ, including any made during the save
      setConflicts((current) => ({
        ...current,
        ...Object.fromEntries(result.honors.map((honor) => [honor.id, honor])), // flag the refused rows
      }))
      setSaveState('conflict') // the note
    } else setSaveState(result.kind === 'signed-out' ? 'signed-out' : 'failed') // the edits stay
  }

  /** Sets every pending change and flag aside, and offers Undo. */
  const discard = () => {
    if (saveState === 'saving' || count === 0) return // dead while saving, and nothing to discard
    setSnapshot({ pending, conflicts }) // what Undo brings back
    setPending({}) // no edits
    setConflicts({}) // no flags
    setSaveState('idle') // an old note goes
  }

  /** Brings back what Discard set aside. */
  const undoDiscard = () => {
    if (snapshot === null) return // nothing to bring back
    setPending(snapshot.pending) // the edits
    setConflicts(snapshot.conflicts) // the flags
    setSnapshot(null) // Undo is used
  }

  return {
    status, // the load
    showSkeleton: status === 'loading' && delayPassed, // skeleton rows
    retry, // Try again
    honors: base, // the rows
    query, // the typed text
    setQuery, // typing
    category, // the chosen category
    setCategory, // picking
    pending, // the edits
    conflicts, // the flagged rows
    count, // the edited fields
    setStatus, // edit a status
    setStock, // edit a stock
    save, // Save
    saveState, // the save
    savedCount, // the last save's size
    discard, // Discard
    undoDiscard, // Undo
    discarded: snapshot !== null, // Undo is on offer
  }
}
