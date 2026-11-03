// The Delete dialog: asks before a Club-added item is deleted, with focus on "Keep item" so Enter never deletes by accident.

import { useEffect, useRef } from 'react' // the dialog element and the focus
import { ACTION_BOX } from '@/shared/ui/button-box.ts' // the shared 44 px pill action
import { SHEET_BOX, SOFT_BUTTON } from './admin-boxes.ts' // the sheet shape and the quiet button

/**
 * Draws the dialog.
 * @param name the item's name
 * @param busy true while the delete request runs: Delete item reads "Deleting…" and does nothing
 * @param error a line to show after a failed delete, or null
 * @param onConfirm called by Delete item
 * @param onCancel called by Keep item, Escape and a tap on the backdrop
 * @return a modal dialog
 */
export function DeleteDialog({
  name,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  name: string // the item's name
  busy: boolean // a delete is running
  error: string | null // the failure line
  onConfirm: () => void // Delete item
  onCancel: () => void // Keep item
}) {
  const dialog = useRef<HTMLDialogElement>(null) // the element
  const keep = useRef<HTMLButtonElement>(null) // the safe action

  // Opens as a modal and puts focus on the safe action; returns focus to what held it when this goes away.
  useEffect(() => {
    const element = dialog.current // the dialog
    const opener = document.activeElement as HTMLElement | null // what held focus before
    if (element !== null && !element.open) element.showModal() // modal: traps focus, closes on Escape
    keep.current?.focus() // Keep item first
    return () => {
      if (opener?.isConnected) opener.focus() // back to where the admin was
    }
  }, [])

  return (
    <dialog
      ref={dialog} // opened above
      aria-labelledby="delete-title" // its name
      onClose={onCancel} // Escape closes it natively
      onClick={(event) => event.target === dialog.current && onCancel()} // a tap on the backdrop
      className={SHEET_BOX}
    >
      <h2 id="delete-title" className="text-lg font-bold">
        {`Delete ${name}?`}
      </h2>
      <p className="text-text-muted mt-2">
        Buyers can&apos;t order it any more, and this can&apos;t be undone. Past orders keep its name and price.
      </p>
      {error !== null && (
        <p role="alert" className="text-danger mt-3">
          {error}
        </p>
      )}
      {/* Keep item first in reading order and focused; Delete item is the danger action. */}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" ref={keep} onClick={onCancel} className={SOFT_BUTTON}>
          Keep item
        </button>
        <button
          type="button" // not a form submit
          aria-disabled={busy} // a second click is ignored
          onClick={() => !busy && onConfirm()} // does nothing while busy
          className={`${ACTION_BOX} bg-danger text-bg-app px-5 aria-disabled:opacity-60`} // red is for this alone; the page colour as its lettering holds contrast in both themes (white on dark mode's light red would not)
        >
          {busy ? 'Deleting…' : 'Delete item'}
        </button>
      </div>
    </dialog>
  )
}
