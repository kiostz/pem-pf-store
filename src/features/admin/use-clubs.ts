// The Clubs screen's state in one hook: the list from the Admin Worker, the loader delay, and the writes (add, edit, remove, move), one at a time, each answer replacing the list.

import { useEffect, useRef, useState } from 'react' // state, the timer and refs
import type { AdminClub, ClubEdit, ClubFields, ClubOrder, ClubRemove } from '../../../workers/admin/src/admin-types.ts' // the shared shapes
import { addClub, editClub, loadClubs, moveClubs, removeClub, type ClubCallResult } from './admin-api.ts' // the club calls

const SKELETON_DELAY_MS = 300 // the value of the `--delay-loader` token in src/styles/index.css (keep in step): a quick load flashes nothing
const ADD_ID = 0 // the busy id while an Add runs: no club has it

// Where the first read stands.
export type ClubsLoad = 'loading' | 'ready' | 'error' | 'signed-out'
// What a write ends in: a call result, or `busy` when another write was running and nothing was sent.
export type ClubWriteResult = ClubCallResult | { kind: 'busy' }

/**
 * The list of clubs and the actions that change it.
 * @return the clubs, the read's state, Try again, the four writes and the id of the club being written
 */
export function useClubs() {
  const [clubs, setClubs] = useState<AdminClub[]>([]) // the list as the Worker last said
  const [load, setLoad] = useState<ClubsLoad>('loading') // the first read
  const [attempt, setAttempt] = useState(0) // bumped by Try again
  const [delayPassed, setDelayPassed] = useState(false) // the loader delay has passed
  const [busyId, setBusyId] = useState<number | null>(null) // the club a write is running for
  const writing = useRef(false) // a write is running; read between renders so a double click sends once
  const mounted = useRef(true) // false after unmount, so a late answer sets no state

  // Tracks whether the screen is on screen.
  useEffect(() => {
    mounted.current = true // on screen
    return () => {
      mounted.current = false // answers that arrive later are ignored
    }
  }, [])

  // Reads the list; Try again reads it again.
  useEffect(() => {
    let live = true // false after a newer read or unmount
    void loadClubs().then((result) => {
      if (!live) return // a late answer is dropped
      if (result.kind === 'ok') {
        setClubs(result.clubs) // the list
        setLoad('ready') // show it
      } else setLoad(result.kind === 'signed-out' ? 'signed-out' : 'error') // a read never conflicts or finds a taken name
    })
    return () => {
      live = false // stop listening
    }
  }, [attempt])

  // Lets the skeleton show only after the loader delay.
  useEffect(() => {
    if (load !== 'loading') return // nothing is waiting
    const wait = window.setTimeout(() => setDelayPassed(true), SKELETON_DELAY_MS) // the delay ends
    return () => window.clearTimeout(wait) // a quick load cancels it
  }, [load, attempt])

  /** Reads the first list again after a failure. */
  const retry = () => {
    setDelayPassed(false) // the skeleton waits again
    setLoad('loading') // waiting
    setAttempt((value) => value + 1) // the effect reads
  }

  /**
   * Runs one write, ignoring a second one while it is out, and shows the list the answer carries.
   * @param id the club the write is for, or ADD_ID
   * @param call the request
   * @return what the write ended in
   */
  const write = async (id: number, call: () => Promise<ClubCallResult>): Promise<ClubWriteResult> => {
    if (writing.current) return { kind: 'busy' } // one write at a time
    writing.current = true // taken
    setBusyId(id) // the row says so
    const result = await call() // the one request
    if (id === ADD_ID && result.kind === 'name-taken') {
      const again = await loadClubs() // a retried Add may have landed: read the list so the club shows
      if (again.kind === 'ok' && mounted.current) setClubs(again.clubs) // the list as it is now, if the screen is still there
    }
    writing.current = false // free again
    if (mounted.current) {
      if (result.kind === 'ok' || result.kind === 'conflict') setClubs(result.clubs) // the answer's list wins
      setBusyId(null) // the row is back
    }
    return result // the caller shows how it ended
  }

  return {
    clubs, // the list, in shown order
    load, // the first read's state
    showSkeleton: load === 'loading' && delayPassed, // skeleton rows
    busyId, // the club being written, or 0 for an Add
    retry, // Try again
    add: (fields: ClubFields) => write(ADD_ID, () => addClub(fields)), // Add club
    edit: (edit: ClubEdit) => write(edit.id, () => editClub(edit)), // Save
    remove: (remove: ClubRemove) => write(remove.id, () => removeClub(remove)), // Remove club
    move: (id: number, order: ClubOrder) => write(id, () => moveClubs(order)), // Move up or down
  }
}
