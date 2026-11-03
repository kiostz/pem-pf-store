// The end of the list: a Load more button, its "Loading…" and failure states, and "End of the list." once there is no next page.

import { SOFT_BUTTON } from './admin-boxes.ts' // the quiet 44 px action
import type { PageState } from './use-item-pages.ts' // where a fetch stands

/**
 * Draws the list's end.
 * @param state where the page fetch stands
 * @param hasMore whether the Worker has a next page
 * @param onLoad called to load the next page, or to try again
 * @return a button, a failure line with Try again, or the end line
 */
export function LoadMore({ state, hasMore, onLoad }: { state: PageState; hasMore: boolean; onLoad: () => void }) {
  if (!hasMore) return <p className="text-text-muted py-4 text-center">End of the list.</p> // nothing more
  if (state === 'more-error')
    return (
      // The failure line and its action; the rows above stay.
      <div className="flex flex-wrap items-center justify-center gap-3 py-2">
        <p className="text-danger">We couldn&apos;t load more items.</p> {/* what failed */}
        <button type="button" onClick={onLoad} className={SOFT_BUTTON}>
          Try again
        </button>
      </div>
    )
  if (state === 'more-signed-out')
    return (
      // The session ended: the page's note says so; pressing Try again asks for the same page once signed in elsewhere.
      <div className="flex justify-center py-2">
        <button type="button" onClick={onLoad} className={SOFT_BUTTON}>
          Try again
        </button>
      </div>
    )
  const loading = state === 'more' // a request is running
  return (
    // A 44 px button that goes quiet while loading; aria-disabled keeps focus.
    <div className="flex justify-center py-2">
      <button
        type="button" // not a form submit
        aria-disabled={loading} // a second click is ignored
        onClick={() => !loading && onLoad()} // does nothing while loading
        className={`${SOFT_BUTTON} aria-disabled:opacity-60`} // dimmed while loading
      >
        {loading ? 'Loading…' : 'Load more'}
      </button>
    </div>
  )
}
