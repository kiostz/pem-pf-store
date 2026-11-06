// The Subcategory filter: a swipeable row of toggle buttons (All, then the picked category's subcategories) under Shop's search, so a buyer narrows a long category such as Honors to one honor area with one tap.

import { useEffect, useRef } from 'react' // scroll the picked chip into view once

const CHIP_BOX = 'rounded-pill min-h-11 snap-start px-4 whitespace-nowrap border text-base transition-[color,background-color,border-color,transform] duration-(--duration-fast) focus-visible:outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] active:duration-(--duration-press)' // one 44 px chip with press feedback and the focus ring outside
const CHIP_PICKED = 'bg-accent text-on-accent border-transparent' // the pick is filled, as actions are
const CHIP_IDLE = 'bg-bg-surface text-text-default border-border-subtle' // the rest are surface chips with the hairline

/**
 * Draws the Subcategory filter.
 * @param subcategories the subcategory names to offer, A to Z and not empty
 * @param selected the picked subcategory, or null for All
 * @param onSelect called with the name picked, or null for All; not called for the chip already picked
 * @return a labelled group holding an All button and one button per name, each with aria-pressed
 */
export function SubcategoryFilter({ // the three props
  subcategories, // the names, A to Z
  selected, // the pick, null for All
  onSelect, // reports a different pick
}: { // their types
  subcategories: string[] // the subcategory names, A to Z and not empty
  selected: string | null // the picked subcategory, null for All
  onSelect: (next: string | null) => void // called when a different chip is tapped
}) { // props done
  const pickedRef = useRef<HTMLButtonElement>(null) // the chip picked at mount, if it is not All

  // On mount, bring a picked chip that sits past the edge into view; the row only, never the page.
  useEffect(() => { // runs after the first draw
    pickedRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) // nearest on both axes so the page stays put
  }, []) // once: later picks are already under the buyer's finger

  /**
   * Draws one chip.
   * @param name the chip's text and value; null is All
   * @return a toggle button
   */
  const chip = (name: string | null) => { // one toggle button
    const pressed = name === selected // whether this chip is the pick
    return ( // the button
      // One toggle button: its text is its name, All for null; the text line carries no comment because JSX would add a space to it.
      <button
        key={name ?? 'all'} // All has no name to key by
        ref={pressed && name !== null ? pickedRef : undefined} // only a named pick needs scrolling into view
        type="button" // not a form submit
        aria-pressed={pressed} // tells a screen reader which is on
        onClick={() => { // a tap
          if (!pressed) onSelect(name) // a tap on the pick changes nothing
        }}
        className={`${CHIP_BOX} ${pressed ? CHIP_PICKED : CHIP_IDLE}`} // filled against outlined, so it is not hue alone
      >
        {name ?? 'All'}
      </button>
    )
  }

  return ( // the row
    // Out to the screen edges so the next chip shows in part; 4 px of room above and below, taken back by the negative margin, so a focus ring is not clipped; the scroll padding keeps a snapped chip 16 px from the edge.
    <div role="group" aria-label="Subcategory" className="-mx-4 -my-1 flex scroll-px-4 snap-x gap-2 overflow-x-auto px-4 py-1">
      {chip(null)} {/* All comes first */}
      {subcategories.map((name) => chip(name))} {/* then each name as given */}
    </div>
  )
}
