// The confirmation page after a sent order: the whole order for the buyer to keep or print, or a note when this tab has no order to show.

import { useEffect, useRef, useState } from 'react' // the heading focus and the order read once
import { ACTION_BOX } from '@/shared/ui/button-box.ts' // the pill shape
import { formatPrice } from '@/shared/format/price.ts' // "RM 9.00"
import { CATALOGUE_HASH } from '@/shared/routes.ts' // the catalogue's address
import { readSentOrder } from './sent-order-storage.ts' // the order kept by the send

const PRIMARY_BOX = `${ACTION_BOX} bg-accent text-on-accent mt-6 w-full px-6 sm:w-auto print:hidden` // the oxblood pill, full width on a phone, never printed
const CARD_BOX = 'bg-bg-surface border-border-subtle rounded-card mt-4 border' // one white card, as the cart's

/**
 * Draws the confirmation page.
 * @param onBack called by Browse more, in the no-order state only
 * @return the order as sent with its print action, or the empty state with Browse more
 */
export function ConfirmationScreen({ onBack }: { onBack: () => void }) {
  const [order] = useState(() => readSentOrder()) // what this tab sent, read once so a bad value warns once
  const headingRef = useRef<HTMLHeadingElement>(null) // focused on arrival

  // Arriving keyboard and screen-reader users start at the heading.
  useEffect(() => {
    headingRef.current?.focus() // the heading has tabIndex -1
  }, [])

  if (order === null)
    return (
      // The same 768 px column as the sent order, so the no-order page lines up with it.
      <div className="mx-auto max-w-3xl">
        {/* Nothing sent in this tab: say so and lead back. */}
        <h2 ref={headingRef} tabIndex={-1} className="sm:text-title mt-2 text-xl font-bold outline-none">
          Your order
        </h2>
        <p className="text-text-muted mt-3">There is no order to show here.</p>
        <a
          href={CATALOGUE_HASH} // a real address for the link; the click is handed to the app
          onClick={(event) => {
            event.preventDefault() // the app decides where home is
            onBack() // to the catalogue
          }}
          className={PRIMARY_BOX} // the call to action, like the empty cart's
        >
          Browse more
        </a>
      </div>
    )
  const sentOn = new Date(order.sentAt).toLocaleDateString('en-GB', { dateStyle: 'medium' }) // "28 Oct 2026", the buyer's own day
  const money = (cents: number) => formatPrice(cents / 100, order.currency) // "RM 9.00"
  return (
    // The 768 px column of the cart and the details page.
    <div className="mx-auto max-w-3xl">
      {/* Where focus lands on arrival. */}
      <h2 ref={headingRef} tabIndex={-1} className="sm:text-title mt-2 text-xl font-bold outline-none">
        Order sent
      </h2>
      {/* Says why the page shows an earlier order than the one the buyer just tried to send. */}
      {order.changesNotSent && (
        <p role="note" className="bg-bg-app border-border-subtle rounded-card mt-3 border px-3 py-2 text-sm wrap-break-word">
          This order reached us before your changes, so your changes were not sent. Anything still in your cart can go
          in a new order.
        </p>
      )}
      {/* The buyer's only record of the order: the page's one large element, with the day it was sent. */}
      <div className={`${CARD_BOX} px-2 py-5 text-center print:break-inside-avoid`}>
        {/* what the number is */}
        <p className="text-text-muted text-sm">Order number</p>
        {/* the number, on one line */}
        <p className="mt-1 text-2xl font-bold tracking-wide whitespace-nowrap tabular-nums min-[360px]:text-3xl sm:text-4xl">
          {order.number}
        </p>
        {/* the day */}
        <p className="text-text-muted mt-1 text-sm">{sentOn}</p>
      </div>
      {/* What happens next, with the contact details so a typo shows. */}
      <p className="mt-4 wrap-break-word">
        {order.contact === null ? (
          "Keep this number. We'll review your order and contact you to confirm it. Thank you!" // no contact the order is sure to hold
        ) : (
          <>
            {`Keep this number. We'll review your order and contact you at ${order.contact.email} or `}
            {/* the number stays on one line */}
            <span className="whitespace-nowrap">{order.contact.phone}</span>
            {' to confirm it. Thank you!'}
          </>
        )}
      </p>
      {/* The order lines as sent, at the prices of that moment, in one card. */}
      <ul className={`${CARD_BOX} overflow-hidden`}>
        {/* one row per order line */}
        {order.lines.map((line) => (
          // the order line, keyed by item, with a rule between order lines and kept whole across a printed page break
          <li
            key={line.itemId}
            className="border-border-subtle flex items-start justify-between gap-3 border-b px-4 py-3 last:border-b-0 print:break-inside-avoid"
          >
            {/* the name and the quantity at its price; min-w-0 lets a long name wrap */}
            <div className="min-w-0">
              {/* the item */}
              <span className="font-medium wrap-break-word">{line.name}</span>
              {/* how many, at what price */}
              <span className="text-text-muted block text-sm">{`${line.quantity} × ${money(line.priceCents)}`}</span>
            </div>
            {/* the line total */}
            <span className="shrink-0 font-bold tabular-nums">{money(line.priceCents * line.quantity)}</span>
          </li>
        ))}
      </ul>
      {/* The estimated total, as in the cart. */}
      <p className="mt-4 flex justify-between gap-3 px-1 text-lg font-bold print:break-inside-avoid">
        {/* the label */}
        <span>Estimated total</span>
        {/* the sum */}
        <span className="tabular-nums">{money(order.totalCents)}</span>
      </p>
      {/* Who the order is for. */}
      <dl className={`${CARD_BOX} grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-4 py-3 print:break-inside-avoid`}>
        {/* The contact rows, only when every send carried the same contact. */}
        {order.contact !== null && (
          <>
            {/* label */}
            <dt className="text-text-muted">Name</dt>
            {/* the buyer */}
            <dd className="wrap-break-word">{order.contact.name}</dd>
            {/* label */}
            <dt className="text-text-muted">Phone</dt>
            {/* the buyer's number */}
            <dd className="wrap-break-word">{order.contact.phone}</dd>
          </>
        )}
        {/* label */}
        <dt className="text-text-muted">Club</dt>
        {/* the club */}
        <dd className="wrap-break-word">{order.club.email}</dd>
      </dl>
      {/* The one action; the header < is the way back. Not printed. */}
      <button
        type="button" // not a form submit
        onClick={() => window.print()} // the browser's print dialog, which also saves a PDF
        className={PRIMARY_BOX} // the primary pill
      >
        Save as PDF or print
      </button>
    </div>
  )
}
