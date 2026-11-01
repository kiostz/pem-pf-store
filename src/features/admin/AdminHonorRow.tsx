// One row of the Items screen: the item's name and Category label, its status control and stock stepper, a Changed label while edited, and a flag after a conflict.

import type { AdminHonor, HonorStatus } from '../../../workers/admin/src/admin-types.ts' // the row and status types
import { StatusControl } from './StatusControl.tsx' // Active or Hidden
import { StockStepper } from './StockStepper.tsx' // the number

/**
 * Draws the row.
 * @param honor the row as the admin saw it
 * @param pending the admin's unsaved edits to this row, if any
 * @param conflict the row's current values when a save found it changed, to flag
 * @param onStatus called with the new status
 * @param onStock called with the new stock
 * @return a card with two lines on a phone and one from 768 px
 */
export function AdminHonorRow({
  honor,
  pending,
  conflict,
  onStatus,
  onStock,
}: {
  honor: AdminHonor // the row as seen
  pending?: { status?: HonorStatus; stock?: number } // the unsaved edits
  conflict?: AdminHonor // the current values after a refused save
  onStatus: (status: HonorStatus) => void // a status pick
  onStock: (stock: number) => void // a stock commit
}) {
  const changed = pending !== undefined // the row has an edit
  return (
    // A white card; a pending row also gets an oxblood edge on its start side, so the state is never colour alone (the Changed label says it too).
    <li
      className={`bg-bg-surface border-border-subtle rounded-card flex flex-wrap items-center gap-x-4 gap-y-2 border p-3 md:flex-nowrap ${changed ? 'shadow-[inset_4px_0_0_var(--color-accent)]' : ''}`} // one line from 768 px
    >
      {/* Name and Category label; takes the width the controls leave. */}
      <div className="min-w-0 flex-1 basis-full md:basis-0">
        <p className="font-medium wrap-break-word">{honor.name}</p> {/* the name wraps rather than truncates */}
        <p className="text-text-muted flex items-center gap-2 text-sm">
          {honor.category} {/* the Category label */}
          {
            changed && (
              <span className="bg-bg-soft text-accent rounded-pill px-2 text-xs font-medium">Changed</span>
            ) /* pending: a word, not only the edge */
          }
        </p>
      </div>
      {/* The two controls on the second line at 375 px, at the end of the one line from 768 px. */}
      <div className="flex w-full items-center justify-between gap-2 md:w-auto md:justify-end">
        <StatusControl honorName={honor.name} status={pending?.status ?? honor.status} onChange={onStatus} />{' '}
        {/* Active or Hidden */}
        <StockStepper honorName={honor.name} stock={pending?.stock ?? honor.stock} onChange={onStock} />{' '}
        {/* the number */}
      </div>
      {/* After a refused save: what the row holds now. */}
      {conflict !== undefined && (
        <p className="bg-tag-warning text-on-tag-warning rounded-card w-full px-3 py-2 text-sm">
          {`Changed since you opened this page: now ${conflict.status === 'active' ? 'Active' : 'Hidden'}, ${conflict.stock} in stock`}
        </p>
      )}
    </li>
  )
}
