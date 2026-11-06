// The cart screen: order lines A to Z with Unavailable lines kept in place, the Removed note with Undo, and the Checkout bar, so a buyer can check and change what they picked before the details page.

import { useEffect, useRef, useState } from 'react' // the removal, focus moves and the heading focus
import type { CatalogueLoad } from '@/features/catalogue/use-catalogue-data.ts' // the load the app hands over
import { useOrderForm } from '@/features/order/use-order-form.ts' // whether a send is running
import type { Item } from '@/shared/data/types.ts' // the shape of an item
import { DETAILS_HASH } from '@/shared/routes.ts' // the details page's address
import { ACTION_BOX } from '@/shared/ui/button-box.ts' // the retry button
import { byText } from '@/shared/sort/sort-by-name.ts' // names A to Z
import { PILL_DOCK } from '@/shared/ui/floating-pill-box.ts' // where the pill and the note sit
import { loadErrorText } from '@/shared/ui/load-error-text.ts' // the failed-load message by reason
import { SKELETON_PULSE } from '@/shared/ui/skeleton-box.ts' // the skeleton's pulse
import { CartIcon, InfoIcon } from './cart-icons.tsx' // the empty cart's icon and the banner's i
import { CART_CARD_BOX, CART_LINE_BOX, CART_PICTURE_BOX } from './cart-line-box.ts' // the card and line boxes, shared with the loading lines
import { cartCount, estimatedTotalCents, exceedsStock, GONE_NAME, lineLabel, resolveCart } from './cart.ts' // the cart maths, the stock rule and a line's label
import { CartLine } from './CartLine.tsx' // one line
import { CheckoutBar, REFUSED_TEXT } from './CheckoutBar.tsx' // the bottom bar, and the refusal note's text for a cart with no line left to check out
import { RemovedNote } from './RemovedNote.tsx' // the note with Undo
import { useCart } from './use-cart.ts' // the cart

const SKELETON_LINES = 3 // how many skeleton lines the loading state shows

// One line of the card as drawn: an order line or an Unavailable one.
type ShownLine = { id: string; honor: Item | null; quantity: number; unavailable: boolean } // a shown line holds its item, null when gone

// The line just removed, for the note and for Undo; label names it for a screen reader; afterId is the line that followed it.
type Removal = { id: string; name: string; label: string; quantity: number; keyboard: boolean; afterId: string | null }

// Where focus goes after the next draw: onto a restored line, onto the line after a removed one (or the heading), or nowhere.
type FocusRequest = { kind: 'restored'; id: string } | { kind: 'after'; id: string | null } | { kind: 'none' }

/**
 * Draws the cart screen.
 * @param data the load: state, skeleton gate and retry
 * @param onBack called by Browse more
 * @return the heading, the Unavailable banner, the lines, the Removed note and the Checkout bar
 */
export function CartScreen({ data, onBack }: { data: CatalogueLoad; onBack: () => void }) {
  const { state, showSkeleton, retry } = data // load state, skeleton gate and retry
  const { quantities, setQuantity, takeOutUnavailable } = useCart() // the cart and its take-out
  const headingRef = useRef<HTMLHeadingElement>(null) // focused on arrival
  const listRef = useRef<HTMLUListElement>(null) // where a line is found for focus
  const { sending, refused } = useOrderForm() // an order is being sent: the screen waits, even after leaving and coming back
  const [removal, setRemoval] = useState<Removal | null>(null) // the Removed note, one at a time
  const [focusRequest, setFocusRequest] = useState<FocusRequest>({ kind: 'none' }) // a focus move waiting for the next draw

  // Arriving keyboard and screen-reader users start at the heading.
  useEffect(() => {
    headingRef.current?.focus() // the heading has tabIndex -1
  }, [])

  const currency = state.status === 'ready' ? state.settings.currency : '' // only read once ready
  const honors = state.status === 'ready' ? state.items : [] // every item the shop lists
  const { lines, unavailable } = resolveCart(quantities, honors) // orderable lines A to Z, and what cannot be ordered
  const shownLines: ShownLine[] = [
    ...lines.map((line) => ({ id: line.honor.id, honor: line.honor, quantity: line.quantity, unavailable: false })), // orderable
    ...unavailable.map(({ honorId }) => ({
      id: honorId, // the id
      honor: null, // the shop no longer lists it, so there is no honor to show
      quantity: quantities[honorId], // kept so Undo can restore it
      unavailable: true, // greyed
    })), // not in the shop
  ].sort((a, b) => byText(a.honor?.name ?? '￿', b.honor?.name ?? '￿') || byText(a.id, b.id)) // A to Z, gone honors last, equal names by id so Undo restores the old place
  const totalCents = estimatedTotalCents(lines) // orderable lines only
  const blocked = lines.some(exceedsStock) // a line above today's stock, or Sold out: Checkout waits for the buyer to fix it
  const refusalShown = refused && (blocked || unavailable.length > 0) // the Worker's refusal note stands: there is a line to fix
  const refusalAboveLines = refusalShown && lines.length === 0 // no Checkout is left, so the note stands under the heading, above the Unavailable line

  // Moves focus after the draw that follows a removal, an Undo or the note's end; a tick later, so a field committed by leaving it has handed focus on.
  useEffect(() => {
    if (focusRequest.kind === 'none') return // nothing waiting
    const timer = window.setTimeout(() => {
      const active = document.activeElement // where focus is now
      const lost = active === null || active === document.body || active === headingRef.current // gone with the removed control
      setFocusRequest({ kind: 'none' }) // done either way
      if (!lost) return // the buyer chose another control: leave it
      const line = (id: string | null) =>
        id === null ? null : (listRef.current?.querySelector(`[data-line-id="${CSS.escape(id)}"]`) ?? null) // the line with this id
      if (focusRequest.kind === 'restored') {
        const restored = line(focusRequest.id) // the line that came back
        ;(restored?.querySelector<HTMLElement>('input') ?? restored?.querySelector<HTMLElement>('button'))?.focus() // Undo: the number field, or the trash of an Unavailable line
      } else {
        const next = line(focusRequest.id) // the line after the removed one
        if (next)
          next.querySelector<HTMLElement>('button, input')?.focus() // its first control
        else headingRef.current?.focus() // none after it: the heading
      }
    }, 0) // after the focus change
    return () => window.clearTimeout(timer) // a newer request or leaving the screen cancels it
  }, [focusRequest])

  /**
   * Removes a line and shows the note.
   * @param line the line
   * @param keyboard true when the keyboard did it
   */
  const remove = (line: ShownLine, keyboard: boolean) => {
    const index = shownLines.findIndex((other) => other.id === line.id) // its place
    const afterId = shownLines[index + 1]?.id ?? null // the line that follows it
    setRemoval({
      id: line.id,
      name: line.honor?.name ?? GONE_NAME,
      label: lineLabel(line.honor, line.id),
      quantity: line.quantity,
      keyboard,
      afterId,
    }) // replaces any earlier note
    setQuantity(line.id, 0) // out of the cart
    if (!keyboard) setFocusRequest({ kind: 'after', id: afterId }) // the trash is gone: the next line, or the heading (a keyboard removal puts focus on Undo)
  }

  /** Puts the removed line back at its old quantity. */
  const undo = () => {
    if (removal === null) return // nothing to undo
    setQuantity(removal.id, removal.quantity) // the old quantity
    setFocusRequest({ kind: 'restored', id: removal.id }) // its field takes focus once drawn
    setRemoval(null) // the note is done
  }

  /** Ends the note after its hold, moving focus on if it was inside. */
  const endNote = () => {
    const insideNote = document.activeElement?.closest('[data-testid="removed-note"]') != null // focus is on Undo
    if (insideNote && removal !== null) setFocusRequest({ kind: 'after', id: removal.afterId }) // the same way as after a removal
    setRemoval(null) // the note goes; the removal stands
  }

  /** Moves focus to the first marked line when one is above the stock; otherwise takes the unavailable lines out and opens the details page. */
  const checkout = () => {
    if (blocked) {
      listRef.current?.querySelector<HTMLElement>('[data-over-stock="true"] input')?.focus() // A to Z, the first marked line's number field
      return // the details page waits
    }
    takeOutUnavailable() // one write, before the address changes
    window.location.hash = DETAILS_HASH // a new history entry, so Back returns here
  }

  const unavailableCount = unavailable.length // lines, not quantities
  // The 768 px centred column keeps a line's picture, name and stepper together on desktop; the bottom padding clears the bar and the note.
  return (
    <div inert={sending} aria-busy={sending} className={`mx-auto max-w-3xl ${refusalShown && !refusalAboveLines ? 'pb-52' : blocked ? 'pb-40' : 'pb-24'}`}>
      {/* Where focus lands on arrival. */}
      <h2 ref={headingRef} tabIndex={-1} className="sm:text-title mt-2 text-xl font-bold outline-none">
        Your cart
      </h2>
      {/* The refusal note when the cart's only line was dropped: the dark note of the dock, in the flow. */}
      {state.status === 'ready' && refusalAboveLines && (
        <p role="alert" className="bg-bg-inverse text-on-inverse rounded-card animate-note-in motion-reduce:animate-fade-in mt-3 px-4 py-3 text-sm">
          {REFUSED_TEXT}
        </p>
      )}
      {/* A plain paragraph right after the heading, no live region: it is read with the page, not over the heading's focus. */}
      {state.status === 'ready' && unavailableCount > 0 && (
        <p className="bg-tag-warning text-on-tag-warning rounded-card mt-3 flex items-center gap-2 p-3 text-sm font-medium">
          <InfoIcon className="size-5 shrink-0" /> {/* decorative */}
          {unavailableCount === 1
            ? '1 item is no longer available'
            : `${unavailableCount} items are no longer available`}
        </p>
      )}
      {/* Loading shows nothing for 300 ms, then lines of the same shape. */}
      {showSkeleton && (
        <div aria-hidden="true" className={`${CART_CARD_BOX} ${SKELETON_PULSE}`}>
          {Array.from({ length: SKELETON_LINES }, (_, index) => (
            // A skeleton line has the box of a real line.
            <div key={index} data-testid="cart-skeleton-line" className={CART_LINE_BOX}>
              <div className={`${CART_PICTURE_BOX} bg-border-subtle`} /> {/* the picture */}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex h-5 items-center justify-between gap-3">
                  <div className="bg-border-subtle h-4 w-3/5 rounded-sm" /> {/* the name */}
                  <div className="bg-border-subtle h-4 w-14 rounded-sm" /> {/* the line total */}
                </div>
                <div className="flex h-9 items-center justify-between gap-3">
                  <div className="bg-border-subtle h-3 w-16 rounded-sm" /> {/* the price of one, where "Only 2 left" would stand */}
                  <div className="bg-border-subtle rounded-pill h-9 w-33" /> {/* the stepper pill, 132 px */}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* The same copy as the catalogue, and the way to retry. */}
      {state.status === 'error' && (
        <>
          <p className="text-danger mt-3 min-h-6">{loadErrorText(state.reason)}</p>
          <button
            type="button" // not a form submit
            onClick={retry} // run the load again
            className={`${ACTION_BOX} bg-accent text-on-accent mt-4 px-6`}
          >
            Try again
          </button>
        </>
      )}
      {state.status === 'ready' && (
        <>
          {/* One card of lines; no total row, the bar below has it. */}
          {shownLines.length > 0 && (
            <div className={CART_CARD_BOX}>
              {/* The list: its ref is where a line is found for focus. */}
              <ul ref={listRef}>
                {shownLines.map((shown) => (
                  // one line per honor, keyed by id
                  <CartLine
                    key={shown.id}
                    id={shown.id}
                    honor={shown.honor}
                    quantity={shown.quantity}
                    currency={currency}
                    unavailable={shown.unavailable}
                    onChange={(quantity) => setQuantity(shown.id, quantity)} // edit the cart
                    onRemove={(keyboard) => remove(shown, keyboard)} // trash or typed 0
                  />
                ))}
              </ul>
            </div>
          )}
          {/* The invoice note, only with something to order. */}
          {lines.length > 0 && (
            <p className="text-text-muted mt-2 text-sm">
              Estimated total at today&apos;s prices. The treasurer will email you the invoice.
            </p>
          )}
          {/* Nothing at all in the cart: say so, in the upper third; the bar leads back. */}
          {shownLines.length === 0 && (
            <div className="mt-[12vh] flex flex-col items-center gap-3 text-center">
              <div className="bg-bg-soft text-text-muted flex size-22 items-center justify-center rounded-full">
                <CartIcon className="size-10" /> {/* decorative */}
              </div>
              <p className="text-xl font-bold">Your cart is empty</p> {/* what is so */}
              <p className="text-text-muted">Add items from the shop and they&apos;ll show up here.</p>{' '}
              {/* what to do */}
            </div>
          )}
        </>
      )}
      {/* The one status region, mounted with the screen and empty until a removal or the skeleton, so the first announcement is heard. */}
      <p role="status" className="sr-only">
        {removal !== null ? `${removal.name} removed` : showSkeleton ? 'Loading the shop' : ''}
      </p>
      {/* The dock: the note floats 12 px above the pill, both as wide as the pill. */}
      {state.status === 'ready' && (
        <div className={PILL_DOCK}>
          {removal !== null && (
            <RemovedNote
              key={`${removal.id}:${removal.quantity}`} // a new removal is a new note with a fresh timer
              name={removal.name}
              label={removal.label}
              onUndo={undo}
              onEnd={endNote}
              takeFocus={removal.keyboard}
            />
          )}
          <CheckoutBar
            totalCents={totalCents}
            itemCount={cartCount(lines)}
            currency={currency}
            orderable={lines.length > 0}
            blocked={blocked} // a line above the stock
            refused={refusalShown && !refusalAboveLines} // the Worker refused the last send, and there is a Checkout to explain
            onCheckout={checkout}
            onBrowse={onBack}
          />
        </div>
      )}
    </div>
  )
}
