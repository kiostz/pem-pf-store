// The admin Orders screen: a step filter and an order-number lookup over D1 in pages, one row each, Load more, the email-Off note, and the loading, empty, error and signed-out states.

import { useEffect, useState } from 'react' // the lookup box and the settings read
import type { OrderStep } from '../../../workers/admin/src/admin-types.ts' // the steps
import { isOrderNumber, loadSettings, SIGNED_OUT_NOTE } from './admin-api.ts' // checks and the settings read
import { FIELD_BOX, SOFT_BUTTON } from './admin-boxes.ts' // shared shapes
import { LoadMore } from './LoadMore.tsx' // the end of the list
import { OrderRow } from './OrderRow.tsx' // one order
import { useOrderPages } from './use-order-pages.ts' // the screen's state

const SKELETON_ROWS = 6 // how many skeleton rows the loading state shows
const STEP_NAMES: Record<OrderStep, string> = { new: 'New', paid: 'Paid', handed_out: 'Handed out', cancelled: 'Cancelled' } // the step words
const NUMBER_HINT = 'Enter an order number like PF-20261105-ABCD.' // a bad lookup

/**
 * The Orders screen.
 * @param number the order number a link carried, or null for the list
 * @return the filter bar and orders, or a not-found line when the link's number is malformed
 */
export function OrdersScreen({ number }: { number: string | null }) {
  if (number !== null && !isOrderNumber(number))
    return (
      <p>
        That link isn&apos;t an order number.{' '}
        <a href="#/orders" className="text-accent focus-visible:outline-focus-ring font-medium underline focus-visible:outline-2">
          All orders
        </a>
      </p>
    ) // no request for a number the Worker would refuse
  return <OrdersList number={number} />
}

/**
 * The filter bar, the orders with Load more, and the state lines.
 * @param number the valid order number a link carried, or null for the list
 * @return the list screen
 */
function OrdersList({ number }: { number: string | null }) {
  const pages = useOrderPages(number) // the screen's state
  const { rows, pageState } = pages // read often
  const [typed, setTyped] = useState(number ?? '') // the lookup box
  const [hint, setHint] = useState<string | null>(null) // the bad-entry line
  const [emailOn, setEmailOn] = useState(true) // the order email switch; assumed on until read

  // Reads the switch once, so the Off note can show.
  useEffect(() => {
    let live = true // false after unmount
    void loadSettings().then((result) => {
      if (live && result.kind === 'ok') setEmailOn(result.orderEmailOn) // a failed read shows no note
    })
    return () => {
      live = false // a late answer is dropped
    }
  }, [])

  const failedFirst = (pageState === 'error' || pageState === 'signed-out') && rows.length === 0 // the first page never came
  const looking = pages.number !== null // a lookup is in force

  /**
   * Runs a lookup for the typed number.
   * @param event the form submit
   */
  const lookUp = (event: React.FormEvent) => {
    event.preventDefault() // no page reload
    const text = typed.trim().toUpperCase() // the Worker's pattern is upper-case
    if (text === '') return pages.setNumber(null) // an empty box ends the lookup
    if (!isOrderNumber(text)) return setHint(NUMBER_HINT) // no round trip for a bad entry
    setHint(null) // clear the hint
    setTyped(text) // the box shows the upper-cased number
    pages.setNumber(text) // fetch
  }

  return (
    <>
      {/* The email-Off note, with a way to Settings. */}
      {!emailOn && (
        <p className="bg-bg-soft rounded-card mb-4 p-3">
          Order emails are off. New orders show only here.{' '}
          <a href="#/settings" className="text-accent focus-visible:outline-focus-ring font-medium underline focus-visible:outline-2">
            Settings
          </a>
        </p>
      )}
      {/* The filter and the lookup. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="sm:w-47">
          <label htmlFor="orders-step" className="sr-only">
            Step filter
          </label>
          <select
            id="orders-step" // the label points here
            value={pages.step ?? ''} // controlled; empty is All steps
            onChange={(event) => {
              setTyped('') // a step pick ends a lookup
              setHint(null) // no stale hint
              pages.setStep(event.target.value === '' ? null : (event.target.value as OrderStep))
            }}
            className={`category-filter ${FIELD_BOX} w-full`} // the site's select styling
          >
            <option value="">All steps</option>
            {(Object.keys(STEP_NAMES) as OrderStep[]).map((step) => (
              <option key={step} value={step}>
                {STEP_NAMES[step]}
              </option>
            ))}
          </select>
        </div>
        <form onSubmit={lookUp} role="search" className="min-w-0 sm:flex-1">
          <div className="flex gap-2">
            <label htmlFor="orders-number" className="sr-only">
              Order number
            </label>
            <input
              id="orders-number" // the label points here
              type="search" // search keyboard and clear button
              value={typed} // controlled
              onChange={(event) => setTyped(event.target.value)} // every keystroke; the lookup waits for Enter
              maxLength={20} // a number is 16 characters
              placeholder="PF-20261105-ABCD" // the shape
              autoComplete="off" // no history dropdown
              autoCapitalize="characters" // upper-case on phones
              aria-describedby={hint === null ? undefined : 'orders-number-hint'} // the bad-entry line
              className={`${FIELD_BOX} min-w-0 flex-1`} // fills the row beside Find
            />
            <button type="submit" className={SOFT_BUTTON}>
              Find
            </button>
          </div>
          {hint !== null && (
            <p id="orders-number-hint" className="text-danger mt-2 text-sm">
              {hint}
            </p>
          )}
        </form>
      </div>
      {/* Skeleton rows, shown only after the loader delay. */}
      {pages.showSkeleton && (
        <div aria-hidden="true" className="mt-3 flex flex-col gap-3">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <div
              key={index} // the rows never reorder
              data-testid="order-skeleton-row" // the tests count them
              className="bg-border-subtle animate-skeleton rounded-card h-31.5 motion-reduce:animate-none"
            /> // a closed row's height, 126 px
          ))}
        </div>
      )}
      {/* Announced politely when loading gives way to a message. */}
      <div aria-live="polite" className="mt-3">
        {pageState === 'idle' && rows.length === 0 && (
          <p className="text-text-muted animate-fade-in">
            {looking
              ? `No order ${pages.number} found.`
              : pages.step !== null
                ? `No ${STEP_NAMES[pages.step]} orders.`
                : 'No orders yet.'}
          </p>
        )}
        {pageState === 'error' && <p className="text-danger">We couldn&apos;t load the orders.</p>}
        {(pageState === 'signed-out' || pageState === 'more-signed-out') && <p>{SIGNED_OUT_NOTE}</p>}
      </div>
      {failedFirst && pageState === 'error' && (
        <button type="button" onClick={pages.retry} className={`${SOFT_BUTTON} mt-3`}>
          Try again
        </button>
      )}
      {/* The rows; dimmed while a new filter loads. */}
      {rows.length > 0 && (
        <ul
          aria-busy={pageState === 'loading'} // a new query is loading
          className={`mt-3 flex flex-col gap-3 transition-opacity duration-(--duration-fast) ${pageState === 'loading' ? 'opacity-50' : ''}`} // dimmed until the new rows land
        >
          {rows.map((order) => (
            <OrderRow
              key={order.number} // stable
              order={order}
              onChanged={pages.replaceOrder} // the newer order
              defaultOpen={looking && rows.length === 1} // the one order a lookup found
            />
          ))}
        </ul>
      )}
      {/* The end of the list. */}
      {rows.length > 0 && !looking && pageState !== 'error' && pageState !== 'signed-out' && (
        <LoadMore state={pageState} hasMore={pages.hasMore} onLoad={() => void pages.loadMore()} noun="orders" />
      )}
    </>
  )
}
