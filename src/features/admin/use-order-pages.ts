// The Orders list's paging in one hook: the first page and the next ones from the Admin Worker, the step filter and number lookup, and the states a page fetch can be in.

import { useEffect, useRef, useState } from 'react' // state, the timers and refs
import type { AdminOrder, OrderStep } from '../../../workers/admin/src/admin-types.ts' // the order shape
import { loadOrderPage } from './admin-api.ts' // the page call
import type { PageState } from './use-item-pages.ts' // where a fetch stands

const SKELETON_DELAY_MS = 300 // the value of the `--delay-loader` token in src/styles/index.css (keep in step): a quick load flashes nothing

// What the Worker is asked: one step or all, and one number or none.
type Filters = { step: OrderStep | null; number: string | null }

/**
 * The list's pages and the controls that change them.
 * @param initialNumber the order number a link carried, or null for the list
 * @return the rows, the states and the actions
 */
export function useOrderPages(initialNumber: string | null) {
  const [rows, setRows] = useState<AdminOrder[]>([]) // every order loaded so far
  const [nextCursor, setNextCursor] = useState<string | null>(null) // where the next page starts
  const [pageState, setPageState] = useState<PageState>('loading') // the fetch
  const [filters, setFilters] = useState<Filters>({ step: null, number: initialNumber }) // what the list shows
  const [attempt, setAttempt] = useState(0) // bumped by Try again to load the first page again
  const [delayPassed, setDelayPassed] = useState(false) // the loader delay has passed
  const more = useRef<AbortController | null>(null) // the Load more request

  // Loads the first page, again whenever the filters change or Try again bumps `attempt`; a newer request aborts the older one.
  useEffect(() => {
    const controller = new AbortController() // this request
    more.current?.abort() // a Load more of the old list must not land
    void loadOrderPage({ ...filters, cursor: null, signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return // a late answer to an old query
      if (result.kind === 'ok') {
        setRows(result.orders) // the new list
        setNextCursor(result.nextCursor) // where it goes on
        setPageState('idle') // done
      } else {
        setRows([]) // the old query's rows are not this query's answer
        setNextCursor(null) // no next page
        setPageState(result.kind) // signed-out or error
      }
    })
    return () => controller.abort() // stop listening
  }, [filters, attempt])

  // Lets the skeleton show only after the loader delay.
  useEffect(() => {
    if (pageState !== 'loading') return // nothing is waiting
    const wait = window.setTimeout(() => setDelayPassed(true), SKELETON_DELAY_MS) // the delay ends
    return () => window.clearTimeout(wait) // a quick load cancels it
  }, [pageState, attempt, filters])

  /**
   * Applies new filters and starts a first-page fetch.
   * @param next the filters
   */
  const apply = (next: Filters) => {
    setDelayPassed(false) // the skeleton waits again
    setPageState('loading') // a first-page fetch starts
    setFilters(next) // the effect fetches
  }

  /** Loads the first page again after a failure. */
  const retry = () => {
    setDelayPassed(false) // the skeleton waits again
    setPageState('loading') // waiting
    setAttempt((value) => value + 1) // the effect loads
  }

  /** Loads the next page, or tries again after a failed one. */
  const loadMore = async () => {
    if (
      nextCursor === null ||
      (pageState !== 'idle' && pageState !== 'more-error' && pageState !== 'more-signed-out')
    )
      return // nothing to load, or busy
    const controller = new AbortController() // this request
    more.current = controller // a filter change aborts it
    setPageState('more') // Loading…
    const result = await loadOrderPage({ ...filters, cursor: nextCursor, signal: controller.signal }) // the next page
    if (controller.signal.aborted) return // the list changed meanwhile
    if (result.kind !== 'ok') return setPageState(result.kind === 'error' ? 'more-error' : 'more-signed-out') // the rows stay
    setRows((current) => {
      const listed = new Set(current.map((row) => row.number)) // numbers already shown
      return [...current, ...result.orders.filter((row) => !listed.has(row.number))] // no repeats when the list moved between pages
    })
    setNextCursor(result.nextCursor) // the cursor moves on
    setPageState('idle') // done
  }

  /**
   * Puts a newer order in place of the listed one, keeping its position.
   * @param order the newer order
   */
  const replaceOrder = (order: AdminOrder) =>
    setRows((current) => current.map((row) => (row.number === order.number ? order : row))) // replaced where the number matches

  return {
    rows, // the loaded orders
    hasMore: nextCursor !== null, // another page exists
    pageState, // the fetch
    showSkeleton: pageState === 'loading' && rows.length === 0 && delayPassed, // skeleton rows
    step: filters.step, // the step filter in force
    number: filters.number, // the number looked up, or null
    setStep: (step: OrderStep | null) => apply({ step, number: null }), // picking a step ends a lookup
    setNumber: (number: string | null) => apply({ step: null, number }), // a lookup or its end
    retry, // Try again
    loadMore, // Load more
    replaceOrder, // replace an order in place
  }
}
