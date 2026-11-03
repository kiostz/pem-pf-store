// The Items list's paging in one hook: the first page and the next ones from the Admin Worker, the debounced search, the category and sort, and the states a page fetch can be in.

import { useEffect, useRef, useState } from 'react' // state, the timers and refs
import type { AdminHonor } from '../../../workers/admin/src/admin-types.ts' // the row shape
import { loadItemPage, type ItemSort } from './admin-api.ts' // the page call

const SEARCH_PAUSE_MS = 250 // how long typing waits before one search goes out
const SKELETON_DELAY_MS = 300 // the value of the `--delay-loader` token in src/styles/index.css (keep in step): a quick load flashes nothing
const MAX_WORDS = 5 // the Worker's limit on search words

// Where a page fetch stands.
export type PageState =
  'idle' | 'loading' | 'more' | 'error' | 'more-error' | 'signed-out'
// What the Worker is asked: the applied search, category and sort.
type Filters = { q: string; category: string | null; sort: ItemSort }

/**
 * Cleans a search for the Worker: spaces collapsed and at most five words.
 * @param text what the admin typed
 * @return the words joined by one space
 */
const cleanSearch = (text: string): string =>
  text.trim().split(/\s+/).filter(Boolean).slice(0, MAX_WORDS).join(' ') // the Worker refuses a sixth word

/**
 * The list's pages and the controls that change them.
 * @param onFetched called with the rows of every page that arrives, so pending changes can rebase onto them
 * @return the rows, the states and the actions
 */
export function useItemPages(
  onFetched: (honors: AdminHonor[]) => void = () => undefined,
) {
  const [rows, setRows] = useState<AdminHonor[]>([]) // every row loaded so far
  const [nextCursor, setNextCursor] = useState<string | null>(null) // where the next page starts
  const [pageState, setPageState] = useState<PageState>('loading') // the fetch
  const [filters, setFilters] = useState<Filters>({
    q: '',
    category: null,
    sort: 'changed',
  }) // what the list shows
  const [typed, setTyped] = useState('') // what is in the search box
  const [attempt, setAttempt] = useState(0) // bumped by Try again to load the first page again
  const [delayPassed, setDelayPassed] = useState(false) // the loader delay has passed
  const filtersRef = useRef(filters) // the applied filters, for handlers that run between renders
  const timer = useRef<number | undefined>(undefined) // the typing pause
  const more = useRef<AbortController | null>(null) // the Load more request
  const fetched = useRef(onFetched) // the latest callback
  useEffect(() => {
    fetched.current = onFetched // always the newest
  })

  // Loads the first page, again whenever the filters change or Try again bumps `attempt`; a newer request aborts the older one.
  useEffect(() => {
    const controller = new AbortController() // this request
    more.current?.abort() // a Load more of the old list must not land
    void loadItemPage({
      ...filters,
      cursor: null,
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return // a late answer to an old query
      if (result.kind === 'ok') {
        setRows(result.honors) // the new list
        setNextCursor(result.nextCursor) // where it goes on
        setPageState('idle') // done
        fetched.current(result.honors) // pending changes rebase
      } else setPageState(result.kind) // signed-out or error
    })
    return () => controller.abort() // stop listening
  }, [filters, attempt])

  // Lets the skeleton show only after the loader delay.
  useEffect(() => {
    if (pageState !== 'loading') return // nothing is waiting
    const wait = window.setTimeout(
      () => setDelayPassed(true),
      SKELETON_DELAY_MS,
    ) // the delay ends
    return () => window.clearTimeout(wait) // a quick load cancels it
  }, [pageState, attempt, filters])

  // Stops a pending search when the screen goes away.
  useEffect(() => () => window.clearTimeout(timer.current), [])

  /**
   * Applies new filters at once.
   * @param next the filters
   * @return true when they differ from the ones in force and a fetch starts
   */
  const apply = (next: Filters): boolean => {
    window.clearTimeout(timer.current) // the typing pause is over
    if (
      next.q === filtersRef.current.q &&
      next.category === filtersRef.current.category &&
      next.sort === filtersRef.current.sort
    )
      return false // nothing changed
    filtersRef.current = next // the handlers see it now
    setDelayPassed(false) // the skeleton waits again
    setPageState('loading') // a first-page fetch starts
    setFilters(next) // the effect fetches
    return true // a fetch starts
  }

  /**
   * Handles typing: the search runs after a pause.
   * @param text what is in the box
   */
  const setQuery = (text: string) => {
    setTyped(text) // the box shows it at once
    window.clearTimeout(timer.current) // one search per pause
    timer.current = window.setTimeout(
      () => apply({ ...filtersRef.current, q: cleanSearch(text) }),
      SEARCH_PAUSE_MS,
    ) // after the pause
  }

  /**
   * Searches for text now, and puts it in the box.
   * @param text the search
   */
  const search = (text: string) => {
    setTyped(text) // the box shows it
    apply({ ...filtersRef.current, q: cleanSearch(text) }) // no pause
  }

  /** Searches for what is in the box now (Enter); the same words load the list again. */
  const submitQuery = () => {
    if (!apply({ ...filtersRef.current, q: cleanSearch(typed) })) retry() // Enter always shows a fresh list
  }

  /**
   * Picks a category.
   * @param category the category, or null for all
   */
  const setCategory = (category: string | null) =>
    apply({ ...filtersRef.current, category })

  /**
   * Picks a sort.
   * @param sort the sort
   */
  const setSort = (sort: ItemSort) => apply({ ...filtersRef.current, sort })

  /**
   * Searches for text with no category, and loads again when that is already the list; used after an Add moves the search.
   * @param text the search
   */
  const showOnly = (text: string) => {
    setTyped(text) // the box shows it
    if (!apply({ ...filtersRef.current, q: cleanSearch(text), category: null }))
      retry() // the new item must be listed, so an unchanged search loads again
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
      (pageState !== 'idle' && pageState !== 'more-error')
    )
      return // nothing to load, or busy
    const controller = new AbortController() // this request
    more.current = controller // a filter change aborts it
    setPageState('more') // Loading…
    const result = await loadItemPage({
      ...filtersRef.current,
      cursor: nextCursor,
      signal: controller.signal,
    }) // the next page
    if (controller.signal.aborted) return // the list changed meanwhile
    if (result.kind !== 'ok')
      return setPageState(result.kind === 'error' ? 'more-error' : 'signed-out') // the rows stay
    setRows((current) => {
      const listed = new Set(current.map((row) => row.id)) // ids already shown
      return [...current, ...result.honors.filter((row) => !listed.has(row.id))] // no repeats when the list moved between pages
    })
    setNextCursor(result.nextCursor) // the cursor moves on
    setPageState('idle') // done
    fetched.current(result.honors) // pending changes rebase
  }

  /**
   * Puts newer rows in place of the listed ones, keeping their positions.
   * @param honors the newer rows
   */
  const applyRows = (honors: AdminHonor[]) => {
    const byId = new Map(honors.map((row) => [row.id, row])) // the new rows
    setRows((current) => current.map((row) => byId.get(row.id) ?? row)) // replaced where given
  }

  /**
   * Takes rows off the list.
   * @param ids the ids to remove
   */
  const removeRows = (ids: string[]) =>
    setRows((current) => current.filter((row) => !ids.includes(row.id))) // the others stay

  return {
    rows, // the loaded rows
    hasMore: nextCursor !== null, // another page exists
    pageState, // the fetch
    showSkeleton: pageState === 'loading' && rows.length === 0 && delayPassed, // skeleton rows
    typed, // the search box's text
    applied: filters, // the search, category and sort in force
    setQuery, // typing
    submitQuery, // Enter
    search, // a search from code
    showOnly, // a search that clears the category
    setCategory, // picking a category
    setSort, // picking a sort
    retry, // Try again
    loadMore, // Load more
    applyRows, // replace rows in place
    removeRows, // drop rows
  }
}
