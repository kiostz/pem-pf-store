// The sort control: a native select beside the Category filter with the three orders the Admin Worker offers, styled like it by index.css.

import { FIELD_BOX } from './admin-boxes.ts' // the shared field look
import type { ItemSort } from './admin-api.ts' // the sort names

const OPTIONS: { value: ItemSort; label: string }[] = [
  { value: 'changed', label: 'Recently changed' }, // the default
  { value: 'newest', label: 'Newest' }, // by Created
  { value: 'name', label: 'Name A–Z' }, // alphabetical
] // the three sorts

/**
 * Draws the sort control.
 * @param sort the sort now
 * @param onChange called with the sort picked
 * @return a visually hidden label and a select with three options
 */
export function SortControl({ sort, onChange }: { sort: ItemSort; onChange: (sort: ItemSort) => void }) {
  return (
    // The label and the select; the parent sets the width.
    <div className="min-w-0 flex-6 sm:w-47 sm:flex-none">
      <label htmlFor="admin-sort" className="sr-only">
        Sort
      </label>
      <select
        id="admin-sort" // the label points here
        value={sort} // controlled
        onChange={(event) => onChange(event.target.value as ItemSort)} // the pick
        className={`category-filter ${FIELD_BOX} w-full truncate`} // the site's select styling, one line cut with an ellipsis
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
