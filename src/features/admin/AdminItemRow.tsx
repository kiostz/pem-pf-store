// One row of the Items screen: the item's picture, its name as plain text, a line "Category · Subcategory · price · changed date", its status control, the stock as text and an Edit button (the only way into the Item sheet), a Changed label while edited, and the latest values after a conflict.

import type { AdminItem, ItemStatus } from '../../../workers/admin/src/admin-types.ts' // the row and status types
import { formatPrice } from '@/shared/format/price.ts' // "RM 25.00"
import { PatchPicture } from '@/shared/ui/PatchPicture.tsx' // the picture or its Category mark
import { formatChangedShort } from './admin-dates.ts' // "changed 3 Nov"
import { describeLatest } from './latest-line.ts' // the "Latest:" text
import type { ItemEdits } from './pending-changes.ts' // the unsaved edits
import { StatusControl } from './StatusControl.tsx' // Active or Hidden

const PICTURE_BASE = '/pictures' // the Admin Worker serves pictures from its own origin

/**
 * Draws the row.
 * @param item the row as the admin saw it
 * @param pending the admin's unsaved edits to this row, if any
 * @param conflict the row's current values when a save found it changed, to flag
 * @param currency the ISO currency code for the price
 * @param now the current time, for the "changed" date's year
 * @param subcategory the subcategory name to show: the pending one when edited, else the item's own; null shows none
 * @param onEdit called when the Edit button is pressed
 * @param onStatus called with the new status
 * @return a card with two lines on a phone and one from 768 px
 */
export function AdminItemRow({
  item,
  pending,
  conflict,
  currency,
  now,
  subcategory, // the name to show, or null
  onEdit, // the Edit button
  onStatus, // the Status control
}: {
  item: AdminItem // the row as seen
  pending?: ItemEdits // the unsaved edits
  conflict?: AdminItem // the current values after a refused save
  currency: string // the ISO code
  now: Date // the current time
  subcategory: string | null // the subcategory name to show
  onEdit: () => void // the Edit button opens the sheet
  onStatus: (status: ItemStatus) => void // a status pick
}) {
  const changed = pending !== undefined // the row has an edit
  const name = pending?.name ?? item.name // an edited name shows at once
  const price = formatPrice((pending?.priceCents ?? item.priceCents) / 100, currency) // the shown price
  return (
    // A white card; a pending row also gets an oxblood edge on its start side, so the state is never colour alone (the Changed label says it too).
    <li
      className={`bg-bg-surface border-border-subtle rounded-card flex flex-wrap items-center gap-x-3 gap-y-1 border p-3 md:gap-x-4 ${changed ? 'shadow-[inset_4px_0_0_var(--color-accent)]' : ''}`} // one line from 768 px, wrapping only for the flag's own full-width line
    >
      {/* After a refused save: the note, and what the item holds now, above the row's own values. */}
      {conflict !== undefined && (
        // The amber flag, full width above the row's own values.
        <div className="bg-tag-warning text-on-tag-warning rounded-card mb-1 w-full px-3 py-2 text-sm">
          <p className="font-bold">This item has been updated.</p> {/* the note */}
          {/* what the item holds now */}
          <p>{`Latest: ${describeLatest(conflict, currency)}`}</p>
        </div>
      )}
      {/* The picture, or the item's Category mark, 44 px. */}
      <div className="order-1">
        <PatchPicture item={{ image: item.image, category: pending?.category ?? item.category }} size="small" pictureBase={PICTURE_BASE} /> {/* the stored picture, and the mark of the pending category */}
      </div>
      {/* Name and the details line; takes the width the controls leave. */}
      <div className="order-2 min-w-0 flex-1">
        <p className="font-medium wrap-break-word">{name}</p> {/* plain text: the Edit button is the way in */}
        <p className="text-text-muted flex flex-wrap items-center gap-x-2 text-sm">
          {[pending?.category ?? item.category, subcategory, price, formatChangedShort(item.modifiedAt, now)].filter((part) => part !== null).join(' · ')}{' '}{/* the category, the subcategory when set, the price and the date, joined with dots */}
          {
            changed && (
              <span className="bg-bg-soft text-accent rounded-pill px-2 text-xs font-medium">Changed</span>
            ) /* pending: a word, not only the edge */
          }
        </p>
      </div>
      {/* The Status control and the stock text: line 2 under the text (indented 56 px, the picture and gap) at 375 px, in the one line from 768 px. */}
      <div className="order-4 flex w-full items-center justify-between gap-2 pl-14 md:order-3 md:w-auto md:justify-end md:pl-0">
        <StatusControl itemName={name} status={pending?.status ?? item.status} onChange={onStatus} />{' '}
        {/* Active or Hidden */}
        {/* The stock as text: a pending edit shows its number, in a fixed 96 px slot so the switch never shifts. */}
        <span className="w-24 shrink-0 text-right text-sm tabular-nums">{`${pending?.stock ?? item.stock} in stock`}</span>
      </div>
      {/* The Edit button: the end of line 1 at 375 px, the end of the row from 768 px; after the Status control in the tab order. */}
      <button // the Edit button
        type="button" // not a form submit
        aria-label={`Edit ${name}`} // an icon only, so the label names the item
        onClick={onEdit} // opens the Item sheet
        className="bg-bg-soft text-accent focus-visible:outline-focus-ring rounded-pill order-3 flex size-11 shrink-0 items-center justify-center transition-transform duration-(--duration-press) focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] md:order-4" // 44 px soft round button, ring outside, press feedback
      >
        <svg // the Edit button icon
          aria-hidden="true" // the label says it
          viewBox="0 0 24 24" // the Tabler grid
          className="size-6" // 24 px
          fill="none" // outline icon
          stroke="currentColor" // the button's colour
          strokeWidth="2" // Tabler's stroke
          strokeLinecap="round" // Tabler's caps
          strokeLinejoin="round" // Tabler's joins
        >
          <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /> {/* the Edit button icon */}
          <path d="M13.5 6.5l4 4" /> {/* its tip */}
        </svg>
      </button>
    </li>
  )
}
