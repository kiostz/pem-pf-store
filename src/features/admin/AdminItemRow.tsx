// One row of the Items screen: the item's name (opens the Item sheet), a line "Category · price · changed date", its status control and stock stepper, a Changed label while edited, and the latest values after a conflict.

import type { AdminItem, ItemStatus } from '../../../workers/admin/src/admin-types.ts' // the row and status types
import { formatPrice } from '@/shared/format/price.ts' // "RM 25.00"
import { formatChangedShort } from './admin-dates.ts' // "changed 3 Nov"
import { describeLatest } from './latest-line.ts' // the "Latest:" text
import type { ItemEdits } from './pending-changes.ts' // the unsaved edits
import { StatusControl } from './StatusControl.tsx' // Active or Hidden
import { StockStepper } from './StockStepper.tsx' // the number

/**
 * Draws the row.
 * @param item the row as the admin saw it
 * @param pending the admin's unsaved edits to this row, if any
 * @param conflict the row's current values when a save found it changed, to flag
 * @param currency the ISO currency code for the price
 * @param now the current time, for the "changed" date's year
 * @param onOpen called when the name is pressed
 * @param onStatus called with the new status
 * @param onStock called with the new stock
 * @return a card with two lines on a phone and one from 768 px
 */
export function AdminItemRow({
  item,
  pending,
  conflict,
  currency,
  now,
  onOpen,
  onStatus,
  onStock,
}: {
  item: AdminItem // the row as seen
  pending?: ItemEdits // the unsaved edits
  conflict?: AdminItem // the current values after a refused save
  currency: string // the ISO code
  now: Date // the current time
  onOpen: () => void // the name opens the sheet
  onStatus: (status: ItemStatus) => void // a status pick
  onStock: (stock: number) => void // a stock commit
}) {
  const changed = pending !== undefined // the row has an edit
  const name = pending?.name ?? item.name // an edited name shows at once
  const price = formatPrice((pending?.priceCents ?? item.priceCents) / 100, currency) // the shown price
  return (
    // A white card; a pending row also gets an oxblood edge on its start side, so the state is never colour alone (the Changed label says it too).
    <li
      className={`bg-bg-surface border-border-subtle rounded-card flex flex-wrap items-center gap-x-4 gap-y-2 border p-3 md:flex-nowrap ${changed ? 'shadow-[inset_4px_0_0_var(--color-accent)]' : ''}`} // one line from 768 px
    >
      {/* After a refused save: the note, and what the item holds now, above the row's own values. */}
      {conflict !== undefined && (
        <div className="bg-tag-warning text-on-tag-warning rounded-card w-full px-3 py-2 text-sm">
          <p className="font-bold">This item has been updated.</p> {/* the note */}
          {/* what the item holds now */}
          <p>{`Latest: ${describeLatest(conflict, currency)}`}</p>
        </div>
      )}
      {/* Name and the details line; takes the width the controls leave. */}
      <div className="min-w-0 flex-1 basis-full md:basis-0">
        <button
          type="button" // not a form submit
          onClick={onOpen} // opens the Item sheet
          className="focus-visible:outline-focus-ring decoration-text-muted/50 min-h-11 max-w-full min-w-11 text-left font-medium wrap-break-word underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-0" // 44 px target both ways; underlined so it reads as pressable
        >
          {name}
        </button>
        <p className="text-text-muted flex flex-wrap items-center gap-x-2 text-sm">
          {`${pending?.category ?? item.category} · ${price} · ${formatChangedShort(item.modifiedAt, now)}`}{' '}
          {/* the Category label, the price and the date */}
          {
            changed && (
              <span className="bg-bg-soft text-accent rounded-pill px-2 text-xs font-medium">Changed</span>
            ) /* pending: a word, not only the edge */
          }
        </p>
      </div>
      {/* The two controls on the second line at 375 px, at the end of the one line from 768 px. */}
      <div className="flex w-full items-center justify-between gap-2 md:w-auto md:justify-end">
        <StatusControl itemName={name} status={pending?.status ?? item.status} onChange={onStatus} />{' '}
        {/* Active or Hidden */}
        <StockStepper itemName={name} stock={pending?.stock ?? item.stock} onChange={onStock} /> {/* the number */}
      </div>
    </li>
  )
}
