// The end of the list: a Load more button, its "Loading…" and failure states, and "End of the list." once there is no next page.

import { SOFT_BUTTON } from './admin-boxes.ts' // the quiet 44 px action
import type { PageState } from './use-item-pages.ts' // where a fetch stands

/**
 * Draws the list's end.
 * @param state where the page fetch stands
 * @param hasMore whether the Worker has a next page
 * @param onLoad called to load the next page, or to try again
 * @param noun what the list holds, for the failure line
 * @param locked true while a save runs: every button here does nothing, like the locked list above
 * @return a button, a failure line with Try again, or the end line
 */
export function LoadMore({
  state,
  hasMore,
  onLoad,
  noun = 'items',
  locked = false, // not locked unless the screen says so
}: {
  state: PageState
  hasMore: boolean
  onLoad: () => void
  noun?: string
  locked?: boolean // a save is running
}) {
  if (!hasMore) return <p className="text-text-muted py-4 text-center">End of the list.</p> // nothing more
  if (state === 'more-error')
    return (
      // The failure line and its action; the rows above stay.
      <div className="flex flex-wrap items-center justify-center gap-3 py-2">
        <p className="text-danger">{`We couldn't load more ${noun}.`}</p> {/* what failed */}
        <button
          type="button" // not a form submit
          aria-disabled={locked} // dead while a save runs
          onClick={() => !locked && onLoad()} // does nothing while locked
          className={`${SOFT_BUTTON} aria-disabled:opacity-60`} // dimmed while locked
        >
          Try again
        </button>
      </div>
    )
  if (state === 'more-signed-out')
    return (
      // The session ended: the page's note says so; pressing Try again asks for the same page once signed in elsewhere.
      <div className="flex justify-center py-2">
        <button
          type="button" // not a form submit
          aria-disabled={locked} // dead while a save runs
          onClick={() => !locked && onLoad()} // does nothing while locked
          className={`${SOFT_BUTTON} aria-disabled:opacity-60`} // dimmed while locked
        >
          Try again
        </button>
      </div>
    )
  const loading = state === 'more' // a request is running
  const quiet = loading || locked // no click works while loading or while a save holds the list
  return (
    // A 44 px button that goes quiet while loading; aria-disabled keeps focus.
    <div className="flex justify-center py-2">
      <button
        type="button" // not a form submit
        aria-disabled={quiet} // a second click is ignored
        onClick={() => !quiet && onLoad()} // does nothing while loading or locked
        className={`${SOFT_BUTTON} aria-disabled:opacity-60`} // dimmed while loading or locked
      >
        {loading ? 'Loading…' : 'Load more'}
      </button>
    </div>
  )
}
