// The cart's floating pill: Estimated total with the item count and Checkout, or one Browse more when nothing can be ordered, so the next step is always one tap away.

import { useRef } from 'react' // the double-tap guard
import { formatPrice } from '@/shared/format/price.ts' // "RM 20.00"
import { PILL_ACTION, PILL_SURFACE } from '@/shared/ui/floating-pill-box.ts' // the pill look shared with the tab pill

const BLOCKED_NOTE_ID = 'checkout-blocked-note' // the note's id, for the button's description

/**
 * Draws the pill; the cart screen places it in the dock.
 * @param totalCents the Estimated total of the orderable lines, in cents
 * @param itemCount the Item count of the orderable lines
 * @param currency the currency code from the settings
 * @param orderable false when no line can be ordered: the pill then holds Browse more alone
 * @param blocked true when a line is above today's stock: a note shows over the pill and Checkout only calls onCheckout, which moves focus, without the double-tap guard
 * @param onCheckout called once when Checkout is pressed (a second press is ignored)
 * @param onBrowse called when Browse more is pressed
 * @return the pill
 */
export function CheckoutBar({
  totalCents,
  itemCount,
  currency,
  orderable,
  blocked = false,
  onCheckout,
  onBrowse,
}: {
  totalCents: number
  itemCount: number
  currency: string
  orderable: boolean
  blocked?: boolean
  onCheckout: () => void
  onBrowse: () => void
}) {
  const pressed = useRef(false) // set by the first Checkout press, so a double tap goes once
  return (
    <>
      {/* Why Checkout will not open the details page yet; stacked over the pill by the dock. */}
      {orderable && blocked && (
        <p
          id={BLOCKED_NOTE_ID} // the button is described by it
          className="bg-bg-inverse text-on-inverse rounded-card animate-note-in motion-reduce:animate-fade-in w-full px-4 py-3 text-sm" // the Removed note's dark look and entrance, as wide as the pill
        >
          Lower or remove the items marked in red to check out.
        </p>
      )}
      {/* The white pill: the total on the left, the action on the right, or one action across. */}
      <div className={`${PILL_SURFACE} ${orderable ? 'ps-5 justify-between gap-2' : ''}`}>
        {orderable ? (
          <>
            {/* The total, announced politely as it changes. */}
            <p aria-live="polite" className="min-w-0 leading-tight">
              <span className="text-text-muted block truncate text-xs">{`Estimated total · ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}</span>{' '}
              {/* the label and the count */}
              <span className="block truncate text-lg font-bold tabular-nums">
                {formatPrice(totalCents / 100, currency)}
              </span>{' '}
              {/* the sum */}
            </p>
            <button
              type="button" // not a form submit
              aria-describedby={blocked ? BLOCKED_NOTE_ID : undefined} // read why with the button
              onClick={() => {
                if (blocked) return onCheckout() // nothing opens, so there is no double tap to guard; every press moves focus
                if (pressed.current) return // a double tap goes once
                pressed.current = true // the first press
                onCheckout() // take out the unavailable lines and open the details page
              }}
              className={`${PILL_ACTION} shrink-0 px-6`} // the primary pill
            >
              Checkout
              <span aria-hidden="true">›</span> {/* leads on; not part of the name */}
            </button>
          </>
        ) : (
          <button
            type="button" // not a form submit
            onClick={onBrowse} // back to the shop
            className={`${PILL_ACTION} w-full`} // one full-width action
          >
            Browse more
            <span aria-hidden="true">›</span> {/* leads on; not part of the name */}
          </button>
        )}
      </div>
    </>
  )
}
