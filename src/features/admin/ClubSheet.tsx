// The Club sheet: a modal dialog to add a club or edit one's name and four optional details, with the lines for a taken name, a conflict and a signed-out session, and Remove club (behind its own dialog) in edit mode.

import { useEffect, useRef, useState } from 'react' // the dialog element, focus and the drafts
import { ACTION_BOX } from '@/shared/ui/button-box.ts' // the shared 44 px pill action
import type { AdminClub, ClubFields } from '../../../workers/admin/src/admin-types.ts' // the shapes
import { SIGNED_OUT_NOTE } from './admin-api.ts' // the 403 line
import { FIELD_BOX, SHEET_BOX, SOFT_BUTTON } from './admin-boxes.ts' // shared shapes
import { clubDetails } from './club-line.ts' // the grey line
import { RemoveClubDialog } from './RemoveClubDialog.tsx' // the confirmation

const MAX_TEXT = 100 // the Worker's limit, in UTF-16 units
// What the last write ended in, as the sheet shows it: a taken name, a conflict (the latest club, or null when it was removed), an ended session, or a failure.
export type ClubSheetOutcome =
  | null
  | { kind: 'name-taken' | 'signed-out' | 'error' }
  | { kind: 'conflict'; latest: AdminClub | null }

// The four optional detail fields, in the order the shop's grey line joins them.
const DETAILS = [
  { key: 'area', label: 'Area' },
  { key: 'language', label: 'Language' },
  { key: 'location', label: 'Location' },
  { key: 'churchName', label: 'Church name' },
] as const

// The five drafts as typed.
type Drafts = Record<keyof ClubFields, string>

/**
 * Turns a club's fields into drafts.
 * @param club the club, or undefined for Add
 * @return the five texts, with null as ''
 */
const draftsOf = (club?: ClubFields): Drafts => ({
  name: club?.name ?? '', // the name
  area: club?.area ?? '', // optional
  language: club?.language ?? '', // optional
  location: club?.location ?? '', // optional
  churchName: club?.churchName ?? '', // optional
})

/**
 * Checks the drafts and cleans them.
 * @param drafts the five texts as typed
 * @return the clean fields, or the lines to show
 */
function check(drafts: Drafts): { fields: ClubFields; errors: null } | { fields: null; errors: Partial<Record<keyof ClubFields, string>> } {
  const errors: Partial<Record<keyof ClubFields, string>> = {} // a line per field that needs fixing
  const name = drafts.name.trim() // outer spaces never count
  if (name === '' || name.length > MAX_TEXT) errors.name = 'Enter a club name, up to 100 characters.' // empty or too long
  else if (/[\p{Cc}\p{Zl}\p{Zp}]/u.test(name)) errors.name = 'Remove tabs and line breaks.' // control characters
  else if (name.toLowerCase() === 'other') errors.name = '“Other” is kept for clubs that aren\'t listed.' // the shop's own option
  const details: Partial<Record<keyof ClubFields, string | null>> = {} // the cleaned optional fields
  for (const { key } of DETAILS) {
    const text = drafts[key].trim() // outer spaces never count
    if (text.length > MAX_TEXT) errors[key] = 'Up to 100 characters.' // too long
    else if (/[\p{Cc}\p{Zl}\p{Zp}]/u.test(text)) errors[key] = 'Remove tabs and line breaks.' // control characters
    details[key] = text === '' ? null : text // blank is null
  }
  if (Object.keys(errors).length > 0) return { fields: null, errors } // something to fix
  return { fields: { name, area: details.area!, language: details.language!, location: details.location!, churchName: details.churchName! }, errors: null } // clean
}

/**
 * Writes the line for an outcome.
 * @param outcome what the last write ended in
 * @param name the name as typed, for the taken-name line
 * @return the line, or null for none
 */
function outcomeLine(outcome: ClubSheetOutcome, name: string): string | null {
  if (outcome === null) return null // nothing happened yet
  if (outcome.kind === 'name-taken') return `Another club is already called ${name.trim()}.` // the usual line
  if (outcome.kind === 'signed-out') return SIGNED_OUT_NOTE // the session ended
  if (outcome.kind !== 'conflict') return "The club wasn't saved." // anything else
  if (outcome.latest === null) return 'This club was removed in another tab.' // gone
  const details = clubDetails(outcome.latest) // the grey line
  return `This club has been updated. Latest: ${outcome.latest.name}${details === '' ? '' : ` · ${details}`}.` // what it holds now
}

/**
 * Draws the sheet.
 * @param mode add or edit
 * @param club the club being edited (edit only), as the list holds it now
 * @param busy true while a write runs
 * @param outcome what the last write ended in
 * @param onSave called with the clean fields when Add club or Save is pressed and something changed
 * @param onRemove called when Remove club is confirmed in the dialog
 * @param onClose called when the sheet should go away
 * @return a modal dialog, and the Remove dialog when asked
 */
export function ClubSheet({
  mode,
  club,
  busy,
  outcome,
  onSave,
  onRemove,
  onClose,
}: {
  mode: 'add' | 'edit' // which sheet
  club?: AdminClub // the club, in edit
  busy: boolean // a write is running
  outcome: ClubSheetOutcome // the last write's end
  onSave: (fields: ClubFields) => void // a save
  onRemove: () => void // a confirmed remove
  onClose: () => void // go away
}) {
  const dialog = useRef<HTMLDialogElement>(null) // the element
  const [drafts, setDrafts] = useState<Drafts>(() => draftsOf(mode === 'edit' ? club : undefined)) // what is typed
  const [errors, setErrors] = useState<Partial<Record<keyof ClubFields, string>>>({}) // the lines to show
  const [confirming, setConfirming] = useState(false) // the Remove dialog is open
  const [removeTried, setRemoveTried] = useState(false) // a remove was sent from the open dialog
  const [outcomeHidden, setOutcomeHidden] = useState(false) // a closed dialog hides its own failure line
  const [base, setBase] = useState<Drafts>(() => draftsOf(mode === 'edit' ? club : undefined)) // the values the untouched fields were last in step with
  const [seenOutcome, setSeenOutcome] = useState(outcome) // the last answer already handled
  const [takenName, setTakenName] = useState<string | null>(null) // the Name typed when a taken-name answer came

  // Opens as a modal; returns focus to what held it (the row's name or Add club) when the sheet goes away.
  useEffect(() => {
    const element = dialog.current // the dialog
    const opener = document.activeElement as HTMLElement | null // what held focus before
    if (element !== null && !element.open) element.showModal() // modal: traps focus, closes on Escape
    return () => {
      if (opener?.isConnected) opener.focus() // back to where the admin was
    }
  }, [])

  // After a conflict, fields the admin left alone take the latest values; the typed ones stay. Done while rendering, so the sheet never shows the stale copy.
  if (outcome !== seenOutcome) { // a new answer arrived
    setSeenOutcome(outcome) // handled once per answer
    setTakenName(outcome?.kind === 'name-taken' ? drafts.name : null) // the name the line is about
    if (outcome?.kind === 'conflict' && outcome.latest !== null) { // only a conflict with a club rebases
      const latest = draftsOf(outcome.latest) // what the club holds now
      const next = { ...drafts } // a copy to fill
      for (const key of Object.keys(latest) as Array<keyof ClubFields>) if (drafts[key] === base[key]) next[key] = latest[key] // untouched: take the latest
      setDrafts(next) // the typed fields stay
      setBase(latest) // the next conflict compares with this
    }
  }

  /** Closes the sheet unless a write is running, so its outcome still reaches the admin with the typing kept. */
  const close = () => {
    if (!busy) onClose() // closing mid-write would hide a failure
  }

  /**
   * Sets one draft.
   * @param key the field
   * @param value the new text
   */
  const setDraft = (key: keyof ClubFields, value: string) => setDrafts((current) => ({ ...current, [key]: value })) // one field changes

  /**
   * Checks the fields and saves them.
   * @param event the form submit
   */
  const submit = (event: React.SubmitEvent) => {
    event.preventDefault() // no page reload
    if (busy) return // one request at a time
    const checked = check(drafts) // the clean fields
    setErrors(checked.errors ?? {}) // shown
    if (checked.fields === null) return // a line is showing
    const before = draftsOf(club) // what the club held
    const unchanged = mode === 'edit' && (Object.keys(before) as Array<keyof ClubFields>).every((key) => (checked.fields[key] ?? '') === before[key]) // nothing to send
    if (unchanged) return onClose() // the Worker refuses an edit that changes nothing
    setOutcomeHidden(false) // a new write's line shows
    onSave(checked.fields) // the parent writes
  }

  /** Sends the remove from the dialog. */
  const confirmRemove = () => {
    if (busy) return // one request at a time
    setRemoveTried(true) // the dialog shows how it ended
    setOutcomeHidden(false) // its line shows
    onRemove() // the parent writes
  }

  const nameChanged = outcome?.kind === 'name-taken' && drafts.name !== takenName // the taken name was edited, so the line no longer applies
  const line = outcomeHidden || nameChanged ? null : outcomeLine(outcome, drafts.name) // the outcome's words
  const nameTaken = outcome?.kind === 'name-taken' && !outcomeHidden && !nameChanged // shown under Name
  const formLine = confirming || nameTaken ? null : line // under the fields
  const title = mode === 'edit' ? 'Edit club' : 'Add club' // the heading
  return (
    <>
      {/* The sheet: a modal dialog with one form. */}
      <dialog
        ref={dialog} // opened above
        aria-labelledby="club-sheet-title" // its name
        onCancel={(event) => busy && event.preventDefault()} // Escape does nothing while a write runs
        onClose={() => {
          if (!busy) return onClose() // Escape closed it natively, and changes nothing
          if (dialog.current !== null && !dialog.current.open) dialog.current.showModal() // a write is running: stay
        }}
        onClick={(event) => event.target === dialog.current && close()} // a tap on the backdrop
        className={SHEET_BOX}
      >
        <form onSubmit={submit} noValidate>
          {/* The title and the Close button. */}
          <div className="flex items-center justify-between gap-2">
            <h2 id="club-sheet-title" className="text-lg font-bold">
              {title} {/* Add club or Edit club */}
            </h2>
            <button
              type="button" // not a form submit
              aria-label="Close" // an icon only
              onClick={close} // changes nothing
              className="bg-bg-soft text-accent focus-visible:outline-focus-ring rounded-pill flex size-11 shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" /> {/* a cross */}
              </svg>
            </button>
          </div>
          {/* The five fields; a line under a field says what to fix. */}
          <div className="mt-3 flex flex-col gap-4">
            <div>
              <label htmlFor="club-name" className="mb-1 block text-sm font-medium">
                Name
              </label>
              <input
                id="club-name" // the label points here
                value={drafts.name} // controlled
                onChange={(event) => setDraft('name', event.target.value)} // every keystroke
                aria-invalid={errors.name !== undefined || nameTaken} // the line below says why
                aria-describedby={`club-name-hint${errors.name || nameTaken ? ' club-name-error' : ''}`} // the hint, and the line
                autoComplete="off" // no history dropdown
                className={`${FIELD_BOX} w-full`}
              />
              <p id="club-name-hint" className="text-text-muted mt-1 text-sm">
                Buyers see this in the club list. Past orders keep the name they were sent with.
              </p>
              {(errors.name || nameTaken) && (
                // The alert is announced once: it hides when Name changes, so its text never follows the typing.
                <p id="club-name-error" role={errors.name ? undefined : 'alert'} className="text-danger mt-1 text-sm">
                  {errors.name ?? line} {/* what to fix */}
                </p>
              )}
            </div>
            {DETAILS.map(({ key, label }) => (
              <div key={key}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <label htmlFor={`club-${key}`} className="text-sm font-medium">
                    {label}
                  </label>
                  <span id={`club-${key}-optional`} className="text-text-muted text-sm">
                    Optional
                  </span>
                </div>
                <input
                  id={`club-${key}`} // the label points here
                  value={drafts[key]} // controlled
                  onChange={(event) => setDraft(key, event.target.value)} // every keystroke
                  aria-invalid={errors[key] !== undefined} // the line below says why
                  aria-describedby={`club-${key}-optional${errors[key] ? ` club-${key}-error` : ''}`} // Optional, and the line
                  autoComplete="off" // no history dropdown
                  className={`${FIELD_BOX} w-full`}
                />
                {errors[key] && (
                  <p id={`club-${key}-error`} className="text-danger mt-1 text-sm">
                    {errors[key]} {/* what to fix */}
                  </p>
                )}
              </div>
            ))}
          </div>
          {formLine !== null && (
            <p role="alert" className="text-danger mt-3">
              {formLine} {/* why the write did not land */}
            </p>
          )}
          {/* The one primary action, Cancel beside it, and Remove club quietly apart. */}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="submit" // Enter in a field does this
                aria-disabled={busy} // a second click is ignored
                className={`${ACTION_BOX} bg-accent text-on-accent h-13 px-6 font-extrabold! aria-disabled:opacity-60`} // oxblood, the one primary
              >
                {mode === 'edit' ? (busy ? 'Saving…' : 'Save') : busy ? 'Adding…' : 'Add club'}
              </button>
              <button type="button" onClick={close} className={SOFT_BUTTON}>
                Cancel
              </button>
            </div>
            {mode === 'edit' && (
              // Remove club opens the confirmation dialog.
              <button
                type="button" // not a form submit
                onClick={() => {
                  setRemoveTried(false) // a fresh dialog
                  setConfirming(true) // opens it
                }}
                className={`${SOFT_BUTTON} text-danger!`}
              >
                Remove club
              </button>
            )}
          </div>
        </form>
      </dialog>
      {confirming && club !== undefined && (
        <RemoveClubDialog
          club={club}
          busy={busy}
          error={removeTried && !busy && !outcomeHidden ? outcomeLine(outcome, drafts.name) : null}
          onConfirm={confirmRemove}
          onCancel={() => {
            if (removeTried) setOutcomeHidden(true) // its failure line goes with it
            setConfirming(false)
          }}
        />
      )}
    </>
  )
}
