// The status control: one switch, green and "Active" when buyers can see the item, grey and "Hidden" when not; the word sits beside the switch so it is never colour alone, and a native button gives Space, Enter and the tab stop for free.

import type { ItemStatus } from '../../../workers/admin/src/admin-types.ts' // the two statuses

/**
 * Draws the status control.
 * @param itemName the item's name, used in the accessible name
 * @param status the status now
 * @param onChange called with the other status on each flip
 * @return a switch with the status word beside it
 */
export function StatusControl({
  itemName,
  status,
  onChange,
}: {
  itemName: string // the item's name
  status: ItemStatus // the status now
  onChange: (status: ItemStatus) => void // called on each flip
}) {
  const active = status === 'active' // on means shown to buyers
  const flip = () => onChange(active ? 'hidden' : 'active') // a flip is the other status
  return (
    // The switch and its word side by side; the word is outside the button so the button's name is the only one announced.
    <div className="flex h-11 shrink-0 items-center gap-2 pr-2">
      <button
        type="button" // not a form submit
        role="switch" // an on/off control
        aria-checked={active} // on when Active
        aria-label={`Active: ${itemName}`} // the name stays the same; aria-checked carries the state
        onClick={flip} // flips
        className="rounded-pill focus-visible:outline-focus-ring flex h-11 w-11 shrink-0 items-center focus-visible:outline-2 focus-visible:outline-offset-0" // one 44 px target, ring outside it
      >
        {/* The track: green when on, grey when off. */}
        <span
          aria-hidden="true" // the word beside it says it
          className={`rounded-pill relative h-6 w-11 shrink-0 transition-colors duration-(--duration-press) ${active ? 'bg-success' : 'bg-text-muted'}`} // 3:1 or better against the card in both states
        >
          {/* The thumb slides to the end when on. */}
          <span
            className={`bg-bg-surface rounded-pill absolute top-0.5 left-0.5 size-5 transition-transform duration-(--duration-press) ${active ? 'translate-x-5' : ''}`} // 20 px, moves 20 px
          />
        </span>
      </button>
      {/* The word, so the state is never colour alone; hidden from assistive tech, and a click on it flips too. */}
      <span aria-hidden="true" onClick={flip} className="w-12 text-sm font-medium">
        {active ? 'Active' : 'Hidden'}
      </span>
    </div>
  )
}
