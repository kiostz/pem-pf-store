// The Cancel dialog: asks before an order is cancelled, with the restock box ticked, and puts focus on "Keep order" so Enter never cancels by accident.

import { useEffect, useRef, useState } from 'react' // the dialog element, the focus and the box
import type { AdminOrder } from '../../../workers/admin/src/admin-types.ts' // the order
import { ACTION_BOX } from '@/shared/ui/button-box.ts' // the shared 44 px pill action
import { SHEET_BOX, SOFT_BUTTON } from './admin-boxes.ts' // the sheet shape and the quiet button

/**
 * Draws the dialog.
 * @param order the order to cancel
 * @param busy true while the cancel runs: Cancel order reads "Cancelling…" and does nothing
 * @param error a line to show after a failed cancel, or null
 * @param onConfirm called by Cancel order with whether the stock goes back
 * @param onCancel called by Keep order, Escape and a tap on the backdrop
 * @return a modal dialog
 */
export function CancelDialog({
  order,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  order: AdminOrder // the order
  busy: boolean // a cancel is running
  error: string | null // the failure line
  onConfirm: (restock: boolean) => void // Cancel order
  onCancel: () => void // Keep order
}) {
  const dialog = useRef<HTMLDialogElement>(null) // the element
  const keep = useRef<HTMLButtonElement>(null) // the safe action
  const [restock, setRestock] = useState(true) // the box starts ticked
  const back = order.lines.filter((line) => line.inShop) // lines whose item is still sold
  const count = back.reduce((sum, line) => sum + line.quantity, 0) // items that can go back
  const gone = order.lines.filter((line) => !line.inShop) // lines whose item was deleted

  // Opens as a modal and puts focus on the safe action; returns focus to what held it when this goes away.
  useEffect(() => {
    const element = dialog.current // the dialog
    const opener = document.activeElement as HTMLElement | null // what held focus before
    if (element !== null && !element.open) element.showModal() // modal: traps focus, closes on Escape
    keep.current?.focus() // Keep order first
    return () => {
      if (opener?.isConnected) opener.focus() // back to where the admin was
    }
  }, [])

  return (
    <dialog
      ref={dialog} // opened above
      aria-labelledby="cancel-title" // its name
      onCancel={(event) => busy && event.preventDefault()} // Escape does nothing while the cancel runs
      onClose={() => {
        if (!busy) onCancel() // Escape closes it natively
        else if (dialog.current && !dialog.current.open) {
          dialog.current.showModal() // a second Escape mid-request: reopen so the outcome is seen
          keep.current?.focus() // focus on Keep order, so Space cannot flip the restock box
        }
      }}
      onClick={(event) => event.target === dialog.current && !busy && onCancel()} // a tap on the backdrop
      className={SHEET_BOX}
    >
      <h2 id="cancel-title" className="text-lg font-bold">
        {`Cancel ${order.number}?`}
      </h2>
      <p className="text-text-muted mt-2">It stays in the list as Cancelled. This can&apos;t be undone.</p>
      {count > 0 && (
        <label className="mt-4 flex min-h-11 items-center gap-3">
          <input
            type="checkbox" // put the stock back or not
            checked={restock} // ticked by default
            onChange={(event) => setRestock(event.target.checked)} // the admin's choice
            className="accent-accent size-5 shrink-0" // a 20 px box in the brand colour inside a 44 px row
          />
          <span>{`Put ${count} ${count === 1 ? 'item' : 'items'} back in stock`}</span>
        </label>
      )}
      {gone.map((line) => (
        <p key={line.itemId} className="text-text-muted mt-2 text-sm">
          {`${line.name} is no longer in the shop, so it can't go back.`}
        </p> // one line per deleted item
      ))}
      {error !== null && (
        <p role="alert" className="text-danger mt-3">
          {error}
        </p>
      )}
      {/* Keep order first in reading order and focused; Cancel order is the danger action. */}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button" // not a form submit
          ref={keep} // focused on open
          aria-disabled={busy} // the answer is on its way
          onClick={() => !busy && onCancel()} // does nothing while busy
          className={`${SOFT_BUTTON} aria-disabled:opacity-60`} // dimmed while the cancel runs
        >
          Keep order
        </button>
        <button
          type="button" // not a form submit
          aria-disabled={busy} // a second click is ignored
          onClick={() => !busy && onConfirm(count > 0 && restock)} // does nothing while busy; no box means no restock
          className={`${ACTION_BOX} bg-danger text-bg-app px-5 aria-disabled:opacity-60`} // red is for this alone; the page colour as lettering holds contrast in both themes
        >
          {busy ? 'Cancelling…' : 'Cancel order'}
        </button>
      </div>
    </dialog>
  )
}
