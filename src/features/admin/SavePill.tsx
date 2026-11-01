// The Save pill: Discard (quiet) beside Save (n changes) (the one primary action), shown only while changes are pending.

import { PILL_ACTION, PILL_SURFACE } from '@/shared/ui/floating-pill-box.ts' // the floating pill's shape and its oxblood action
import { ACTION_BOX } from '@/shared/ui/button-box.ts' // the shared 44 px pill action: press feedback and focus ring

/**
 * Draws the pill.
 * @param count the number of edited fields
 * @param saving true while a save runs: Save reads "Saving…" and Discard is dead
 * @param onSave called by Save
 * @param onDiscard called by Discard
 * @return the pill with its two actions
 */
export function SavePill({
  count,
  saving,
  onSave,
  onDiscard,
}: {
  count: number // the edited fields
  saving: boolean // a save is running
  onSave: () => void // Save
  onDiscard: () => void // Discard
}) {
  return (
    // The shared pill surface, with a small gap between its two actions.
    <div className={`${PILL_SURFACE} gap-1.5`}>
      {/* Quiet and secondary: soft fill, oxblood text; aria-disabled while saving so focus stays. */}
      <button
        type="button" // not a form submit
        aria-disabled={saving} // dead while saving
        onClick={() => !saving && onDiscard()} // does nothing while saving
        className={`${ACTION_BOX} bg-bg-soft text-accent h-13 px-5 aria-disabled:opacity-40`} // 52 px in the 64 px pill, dimmed while dead
      >
        Discard
      </button>
      {/* The one primary action takes the rest of the pill. */}
      <button
        type="button" // not a form submit
        aria-disabled={saving} // a second click is ignored
        onClick={() => !saving && onSave()} // does nothing while saving
        className={`${PILL_ACTION} min-w-0 flex-1 px-4`} // oxblood, fills the pill
      >
        {saving ? 'Saving…' : `Save (${count} ${count === 1 ? 'change' : 'changes'})`}
      </button>
    </div>
  )
}
