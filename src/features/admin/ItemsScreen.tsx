// The admin Items screen: Add item, search, category and sort over D1 in pages, one row each with its status and stock, Load more, the Item sheet, and the Save pill and notes at the bottom, with its loading, error, empty and signed-out states.

import { useEffect, useState } from 'react' // which sheet is open, and the pending count report
import { PILL_ACTION, PILL_DOCK, PILL_NOTE } from '@/shared/ui/floating-pill-box.ts' // the floating pill's dock and note shapes
import { AdminHonorRow } from './AdminHonorRow.tsx' // one row
import { FIELD_BOX, NOTE_BUTTON, SOFT_BUTTON } from './admin-boxes.ts' // shared shapes
import { ItemSheet } from './ItemSheet.tsx' // Edit and Add
import { LoadMore } from './LoadMore.tsx' // the end of the list
import { SavePill } from './SavePill.tsx' // Discard and Save
import { SortControl } from './SortControl.tsx' // the order
import type { ResizeDeps } from './resize-picture.ts' // the passed-in browser pieces
import { useAdminHonors } from './use-admin-honors.ts' // the screen's state

const SKELETON_ROWS = 8 // how many skeleton rows the loading state shows
const TOOLBAR_BOX = 'border-border-subtle bg-bg-app -mx-4 -mt-6 border-b px-4 py-2' // the toolbar's box, flush under the header like the Shop's
const COUNT_BOX = 'mt-3 min-h-6' // a message line's box
const NOTES = {
  failed: "We couldn't save. Your changes are kept. Try again.", // after a failed save
  'signed-out':
    'Your sign-in has ended. Open this page in a new tab to sign in, then save here. Your changes are kept.', // after a 403
} as const // the notes that need no number

// Which sheet is open: Add, or Edit of one item.
type Sheet = { mode: 'add' } | { mode: 'edit'; id: string }

/**
 * The Items screen.
 * @param pictureDeps the decoder and canvas factory a picture resize uses; the browser's own when omitted
 * @param onPendingCount told how many edited fields wait, each time that changes (the tab bar's dot)
 * @return the toolbar, the rows with Load more, the sheet, and the Save pill with its notes
 */
export function ItemsScreen({
  pictureDeps,
  onPendingCount,
}: {
  pictureDeps?: ResizeDeps
  onPendingCount?: (count: number) => void
}) {
  const items = useAdminHonors() // the screen's state
  const { pages, meta, pending, conflicts, count, saveState, discarded, changesView } = items // read often
  const [sheet, setSheet] = useState<Sheet | null>(null) // the open sheet
  const { pageState, rows, applied } = pages // the list
  const saving = saveState === 'saving' // a save is running
  useEffect(() => onPendingCount?.(count), [count, onPendingCount]) // the tab bar learns each change
  const hasRows = rows.length > 0 // something is listed
  const failedFirst = (pageState === 'error' || pageState === 'signed-out') && !hasRows // the first page never came
  const reloadToSignIn = pageState === 'signed-out' && count === 0 // a reload loses nothing when no edits are pending, rows or not
  const currency = meta?.currency ?? 'MYR' // the shop's currency until /api/meta answers
  const now = new Date() // the "changed" dates' year
  const shown = changesView ? Object.values(pending).map((entry) => entry.seen) : rows // the pending rows, or the list
  const editing =
    sheet?.mode === 'edit'
      ? (shown.find((row) => row.id === sheet.id) ?? rows.find((row) => row.id === sheet.id) ?? pending[sheet.id]?.seen)
      : undefined // the row of the open Edit sheet
  const filtering = applied.q !== '' || applied.category !== null // whether a filter is on

  // The one note shown above the pill: Discard's wins, then Add and Delete's, then the save's.
  const note = discarded ? (
    <>
      <span className="min-w-0 flex-1">Changes discarded</span> {/* what happened */}
      <button type="button" onClick={items.undoDiscard} className={NOTE_BUTTON}>
        Undo
      </button>
    </>
  ) : items.notice !== null ? (
    <span className="min-w-0 flex-1 py-3">{items.notice}</span> // an item was added or deleted
  ) : saveState === 'saved' ? (
    <span className="min-w-0 flex-1 py-3">{`Saved ${items.savedCount} ${items.savedCount === 1 ? 'change' : 'changes'}.`}</span> // the size of the save
  ) : saveState === 'conflict' ? (
    <span className="min-w-0 flex-1 py-3">
      {[
        items.conflictInfo.changed
          ? "Some items changed since you opened this page. They're marked: check them and save again."
          : '',
        items.conflictInfo.deleted ? 'Items deleted by another admin were taken off the list.' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    </span> // what the refused save found
  ) : saveState === 'name-taken' ? (
    <span className="min-w-0 flex-1 py-3">{`Another item is already called ${items.takenName}.`}</span> // a taken name
  ) : saveState === 'failed' || saveState === 'signed-out' ? (
    <span className="min-w-0 flex-1 py-3">{NOTES[saveState]}</span> // the failed save
  ) : null // no note

  return (
    <>
      {/* Add, search, category and sort stay at the top while the rows scroll. Two rows under 640 px, one from 640 px. */}
      {!failedFirst && (
        <div className={`${TOOLBAR_BOX} sticky top-0 z-10`}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:items-start">
            {/* The search box takes the width the others leave; Enter searches at once. */}
            <form
              role="search" // a search landmark
              onSubmit={(event) => {
                event.preventDefault() // no page reload
                pages.submitQuery() // Enter does not wait for the pause
              }}
              className="min-w-0 sm:flex-1"
            >
              <label htmlFor="admin-search" className="sr-only">
                Search items
              </label>
              <input
                id="admin-search" // the label points here
                type="search" // search keyboard and clear button
                value={pages.typed} // controlled
                onChange={(event) => pages.setQuery(event.target.value)} // every keystroke, searched after a pause
                maxLength={100} // the Worker's limit
                placeholder="Search items" // visible hint
                autoComplete="off" // no history dropdown
                className={`${FIELD_BOX} w-full`}
              />
            </form>
            {/* Add item: the meta must have loaded for the categories and the default price. */}
            <button
              type="button" // not a form submit
              disabled={meta === null} // the sheet needs the meta
              onClick={() => setSheet({ mode: 'add' })} // opens the Add sheet
              className={`${SOFT_BUTTON} sm:order-last`} // quiet: Save is the one primary
            >
              Add item
            </button>
            {/* Category and sort side by side. */}
            <div className="col-span-2 flex gap-2 sm:contents">
              <div className="min-w-0 flex-5 sm:w-47 sm:flex-none">
                <label htmlFor="admin-category" className="sr-only">
                  Category
                </label>
                <select
                  id="admin-category" // the label points here
                  value={applied.category ?? ''} // controlled; empty is All categories
                  onChange={(event) => pages.setCategory(event.target.value === '' ? null : event.target.value)} // the pick, searched at once
                  className={`category-filter ${FIELD_BOX} w-full truncate`} // the site's select styling, one line cut with an ellipsis
                >
                  <option value="">All categories</option>
                  {(meta?.categories ?? []).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <SortControl sort={applied.sort} onChange={pages.setSort} />
            </div>
          </div>
          {/* The meta did not load: Add item and the categories wait for it. */}
          {items.metaFailed && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3">
              <p className="text-danger">We couldn&apos;t load the categories.</p>
              <button type="button" onClick={items.retryMeta} className={SOFT_BUTTON}>
                Reload categories {/* a different name from the list's Try again */}
              </button>
            </div>
          )}
        </div>
      )}
      {/* A failed first page keeps the toolbar's empty band, so the message lands where the skeleton stood. */}
      {failedFirst && <div aria-hidden="true" className={`${TOOLBAR_BOX} h-15`} />}
      {/* Skeleton rows of the final row's size, shown only after the loader delay. */}
      {pages.showSkeleton && (
        <div aria-hidden="true" className="mt-3 flex flex-col gap-3">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <div
              key={index}
              data-testid="admin-skeleton-row"
              className="bg-border-subtle animate-skeleton rounded-card h-36 motion-reduce:animate-none md:h-22.5"
            /> // a row's height at 375 px (144) and from 768 px (90)
          ))}
        </div>
      )}
      {/* Announced politely when loading gives way to a message. */}
      <div aria-live="polite">
        {pageState === 'idle' && !hasRows && !changesView && (
          <p className={`${COUNT_BOX} text-text-muted animate-fade-in`}>
            {!filtering
              ? 'Nothing is in the shop yet.'
              : applied.q === ''
                ? `No items in ${applied.category} yet.`
                : `No items match "${applied.q}"${applied.category !== null ? ` in ${applied.category}` : ''}.`}
          </p>
        )}
        {pageState === 'error' && <p className={`${COUNT_BOX} text-danger`}>We couldn&apos;t load the items.</p>}
        {(pageState === 'signed-out' || pageState === 'more-signed-out') && (
          <p className={COUNT_BOX}>
            {count > 0
              ? 'Your sign-in has ended. Open this page in a new tab to sign in, then try again. Your changes are kept.' // a reload would lose the edits
              : 'Your sign-in has ended. Sign in again to see the items.'}
          </p>
        )}
      </div>
      {/* The one action of a failed or signed-out load. */}
      {pageState === 'error' || pageState === 'signed-out' ? (
        <button
          type="button" // not a form submit
          onClick={reloadToSignIn ? () => window.location.reload() : items.retry} // a new sign-in when nothing can be lost, else the same load again
          className={`${PILL_ACTION} mt-4 w-auto px-6`} // the oxblood pill
        >
          {reloadToSignIn ? 'Sign in' : 'Try again'}
        </button>
      ) : null}
      {/* Show changes: the pending rows only, with no fetch. */}
      {count > 0 && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => items.setChangesView(!changesView)}
            className={`${SOFT_BUTTON} bg-transparent underline`}
          >
            {changesView ? 'Show the list' : `Show changes (${Object.keys(pending).length})`}
          </button>
        </div>
      )}
      {/* The rows; locked while a save runs so what was sent is what gets cleared, dimmed while a new query loads. */}
      {shown.length > 0 && (
        <ul
          data-testid="admin-list" // for the tests
          inert={saving} // locked while saving
          aria-busy={pageState === 'loading'} // a new query is loading
          className={`mt-3 flex flex-col gap-3 transition-opacity duration-(--duration-fast) ${(pageState === 'loading' || pageState === 'error' || pageState === 'signed-out') && !changesView ? 'opacity-50' : ''}`} // dimmed until the new rows land, and after a failed fetch they are the old list
        >
          {shown.map((row) => (
            <AdminHonorRow
              key={row.id} // stable
              honor={row} // the row as seen
              pending={pending[row.id]?.edits} // its edits
              conflict={conflicts[row.id]} // its flag
              currency={currency} // for the price
              now={now} // for the date
              onOpen={() => setSheet({ mode: 'edit', id: row.id })} // the Item sheet
              onStatus={(next) => items.setStatus(row, next)} // a status edit
              onStock={(next) => items.setStock(row, next)} // a stock edit
            />
          ))}
        </ul>
      )}
      {/* The end of the list. */}
      {hasRows && !changesView && pageState !== 'error' && pageState !== 'signed-out' && (
        <LoadMore state={pageState} hasMore={pages.hasMore} onLoad={() => void pages.loadMore()} />
      )}
      {/* The dock: the note stacked 12 px over the pill; the note's region stays mounted so screen readers hear it appear. */}
      <div className={PILL_DOCK}>
        <div role="status">
          {
            note !== null && (
              <div className={`${PILL_NOTE} animate-note-in motion-reduce:animate-fade-in`}>{note}</div>
            ) /* slides up and fades in */
          }
        </div>
        {
          count > 0 && (
            <SavePill count={count} saving={saving} onSave={items.save} onDiscard={items.discard} />
          ) /* only while changes are pending */
        }
      </div>
      {/* The Item sheet, remounted for each item so its drafts start fresh. */}
      {sheet?.mode === 'add' && meta !== null && (
        <ItemSheet
          key="add" // a fresh draft each time
          mode="add"
          categories={meta.categories}
          currency={meta.currency}
          defaultPriceCents={meta.defaultPriceCents}
          onDone={() => undefined} // an Add never uses Done
          onAdd={items.add} // saved at once
          onDelete={items.remove} // never offered in Add
          onPicture={items.uploadItemPicture} // never offered in Add
          onClose={() => setSheet(null)} // goes away
        />
      )}
      {sheet?.mode === 'edit' && editing !== undefined && meta !== null && (
        <ItemSheet
          key={editing.id} // a fresh draft per item
          mode="edit"
          honor={editing}
          pending={pending[editing.id]?.edits}
          categories={meta.categories}
          currency={meta.currency}
          defaultPriceCents={meta.defaultPriceCents}
          isNameTaken={(name) =>
            [
              ...rows.map((row) => conflicts[row.id] ?? row), // the latest values of flagged rows
              ...Object.values(pending).map((entry) => ({ ...entry.seen, name: entry.edits.name ?? entry.seen.name })), // names waiting to be saved
            ].some((row) => row.id !== editing.id && row.name.toLowerCase() === name.toLowerCase())
          } // another listed, flagged or pending item has it
          onDone={(values) => items.setDetails(editing, values)} // into the pending list
          onAdd={items.add} // never used in Edit
          onDelete={items.remove} // after the Delete dialog
          onPicture={items.uploadItemPicture} // saved at once
          pictureDeps={pictureDeps} // the browser's own unless a test passes fakes
          onClose={() => setSheet(null)} // goes away
        />
      )}
    </>
  )
}
