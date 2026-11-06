// The quantity control on a catalogue card: an Add pill at 0 that turns into the − n + stepper, with focus kept on the control the buyer's hands are on.

import { useEffect, useRef } from 'react' // handles on the control and the focus to give
import { PILL_BOX } from '@/shared/ui/button-box.ts' // the pill shape
import { MAX_QUANTITY } from './cart.ts' // the 99 default of the max
import { QuantityStepper } from './QuantityStepper.tsx' // the stepper from 1

const FADE_IN = 'animate-[fade-in_var(--duration-fast)_var(--ease-out-soft)_both] motion-reduce:animate-none' // the short crossfade-in of whichever control appears; none under reduced motion

/**
 * Draws Add at 0 and the stepper from 1.
 * @param itemName the item's name, used in the labels
 * @param quantity the quantity now, 0 to 99
 * @param onChange called with the new quantity
 * @param max the most the stepper allows, 99 unless the stock is lower
 * @param soldOut true when the stock is 0: a Sold out pill takes the place of Add and the stepper
 * @return a 44 px tall box holding Add, the stepper or the Sold out pill
 */
export function CardQuantity({
  itemName, // the item name for the labels
  quantity,
  onChange,
  max = MAX_QUANTITY,
  soldOut = false,
}: {
  itemName: string // the item name, used in the labels
  quantity: number
  onChange: (quantity: number) => void
  max?: number
  soldOut?: boolean
}) {
  const boxRef = useRef<HTMLDivElement>(null) // the box that holds whichever control shows
  const focusNext = useRef<'more' | 'add' | null>(null) // which control to focus after the swap, null when none was asked for
  const inCart = quantity > 0 // which control shows

  // After a swap the control that had focus is gone; give focus to its replacement unless the buyer moved on.
  useEffect(() => {
    const wanted = focusNext.current // what the last change asked for
    if (wanted === null) return // no swap by a change (also true on mount)
    focusNext.current = null // ask once
    // One tick later: a blur commits while the browser is still moving focus to the tapped control, so only then is it known where focus went.
    const timer = window.setTimeout(() => {
      const active = document.activeElement // where focus is now
      if (active !== null && active !== document.body && !boxRef.current?.contains(active)) return // the buyer chose another control: leave it
      boxRef.current
        ?.querySelector<HTMLElement>(wanted === 'more' ? '[role="group"] > button:last-of-type' : 'button')
        ?.focus() // the + (its label changes at the max), or Add
    }, 0) // after the focus change
    return () => window.clearTimeout(timer) // leaving the screen cancels it
  }, [inCart])

  /**
   * Passes a new quantity up and notes where focus goes if the control swaps.
   * @param next the new quantity
   */
  const change = (next: number) => {
    if (next === 0 && inCart) focusNext.current = 'add' // the stepper is about to unmount
    onChange(next) // edit the cart
  }

  return (
    // Fixed 44 px so the card does not jump when the control swaps.
    <div ref={boxRef} className="flex h-11 w-full justify-center">
      {soldOut ? (
        // A pill, not a control: no focus, no tap, nothing to press.
        <span className={`${PILL_BOX} bg-bg-soft text-text-muted w-full`}>Sold out</span>
      ) : inCart ? (
        // key keeps the two controls as separate elements so each plays its entrance.
        <div key="stepper" className={FADE_IN}>
          <QuantityStepper itemName={itemName} quantity={quantity} onChange={change} max={max} /> {/* − n + */}
        </div>
      ) : (
        <button
          key="add"
          type="button" // not a form submit
          aria-label={`Add ${itemName}`} // names the item
          onClick={() => {
            focusNext.current = 'more' // the Add button is about to unmount
            onChange(1) // the first one
          }}
          className={`${PILL_BOX} bg-accent text-on-accent focus-visible:outline-focus-ring w-full transition-transform duration-(--duration-press) focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] ${FADE_IN}`} // oxblood pill, press feedback, focus ring
        >
          Add
        </button>
      )}
    </div>
  )
}
