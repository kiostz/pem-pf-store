// The admin Clubs screen: the clubs in the order buyers see them with their grey details lines, Add club, the Club sheet to edit or remove one, and Move up and Move down on each row, every action saved at once, with its loading, empty, error and signed-out states.

import { useLayoutEffect, useRef, useState } from 'react' // the opened sheet, the notes and the focus after a move
import { ACTION_BOX } from '@/shared/ui/button-box.ts' // the shared 44 px pill action
import type { AdminClub, ClubFields } from '../../../workers/admin/src/admin-types.ts' // the shapes
import { SIGNED_OUT_NOTE } from './admin-api.ts' // the 403 line
import { SOFT_BUTTON } from './admin-boxes.ts' // the quiet 44 px action
import { clubDetails } from './club-line.ts' // the grey line
import { ClubSheet, type ClubSheetOutcome } from './ClubSheet.tsx' // Add and Edit
import { useClubs } from './use-clubs.ts' // the screen's state

const SKELETON_ROWS = 5 // how many skeleton rows the loading state shows
const MOVE_BOX = 'bg-bg-soft text-accent focus-visible:outline-focus-ring rounded-pill flex size-11 shrink-0 items-center justify-center transition-transform duration-(--duration-press) focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] aria-disabled:opacity-60' // a 44 px round soft button with an arrow

/**
 * Picks the five fields out of a club.
 * @param club the club
 * @return the fields the Worker's guards compare, without the id
 */
const fieldsOf = (club: AdminClub): ClubFields => ({
  name: club.name, // the name
  area: club.area, // optional
  language: club.language, // optional
  location: club.location, // optional
  churchName: club.churchName, // optional
})

// A line under the toolbar: its words, whether it is a failure, and what Try again repeats.
type Note = { text: string; failed: boolean; retry?: () => void }
// Which sheet is open: Add, or Edit on a club as it was when opened.
type Sheet = { mode: 'add' } | { mode: 'edit'; club: AdminClub }

/**
 * A 44 px arrow button that moves a club.
 * @param name the accessible name
 * @param id the club's id
 * @param direction up or down
 * @param busy true while a write runs
 * @param onMove called on a press
 * @return the button
 */
function MoveButton({ name, id, direction, busy, onMove }: { name: string; id: number; direction: 'up' | 'down'; busy: boolean; onMove: () => void }) {
  return (
    <button
      type="button" // not a form submit
      aria-label={name} // an icon only
      aria-disabled={busy} // a second press is ignored
      data-move={`${id}:${direction}`} // where focus is put back after the row moves
      onClick={() => !busy && onMove()} // does nothing while a write runs
      className={MOVE_BOX}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={direction === 'up' ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /> {/* a chevron */}
      </svg>
    </button>
  )
}

/**
 * The Clubs screen.
 * @return the toolbar, the rows, the notes and the open sheet
 */
export function ClubsScreen() {
  const state = useClubs() // the list and the writes
  const { clubs, load, busyId } = state // read often
  const list = useRef<HTMLUListElement>(null) // the rows, to put focus back on a move button
  const [sheet, setSheet] = useState<Sheet | null>(null) // the open sheet
  const [outcome, setOutcome] = useState<ClubSheetOutcome>(null) // the sheet's last write
  const [note, setNote] = useState<Note | null>(null) // the line under the toolbar
  const [focus, setFocus] = useState<{ id: number; direction: 'up' | 'down'; tick: number } | null>(null) // the button to focus once the list has moved
  const addButton = useRef<HTMLButtonElement>(null) // Add club, where focus goes when a removed club's own button is gone
  const [focusAdd, setFocusAdd] = useState(0) // bumped to put focus on Add club once the list has redrawn
  const busy = busyId !== null // a write is running

  // Puts focus back on the pressed move button after the list is redrawn, or on its twin when it has gone (a row at an end).
  useLayoutEffect(() => {
    if (focus === null) return // no move yet
    const other = focus.direction === 'up' ? 'down' : 'up' // the twin
    const target =
      list.current?.querySelector<HTMLElement>(`[data-move="${focus.id}:${focus.direction}"]`) ??
      list.current?.querySelector<HTMLElement>(`[data-move="${focus.id}:${other}"]`) ??
      addButton.current // the pressed button, else its twin, else Add club (a conflict list without the moved club)
    target?.focus() // focus stays where the admin pressed
  }, [focus])

  // Puts focus on Add club after a removal, since the removed club's row (the sheet's opener) is gone.
  useLayoutEffect(() => {
    if (focusAdd > 0) addButton.current?.focus() // not on the first render
  }, [focusAdd])

  /**
   * Moves a club one place and says where it went.
   * @param club the club
   * @param direction -1 for up, 1 for down
   */
  const move = async (club: AdminClub, direction: -1 | 1) => {
    const from = clubs.map((entry) => entry.id) // the order the admin saw
    const index = from.indexOf(club.id) // where the club is
    const to = [...from] // the order wanted
    to[index] = to[index + direction]! // the neighbour takes its place
    to[index + direction] = club.id // the club moves
    setNote(null) // the old line goes
    const result = await state.move(club.id, { from, to }) // the one request
    if (result.kind === 'busy') return // another write is running
    setFocus({ id: club.id, direction: direction === -1 ? 'up' : 'down', tick: (focus?.tick ?? 0) + 1 }) // after the redraw
    if (result.kind === 'ok') {
      const place = result.clubs.findIndex((entry) => entry.id === club.id) + 1 // its new place
      setNote({ text: `${club.name} moved to ${place} of ${result.clubs.length}.`, failed: false }) // confirmed in place
    } else if (result.kind === 'conflict')
      setNote({ text: 'The club list was changed in another tab. It now shows the latest.', failed: false }) // the list was replaced
    else if (result.kind === 'signed-out') setNote({ text: SIGNED_OUT_NOTE, failed: true }) // the session ended
    else setNote({ text: "The club wasn't saved.", failed: true, retry: () => void move(club, direction) }) // nothing changed
  }

  /**
   * Handles the end of a write made from the sheet.
   * @param result what the write ended in
   * @param id the club's id (edit and remove)
   * @param done the note when it was saved
   * @param removed true after a Remove, which leaves no row to return focus to
   */
  const finish = (result: Awaited<ReturnType<typeof state.add>>, id: number | null, done: string, removed = false) => {
    if (result.kind === 'busy') return // another write is running
    if (result.kind === 'ok') {
      setSheet(null) // the sheet goes
      if (removed) setFocusAdd((value) => value + 1) // focus to Add club
      return setNote({ text: done, failed: false }) // confirmed in place
    }
    setOutcome(result.kind === 'conflict' ? { kind: 'conflict', latest: result.clubs.find((entry) => entry.id === id) ?? null } : { kind: result.kind }) // the sheet says why
  }

  const open = sheet?.mode === 'edit' ? (clubs.find((entry) => entry.id === sheet.club.id) ?? sheet.club) : undefined // the club as the list holds it now

  return (
    <section aria-labelledby="clubs-title">
      <h2 id="clubs-title" className="sr-only">
        Clubs
      </h2>
      {/* Add club: the one primary action. */}
      {load === 'ready' && (
        <div className="flex sm:justify-end">
          <button
            ref={addButton} // focus returns here after a removal
            type="button" // not a form submit
            onClick={() => {
              setOutcome(null) // a fresh sheet
              setNote(null) // the old line goes
              setSheet({ mode: 'add' }) // opens the Add sheet
            }}
            className={`${ACTION_BOX} bg-accent text-on-accent w-full px-6 font-bold sm:w-auto`} // oxblood, the one primary
          >
            Add club
          </button>
        </div>
      )}
      {/* The result of the last action, and Try again after a failed move. */}
      <div className="mt-3 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 pb-3">
        <p role="status" className={`text-sm ${note?.failed ? 'text-danger' : 'text-text-muted'}`}>
          {note?.text}
        </p>
        {note?.retry && (
          <button type="button" onClick={note.retry} className={SOFT_BUTTON}>
            Try again
          </button>
        )}
      </div>
      {/* Skeleton rows, shown only after the loader delay. */}
      {state.showSkeleton && (
        <div aria-hidden="true" className="flex flex-col gap-3">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <div
              key={index} // the rows never reorder
              data-testid="club-skeleton-row" // the tests count them
              className="bg-border-subtle animate-skeleton rounded-card h-17 motion-reduce:animate-none"
            />
          ))}
        </div>
      )}
      {load === 'error' && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-danger">We couldn&apos;t load the clubs.</p>
          <button type="button" onClick={state.retry} className={SOFT_BUTTON}>
            Try again
          </button>
        </div>
      )}
      {load === 'signed-out' && <p>{SIGNED_OUT_NOTE}</p>}
      {load === 'ready' && clubs.length === 0 && (
        <p className="text-text-muted animate-fade-in">No clubs yet. Buyers type their club&apos;s name when they order.</p>
      )}
      {/* The rows, in the order buyers see them. */}
      {load === 'ready' && clubs.length > 0 && (
        <ul ref={list} className="flex flex-col gap-3">
          {clubs.map((club, index) => {
            const details = clubDetails(club) // the grey line
            return (
              <li key={club.id} className="border-border-subtle bg-bg-surface rounded-card flex items-center gap-2 border p-3">
                <div className="min-w-0 flex-1">
                  <button
                    type="button" // not a form submit
                    onClick={() => {
                      setOutcome(null) // a fresh sheet
                      setNote(null) // the old line goes
                      setSheet({ mode: 'edit', club }) // opens the Edit sheet
                    }}
                    className="text-text-default focus-visible:outline-focus-ring min-h-11 max-w-full rounded-sm text-start font-bold break-words underline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {club.name}
                  </button>
                  {details !== '' && <p className="text-text-muted text-sm break-words">{details}</p>}
                </div>
                {/* An absent button leaves a gap, so Move down stays under the same thumb. */}
                {index > 0 ? (
                  <MoveButton name={`Move ${club.name} up`} id={club.id} direction="up" busy={busy} onMove={() => void move(club, -1)} />
                ) : (
                  <span aria-hidden="true" className="size-11 shrink-0" />
                )}
                {index < clubs.length - 1 ? (
                  <MoveButton name={`Move ${club.name} down`} id={club.id} direction="down" busy={busy} onMove={() => void move(club, 1)} />
                ) : (
                  <span aria-hidden="true" className="size-11 shrink-0" />
                )}
              </li>
            )
          })}
        </ul>
      )}
      {sheet !== null && (
        <ClubSheet
          mode={sheet.mode}
          club={open}
          busy={busy}
          outcome={outcome}
          onSave={(fields) => {
            setOutcome(null) // an old line goes
            void (sheet.mode === 'add'
              ? state.add(fields).then((result) => finish(result, null, `${fields.name} added.`))
              : state.edit({ id: sheet.club.id, from: fieldsOf(open ?? sheet.club), to: fields }).then((result) => finish(result, sheet.club.id, 'Club saved.')))
          }}
          onRemove={() => {
            if (sheet.mode !== 'edit') return // Add has no Remove
            const club = open ?? sheet.club // the club as the list holds it now
            setOutcome(null) // an old line goes
            void state.remove({ id: club.id, seen: fieldsOf(club) }).then((result) => finish(result, club.id, `${club.name} removed.`, true))
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  )
}
