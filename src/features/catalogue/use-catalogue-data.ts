// Loads the honors, the settings and the clubs from the API Worker's one /shop request for the catalogue, with the loader delay, the 30 second cap, retry and stale-attempt guard, so every screen that lists honors shares one pattern.

import { useCallback, useEffect, useState } from 'react' // state and the load effect
import { loadShop, ShopLoadError, type ShopLoadFailure } from '@/shared/data/load.ts' // the one request and its error kinds
import type { ClubList, Honor, ShopSettings } from '@/shared/data/types.ts' // the shapes of the shop's data

const LOADER_DELAY_MS = 300 // how long a load runs before the skeleton may show
const LOAD_TIMEOUT_MS = 30_000 // how long a load may run before it counts as failed

// What the page knows about the load.
export type CatalogueData =
  | { status: 'loading' } // the request is running
  | { status: 'error'; reason: ShopLoadFailure } // busy (429) or failed (anything else, including the 30 s cap)
  | { status: 'ready'; honors: Honor[]; settings: ShopSettings; clubs: ClubList } // the answer arrived

// What useCatalogueData returns, passed to every screen that lists honors.
export type CatalogueLoad = ReturnType<typeof useCatalogueData>

/**
 * Loads honors, settings and clubs in one request; any failure is one error with a reason.
 * @return the load state, whether the skeleton may show, retry to load again, and applyStock to patch the loaded honors after a refused order
 */
export function useCatalogueData(): {
  state: CatalogueData
  showSkeleton: boolean
  retry: () => void
  applyStock: (refused: Array<{ honorId: string; stock: number | null }>) => void
} {
  const [state, setState] = useState<CatalogueData>({ status: 'loading' }) // loading, error or the data
  const [attempt, setAttempt] = useState(0) // bumped by retry to run the load again
  const [loaderDelayPassed, setLoaderDelayPassed] = useState(false) // true once the loader delay has passed

  // Load the shop on mount and on every retry, giving up after the cap.
  useEffect(() => {
    let finished = false // true once this attempt has an outcome, a cancel or the cap, so a later answer is ignored
    const controller = new AbortController() // aborts the request on the cap, a retry or unmount
    const timer = setTimeout(() => {
      // the cap passed with no answer
      if (finished) return // already answered
      finished = true // nothing later may change the screen
      controller.abort() // stop the request
      console.error('Could not load the catalogue data: timed out') // visible in the console, no buyer data involved
      setState({ status: 'error', reason: 'failed' }) // show the error
    }, LOAD_TIMEOUT_MS)
    loadShop(fetch, controller.signal) // the one request
      .then(({ honors, settings, clubs }) => {
        // the answer arrived
        if (!finished) setState({ status: 'ready', honors, settings, clubs }) // show the data unless this attempt is over
      })
      .catch((error: unknown) => {
        // the request failed
        if (finished) return // the cap, a retry or unmount already ended this attempt
        console.error('Could not load the catalogue data', error) // visible in the console, no buyer data involved
        setState({ status: 'error', reason: error instanceof ShopLoadError ? error.kind : 'failed' }) // busy or failed
      })
      .finally(() => clearTimeout(timer)) // the cap is no longer needed
    return () => {
      // cleanup: runs on unmount and before the next attempt
      finished = true // stop this attempt from touching state
      clearTimeout(timer) // no cap for a dead attempt
      controller.abort() // stop its request
    }
  }, [attempt]) // run again on every retry

  // Start the skeleton only after the loader delay, so a fast load shows no flash.
  useEffect(() => {
    if (state.status !== 'loading') return // only a running load needs the delay
    const timer = setTimeout(() => setLoaderDelayPassed(true), LOADER_DELAY_MS) // wait the loader delay
    return () => clearTimeout(timer) // a load that ends first cancels the skeleton
  }, [state.status, attempt]) // restart the delay after a retry

  /** Runs the load again, from the error state. */
  const retry = useCallback(() => {
    setLoaderDelayPassed(false) // a retry also waits the loader delay before the skeleton
    setState({ status: 'loading' }) // leave the error state at once
    setAttempt((previous) => previous + 1) // trigger the load effect
  }, [])

  /**
   * Patches the loaded honors with what the Worker said was short: a number sets the stock, null removes the honor (not for sale). Does nothing unless the data is ready.
   * @param refused the lines the Worker refused
   */
  const applyStock = useCallback((refused: Array<{ honorId: string; stock: number | null }>) => {
    setState((current) => {
      if (current.status !== 'ready') return current // nothing loaded to patch
      const honors = current.honors.flatMap((honor) => {
        const line = refused.find((other) => other.honorId === honor.id) // the Worker's word on this honor, if any
        if (!line) return [honor] // untouched
        return line.stock === null ? [] : [{ ...honor, stock: line.stock }] // gone from the shop, or the stock it has now
      }) // the patched list
      return { ...current, honors } // same settings and clubs
    })
  }, [])

  return {
    state, // loading, error or the data
    showSkeleton: state.status === 'loading' && loaderDelayPassed, // only while loading, after the delay
    retry, // for the Try again button
    applyStock, // for the order form's refusal
  }
}
