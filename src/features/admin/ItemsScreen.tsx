// The admin Items screen: search and category over every item, one row each with its status and stock, and the Save pill and notes at the bottom, with its loading, error, empty, no-match and signed-out states.

import { PILL_ACTION, PILL_DOCK, PILL_NOTE } from '@/shared/ui/floating-pill-box.ts' // the floating pill's dock and note shapes
import { AdminHonorRow } from './AdminHonorRow.tsx' // one row
import { adminCategoryNames, filterAdminHonors } from './admin-filter.ts' // search and category
import { SavePill } from './SavePill.tsx' // Discard and Save
import { useAdminHonors } from './use-admin-honors.ts' // the screen's state

const SKELETON_ROWS = 8 // how many skeleton rows the loading state shows
const TOOLBAR_BOX = 'border-border-subtle bg-bg-app -mx-4 -mt-6 flex items-start gap-2 border-b px-4 py-2' // the toolbar's box, flush under the header like the Shop's
const COUNT_BOX = 'mt-3 min-h-6' // the count line's box
const FIELD_BOX =
  'border-border-subtle bg-bg-surface focus-visible:outline-focus-ring rounded-pill min-h-11 border px-4 text-base focus-visible:outline-2 focus-visible:outline-offset-2' // a 44 px field, 16 px text so iOS does not zoom
const NOTE_BUTTON =
  'focus-visible:outline-focus-ring rounded-pill min-h-11 shrink-0 px-4 font-bold transition-transform duration-(--duration-press) focus-visible:outline-2 focus-visible:outline-offset-0 active:scale-[0.97]' // a 44 px action inside a note
const NOTES = {
  conflict: "Some items changed since you opened this page. They're marked: check them and save again.", // after a refused save
  failed: "We couldn't save. Your changes are kept. Try again.", // after a failed save
  'signed-out':
    'Your sign-in has ended. Open this page in a new tab to sign in, then save here. Your changes are kept.', // after a 403
} as const // the notes that need no number

/**
 * The Items screen.
 * @return the toolbar, the count, the rows, and the Save pill with its notes
 */
export function ItemsScreen() {
  const adminHonors = useAdminHonors() // the screen's state
  const { status, honors, query, category, pending, conflicts, count, saveState, discarded } = adminHonors // read often
  const ready = status === 'ready' // the rows are loaded
  const saving = saveState === 'saving' // a save is running
  const matches = filterAdminHonors(honors, { query, category }) // what the search and category leave
  const filtering = query.trim() !== '' || category !== null // whether a filter is on
  const countText = `${matches.length} ${matches.length === 1 ? 'item' : 'items'}${filtering ? (matches.length === 1 ? ' matches' : ' match') : ''}` // "422 items", "3 items match", "1 item matches"

  // The one note shown above the pill: Discard's wins, then the save's.
  const note = discarded ? (
    <>
      <span className="min-w-0 flex-1">Changes discarded</span> {/* what happened */}
      <button type="button" onClick={adminHonors.undoDiscard} className={NOTE_BUTTON}>
        Undo
      </button>
    </>
  ) : saveState === 'saved' ? (
    <span className="min-w-0 flex-1 py-3">{`Saved ${adminHonors.savedCount} ${adminHonors.savedCount === 1 ? 'change' : 'changes'}.`}</span> // the size of the save
  ) : saveState === 'conflict' || saveState === 'failed' || saveState === 'signed-out' ? (
    <span className="min-w-0 flex-1 py-3">{NOTES[saveState]}</span> // the refused or failed save
  ) : null // no note

  return (
    <>
      {/* Search and category stay at the top while the rows scroll; shown once there is something to filter. */}
      {ready && honors.length > 0 && (
        <div className={`${TOOLBAR_BOX} sticky top-0 z-10`}>
          {/* The search box takes the width the category filter leaves. */}
          <div className="min-w-0 flex-1">
            <label htmlFor="admin-search" className="sr-only">
              Search items
            </label>
            <input
              id="admin-search" // the label points here
              type="search" // search keyboard and clear button
              value={query} // controlled
              onChange={(event) => adminHonors.setQuery(event.target.value)} // every keystroke
              placeholder="Search items" // visible hint
              autoComplete="off" // no history dropdown
              className={`${FIELD_BOX} w-full`}
            />
          </div>
          {/* The category filter keeps its natural width. */}
          <div className="shrink-0">
            <label htmlFor="admin-category" className="sr-only">
              Category
            </label>
            <select
              id="admin-category" // the label points here
              value={category ?? ''} // controlled; empty is All categories
              onChange={(event) => adminHonors.setCategory(event.target.value === '' ? null : event.target.value)} // the pick
              className={`category-filter ${FIELD_BOX} text-text-default w-42 sm:w-47`} // the site's select styling, a fixed width
            >
              <option value="">All categories</option>
              {adminCategoryNames(honors).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {/* Failed or signed-out loads keep the toolbar's empty band, so the message lands where the skeleton stood. */}
      {(status === 'error' || status === 'signed-out' || (ready && honors.length === 0)) && (
        <div aria-hidden="true" className={`${TOOLBAR_BOX} h-15`} />
      )}
      {/* Skeleton rows of the final row's size, shown only after the loader delay. */}
      {adminHonors.showSkeleton && (
        <div aria-hidden="true" className="flex flex-col gap-3">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <div key={index} data-testid="admin-skeleton-row" className="bg-border-subtle rounded-card h-31 md:h-18" /> // a row's height at 375 px and from 768 px
          ))}
        </div>
      )}
      {/* Announced politely when loading gives way to the count or a message. */}
      <div aria-live="polite">
        {ready && (
          <p className={`${COUNT_BOX} text-text-muted animate-fade-in`}>
            {honors.length === 0
              ? 'Nothing is in the shop yet.'
              : matches.length === 0
                ? `No items match "${query.trim()}"${category !== null ? ` in ${category}` : ''}.`
                : countText}
          </p>
        )}
        {status === 'error' && <p className={`${COUNT_BOX} text-danger`}>We couldn&apos;t load the items.</p>}
        {status === 'signed-out' && (
          <p className={COUNT_BOX}>Your sign-in has ended. Sign in again to see the items.</p>
        )}
      </div>
      {/* The one action of a failed or signed-out load. */}
      {(status === 'error' || status === 'signed-out') && (
        <button
          type="button" // not a form submit
          onClick={status === 'error' ? adminHonors.retry : () => window.location.reload()} // a new load, or a new sign-in
          className={`${PILL_ACTION} mt-4 w-auto px-6`} // the oxblood pill
        >
          {status === 'error' ? 'Try again' : 'Sign in'}
        </button>
      )}
      {/* The rows; locked while a save runs so what was sent is what gets cleared. */}
      {ready && (
        <ul inert={saving} className="animate-fade-in mt-3 flex flex-col gap-3">
          {matches.map((honor) => (
            <AdminHonorRow
              key={honor.id} // stable
              honor={honor} // the row as seen
              pending={pending[honor.id]} // its edits
              conflict={conflicts[honor.id]} // its flag
              onStatus={(next) => adminHonors.setStatus(honor.id, next)} // a status edit
              onStock={(next) => adminHonors.setStock(honor.id, next)} // a stock edit
            />
          ))}
        </ul>
      )}
      {/* The dock: the note stacked 12 px over the pill; the note's region stays mounted so screen readers hear it appear. */}
      {ready && (
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
              <SavePill count={count} saving={saving} onSave={adminHonors.save} onDiscard={adminHonors.discard} />
            ) /* only while changes are pending */
          }
        </div>
      )}
    </>
  )
}
