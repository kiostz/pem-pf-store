// The labelled search input of the catalogue toolbar, so a buyer can narrow the list by typing part of a name.

import type { Ref } from 'react' // the type of the forwarded ref

/**
 * Draws the search box.
 * @param value the text currently typed
 * @param onChange called with the new text on every keystroke
 * @param ref lets the screen focus the box after Clear filters
 * @return a visually hidden label and a search input
 */
export function SearchBox({
  value,
  onChange,
  ref,
}: {
  value: string // the text currently typed
  onChange: (value: string) => void // called on every keystroke
  ref?: Ref<HTMLInputElement> // the input element, for focusing
}) {
  return (
    // Holds the label and the input.
    <div>
      {/* The visible hint disappears while typing, so the label stays for screen readers. */}
      <label htmlFor="item-search" className="sr-only">
        Search items
      </label>
      {/* 16 px text stops iOS zooming in on focus; 44 px tall for a thumb. */}
      <input
        id="item-search" // the label points here
        ref={ref} // so Clear filters can focus it
        type="search" // search keyboard and clear button
        value={value} // controlled by the screen
        onChange={(event) => onChange(event.target.value)} // report every keystroke
        placeholder="Search items" // visible hint
        autoComplete="off" // no browser history dropdown
        className="border-border-subtle bg-bg-surface focus-visible:outline-focus-ring rounded-pill min-h-11 w-full border px-4 text-base focus-visible:outline-2 focus-visible:outline-offset-2" // 44 px tall, 16 px text, focus ring
      />
    </div>
  )
}
