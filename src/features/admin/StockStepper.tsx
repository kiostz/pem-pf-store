// The admin's stock stepper [ - n + ]: 0 to 9,999 by buttons or a typed number; a cleared field restores the earlier value, so an accident never zeroes stock.

import { useState } from 'react' // the text being typed

const MAX_STOCK = 9999 // the Worker's limit on a new stock
const CONTROL_BOX =
  'h-11 bg-transparent text-center text-lg focus-visible:outline-focus-ring focus-visible:outline-2 focus-visible:-outline-offset-2' // 44 px tall, ring drawn inside the pill
const BUTTON_BOX = `${CONTROL_BOX} w-11 rounded-pill transition-transform duration-(--duration-press) active:scale-[0.97] aria-disabled:opacity-40` // 44 px square, press feedback, dimmed at a limit

/**
 * Draws the stepper.
 * @param itemName the item's name, used in the labels
 * @param stock the stock now
 * @param onChange called with the new stock when a button or the typed number commits it
 * @return a group with minus, the number field and plus
 */
export function StockStepper({
  itemName,
  stock,
  onChange,
}: {
  itemName: string // the item's name
  stock: number // the stock now
  onChange: (stock: number) => void // called on a real change
}) {
  const [draft, setDraft] = useState<string | null>(null) // what the admin is typing, null when not typing

  /** Commits the typed number: clamped to the limit, and an empty field changes nothing. */
  const commit = () => {
    if (draft === null) return // nothing typed
    setDraft(null) // show the real stock again
    if (draft === '') return // a cleared field restores the earlier value
    const next = Math.min(Number(draft), MAX_STOCK) // never above the limit
    if (next !== stock) onChange(next) // only a real change
  }

  return (
    // One labelled group so a screen reader names all three controls together.
    <div
      role="group"
      aria-label={`Stock of ${itemName}`}
      className="border-border-subtle bg-bg-surface rounded-pill flex shrink-0 items-center border"
    >
      {/* Minus: aria-disabled at 0 so focus stays, and the label says why. */}
      <button
        type="button" // not a form submit
        aria-label={stock <= 0 ? "Stock can't go below 0" : 'One less'} // the reason at the limit
        aria-disabled={stock <= 0} // not `disabled`, so focus stays
        onClick={() => stock > 0 && onChange(Math.min(stock - 1, MAX_STOCK))} // does nothing at 0; a stock above the limit steps to it
        className={BUTTON_BOX}
      >
        −
      </button>
      {/* The number, typed or stepped. */}
      <input
        type="text" // a number input would add spinners and accept "e"
        inputMode="numeric" // number keypad on phones
        aria-label={`Stock of ${itemName}`} // names the item
        value={draft ?? String(stock)} // the typing, or the real stock
        onFocus={(event) => event.target.select()} // typing replaces the number
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, '')) /* digits only */}
        onBlur={commit} // leaving commits
        onKeyDown={(event) => { // Enter commits and never submits a wrapping form
          if (event.key !== 'Enter') return // only Enter
          event.preventDefault() // a wrapping form must not submit
          commit() // Enter commits
        }}
        className={`${CONTROL_BOX} w-14`} // room for four digits
      />
      {/* Plus: aria-disabled at the limit, and the label says why. */}
      <button
        type="button" // not a form submit
        aria-label={stock >= MAX_STOCK ? "Stock can't go above 9,999" : 'One more'} // the reason at the limit
        aria-disabled={stock >= MAX_STOCK} // not `disabled`, so focus stays
        onClick={() => stock < MAX_STOCK && onChange(stock + 1)} // does nothing at the limit
        className={BUTTON_BOX}
      >
        +
      </button>
    </div>
  )
}
