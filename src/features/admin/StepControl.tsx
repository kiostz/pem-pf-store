// The Step select on an open order: New, Paid or Handed out, either way, saved at once; Cancelled is not here because Cancel order has its own dialog.

import { useId } from 'react' // a unique id per select
import type { OrderStep } from '../../../workers/admin/src/admin-types.ts' // the steps
import { FIELD_BOX } from './admin-boxes.ts' // the shared 44 px field

/**
 * Draws the select.
 * @param step the step now
 * @param busy true while a change is saving
 * @param onChange called with the step the admin picked
 * @return a labelled select
 */
export function StepControl({
  step,
  busy,
  onChange,
}: {
  step: OrderStep // the step now
  busy: boolean // a save is running
  onChange: (step: OrderStep) => void // called on a pick
}) {
  const id = useId() // ties the label to the select
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="text-text-muted text-sm font-medium">
        Step
      </label>
      <select
        id={id} // the label points here
        value={step} // controlled: a failed save leaves the old step shown
        aria-disabled={busy} // one change at a time; not `disabled`, which would drop keyboard focus mid-save
        onChange={(event) => !busy && onChange(event.target.value as OrderStep)} // the pick, ignored while saving
        className={`category-filter ${FIELD_BOX} min-w-40 aria-disabled:opacity-60`} // the site's select styling, dimmed while saving
      >
        {/* Cancelled is not an option: Cancel order has its own dialog. */}
        <option value="new">New</option>
        <option value="paid">Paid</option>
        <option value="handed_out">Handed out</option>
      </select>
    </div>
  )
}
