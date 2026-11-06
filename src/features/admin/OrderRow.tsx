// One order in the Orders list: a disclosure row with the number, step tag, date, buyer, club and total; open, it shows the lines, the contact links, the Step select and Cancel order, and the outcome of each change.

import { useEffect, useId, useRef, useState } from 'react' // the open state, ids and the in-flight guard
import type { AdminOrder, OrderStep } from '../../../workers/admin/src/admin-types.ts' // the shared shapes
import { formatPrice } from '@/shared/format/price.ts' // "RM 12.00"
import { changeOrderStep, SIGNED_OUT_NOTE } from './admin-api.ts' // the step call
import { formatAdminTime } from './admin-dates.ts' // Malaysia dates
import { SOFT_BUTTON } from './admin-boxes.ts' // the quiet 44 px action
import { CancelDialog } from './CancelDialog.tsx' // asks before a cancel
import { StepControl } from './StepControl.tsx' // the Step select

const LABELS: Record<OrderStep, string> = {
  new: 'New',
  paid: 'Paid',
  handed_out: 'Handed out',
  cancelled: 'Cancelled',
} // the step words on screen

const TAGS: Record<OrderStep, string> = {
  new: 'bg-bg-soft text-accent', // soft fill, oxblood text
  paid: 'bg-bg-soft text-text-default', // soft fill, ink
  handed_out: 'bg-bg-inverse text-on-inverse', // the dark note's pair
  cancelled: 'border-danger text-danger bg-bg-surface border', // the danger text on the card, outlined
} // each step's tag colours (the words and the icon say it too)

const ICONS: Record<OrderStep, string> = {
  new: 'M12 8v4l2 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', // a clock: waiting
  paid: 'M5 12l5 5L20 7', // a tick
  handed_out: 'M4 8l8-4 8 4v8l-8 4-8-4V8Zm0 0l8 4m0 0l8-4m-8 4v8', // a parcel
  cancelled: 'M6 6l12 12M18 6L6 18', // a cross
} // one 24 px outline path per step

/**
 * Draws a step tag: an icon and the word, never colour alone.
 * @param step the step
 * @return the tag
 */
function StepTag({ step }: { step: OrderStep }) {
  return (
    <span className={`rounded-pill inline-flex shrink-0 items-center gap-1 px-3 py-1 text-sm font-medium ${TAGS[step]}`}>
      <svg
        aria-hidden="true" // the word beside it says it
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={ICONS[step]} /> {/* the step's icon */}
      </svg>
      {LABELS[step]}
    </span>
  )
}

// What the row says after a change.
type Message = { text: string; failed?: boolean }

/**
 * Draws the order.
 * @param order the order as listed
 * @param onChanged called with the order the Worker returns after a change or a conflict
 * @param defaultOpen true to start open (the order a link or a lookup found)
 * @return a list item
 */
export function OrderRow({
  order,
  onChanged,
  defaultOpen = false,
}: {
  order: AdminOrder // the order
  onChanged: (order: AdminOrder) => void // the newer order
  defaultOpen?: boolean // starts open
}) {
  const panel = useId() // the disclosure's target
  const [open, setOpen] = useState(defaultOpen) // the details show
  const [busy, setBusy] = useState(false) // a change is saving
  const [message, setMessage] = useState<Message | null>(null) // the outcome line
  const [retry, setRetry] = useState<OrderStep | null>(null) // the step a failed save can try again
  const [cancelling, setCancelling] = useState(false) // the Cancel dialog is open
  const [cancelError, setCancelError] = useState<string | null>(null) // its failure line
  const sending = useRef(false) // blocks a second request before the first answers
  const toggle = useRef<HTMLButtonElement>(null) // the row header, a stable place for focus
  const refocus = useRef(false) // focus goes to the header once the dialog is gone
  const items = `${order.itemCount} ${order.itemCount === 1 ? 'item' : 'items'} · ${formatPrice(order.totalCents / 100, order.currency)}` // "3 items · RM 12.00"
  // Once the dialog has closed after a cancel or a conflict, puts focus on the row header: the Cancel order button that opened it is gone.
  useEffect(() => {
    if (cancelling || !refocus.current) return // the dialog is still up, or nothing to do
    refocus.current = false // once
    toggle.current?.focus() // a place that stays
  }, [cancelling])

  /**
   * Sends a step change and reports its outcome.
   * @param to the step wanted
   * @param restock whether a cancel puts stock back
   * @return the result kind, or null when a request is already running
   */
  async function submit(to: OrderStep, restock: boolean) {
    if (sending.current) return null // one change at a time
    sending.current = true // taken
    setBusy(true) // the select and the dialog go quiet
    const result = await changeOrderStep({ number: order.number, from: order.step, to, restock }) // the request
    sending.current = false // free again
    setBusy(false) // done
    if (result.kind === 'changed' || result.kind === 'conflict') onChanged(result.order) // the Worker's order wins
    return result // the caller words the outcome
  }

  /**
   * Handles a pick in the Step select.
   * @param to the step picked
   */
  async function changeStep(to: OrderStep) {
    const result = await submit(to, false) // the request
    if (result === null) return // already busy
    if (result.kind === 'changed') {
      setRetry(null) // nothing to retry
      setMessage({ text: 'Step saved.' }) // done
    } else if (result.kind === 'conflict') {
      setRetry(null) // the latest order is shown
      setMessage({ text: `This order has been updated. It is now ${LABELS[result.order.step]}.` }) // the other admin's step
    } else if (result.kind === 'signed-out') {
      setRetry(null) // trying again would fail the same way
      setMessage({ text: SIGNED_OUT_NOTE, failed: true }) // sign in elsewhere
    } else {
      setRetry(to) // Try again sends this
      setMessage({ text: "The step wasn't saved.", failed: true }) // the select still shows the old step
    }
  }

  /**
   * Handles Cancel order in the dialog.
   * @param restock whether the stock goes back
   */
  async function cancel(restock: boolean) {
    const result = await submit('cancelled', restock) // the request
    if (result === null) return // already busy
    if (result.kind === 'changed') {
      refocus.current = true // focus lands on the row header
      setCancelling(false) // the dialog closes
      setMessage({
        text:
          result.restocked > 0
            ? `Order cancelled. ${result.restocked} ${result.restocked === 1 ? 'item' : 'items'} put back in stock.`
            : 'Order cancelled.',
      }) // what went back
    } else if (result.kind === 'conflict') {
      refocus.current = true // focus lands on the row header
      setCancelling(false) // the dialog closes: the order changed
      setMessage({ text: `This order has been updated. It is now ${LABELS[result.order.step]}.` }) // shown on the row
    } else
      setCancelError(result.kind === 'signed-out' ? SIGNED_OUT_NOTE : "The order wasn't cancelled. Try again.") // stays open
  }

  return (
    <li className="border-border-subtle bg-bg-surface rounded-card border">
      {/* The disclosure: everything a row says when closed. */}
      <button
        type="button" // not a form submit
        ref={toggle} // focus returns here after a cancel
        aria-expanded={open} // open or closed
        aria-controls={panel} // the details
        onClick={() => setOpen(!open)} // toggles
        className="focus-visible:outline-focus-ring rounded-card flex min-h-11 w-full flex-col gap-1 p-3 text-start focus-visible:outline-2 focus-visible:outline-offset-0"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="font-bold">{order.number}</span>
          <StepTag step={order.step} />
        </span>
        <span className="text-text-muted text-sm">{`${formatAdminTime(order.createdAt)} · ${order.club}`}</span>
        <span className="text-sm">{order.buyer.name}</span>
        <span className="text-text-muted text-sm">{items}</span>
      </button>
      {/* The outcome of the last change; mounted always so screen readers hear it appear. */}
      <p role="status" className={`px-3 pb-3 text-sm ${message === null ? 'hidden' : message.failed ? 'text-danger' : 'text-text-default'}`}>
        {message?.text}
        {retry !== null && (
          <button
            type="button" // not a form submit
            onClick={() => void changeStep(retry)} // sends the failed step again
            className={`${SOFT_BUTTON} ms-3`} // beside the failure line
          >
            Try again
          </button>
        )}
      </p>
      {open && (
        <div id={panel} className="border-border-subtle flex flex-col gap-4 border-t p-3">
          <ul className="flex flex-col gap-1">
            {order.lines.map((line) => (
              // one line per item
              <li key={line.itemId} className="flex justify-between gap-3">
                <span>{line.name}</span>
                <span className="text-text-muted shrink-0">{`${line.quantity} × ${formatPrice(line.priceCents / 100, order.currency)}`}</span>
              </li>
            ))}
          </ul>
          <p className="flex flex-col text-sm">
            <a
              href={`mailto:${order.buyer.email}`} // opens the mail app
              className="text-accent focus-visible:outline-focus-ring flex min-h-11 items-center underline focus-visible:outline-2"
            >
              {order.buyer.email}
            </a>
            <a
              href={`tel:${order.buyer.phone.replace(/[^\d+]/g, '')}`} // digits and a plus only
              className="text-accent focus-visible:outline-focus-ring flex min-h-11 items-center underline focus-visible:outline-2"
            >
              {order.buyer.phone}
            </a>
          </p>
          {order.step !== 'cancelled' && (
            // A cancelled order is final: no step control and no cancel.
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StepControl step={order.step} busy={busy} onChange={(to) => void changeStep(to)} />
              <button
                type="button" // not a form submit
                onClick={() => {
                  setCancelError(null) // a fresh dialog
                  setCancelling(true) // opens it
                }}
                className="text-danger focus-visible:outline-focus-ring rounded-pill min-h-11 px-4 font-medium underline focus-visible:outline-2" // quiet danger, out of the primary spot
              >
                Cancel order
              </button>
            </div>
          )}
        </div>
      )}
      {cancelling && (
        <CancelDialog
          order={order}
          busy={busy}
          error={cancelError}
          onConfirm={(restock) => void cancel(restock)} // the request
          onCancel={() => setCancelling(false)} // Keep order and Escape
        />
      )}
    </li>
  )
}
