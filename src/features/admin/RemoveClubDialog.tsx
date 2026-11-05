// The Remove dialog: asks before a club is removed, with focus on "Keep club" so Enter never removes by accident.

import { useEffect, useRef } from 'react' // the dialog element and the focus
import { ACTION_BOX } from '@/shared/ui/button-box.ts' // the shared 44 px pill action
import type { AdminClub } from '../../../workers/admin/src/admin-types.ts' // the club shape
import { SHEET_BOX, SOFT_BUTTON } from './admin-boxes.ts' // the sheet shape and the quiet button

/**
 * Draws the dialog.
 * @param club the club asked about
 * @param busy true while the remove request runs: Remove club reads "Removing…" and does nothing
 * @param error a line to show after a failed remove, or null
 * @param onConfirm called by Remove club
 * @param onCancel called by Keep club, Escape and a tap on the backdrop
 * @return a modal dialog
 */
export function RemoveClubDialog({
  club,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  club: AdminClub // the club asked about
  busy: boolean // a remove is running
  error: string | null // the failure line
  onConfirm: () => void // Remove club
  onCancel: () => void // Keep club
}) {
  const dialog = useRef<HTMLDialogElement>(null) // the element
  const keep = useRef<HTMLButtonElement>(null) // the safe action

  // Opens as a modal and puts focus on the safe action; returns focus to what held it when this goes away.
  useEffect(() => {
    const element = dialog.current // the dialog
    const opener = document.activeElement as HTMLElement | null // what held focus before
    if (element !== null && !element.open) element.showModal() // modal: traps focus, closes on Escape
    keep.current?.focus() // Keep club first
    return () => {
      if (opener?.isConnected) opener.focus() // back to where the admin was
    }
  }, [])

  return (
    <dialog
      ref={dialog} // opened above
      aria-labelledby="remove-club-title" // its name
      onCancel={(event) => busy && event.preventDefault()} // Escape does nothing while the remove runs
      onClose={() => {
        if (!busy) return onCancel() // Escape closed it natively
        if (dialog.current !== null && !dialog.current.open) dialog.current.showModal() // a remove is running: stay
      }}
      onClick={(event) => event.target === dialog.current && !busy && onCancel()} // a tap on the backdrop, ignored while busy
      className={SHEET_BOX}
    >
      <h2 id="remove-club-title" className="text-lg font-bold">
        {`Remove ${club.name}?`}
      </h2>
      <p className="text-text-muted mt-2">Buyers can&apos;t pick it any more. Past orders keep its name.</p>
      {error !== null && (
        <p role="alert" className="text-danger mt-3">
          {error}
        </p>
      )}
      {/* Keep club first in reading order and focused; Remove club is the danger action. */}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {/* Keep club is ignored while the remove runs. */}
        <button type="button" ref={keep} onClick={() => !busy && onCancel()} className={SOFT_BUTTON}>
          Keep club
        </button>
        <button
          type="button" // not a form submit
          aria-disabled={busy} // a second click is ignored
          onClick={() => !busy && onConfirm()} // does nothing while busy
          className={`${ACTION_BOX} bg-danger text-bg-app px-5 aria-disabled:opacity-60`} // red is for this alone; the page colour as its lettering holds contrast in both themes
        >
          {busy ? 'Removing…' : 'Remove club'}
        </button>
      </div>
    </dialog>
  )
}
