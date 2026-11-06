// The Removed note: "<Name> removed" with Undo above the Checkout bar, held 5 s (paused while the pointer or focus is on it), so a buyer can take a removal back.

import { useEffect, useRef, useState } from 'react' // the hold timer, the pause and focus
import { PILL_NOTE } from '@/shared/ui/floating-pill-box.ts' // the note's look and width, shared with the failure note
import { TrashIcon } from './cart-icons.tsx' // the decorative trash

const HOLD_MS = 5000 // how long the note stays, in total
const FADE_MS = 150 // the last part of the hold, spent fading out (the exit duration token)

/**
 * Draws the note and runs its timer.
 * @param name the removed item's name, shown in the note
 * @param label the name Undo gives a screen reader; differs from name only for a gone item, so two notes can be told apart
 * @param onUndo called when the buyer presses Undo
 * @param onEnd called once the hold has run out unpaused
 * @param takeFocus true for a keyboard removal: Undo takes focus when the note appears
 * @return the note, a dark bar with the trash icon, the text and Undo
 */
export function RemovedNote({
  name,
  label,
  onUndo,
  onEnd,
  takeFocus,
}: {
  name: string
  label: string
  onUndo: () => void
  onEnd: () => void
  takeFocus: boolean
}) {
  const [paused, setPaused] = useState(false) // the pointer is over the note or focus is inside it
  const [fading, setFading] = useState(false) // the last 150 ms
  const undoRef = useRef<HTMLButtonElement>(null) // focused after a keyboard removal
  const onEndRef = useRef(onEnd) // always the latest callback, so the timer need not restart when it changes
  // Keeps the latest callback.
  useEffect(() => {
    onEndRef.current = onEnd // the newest
  }, [onEnd])

  // A keyboard removal puts focus on Undo, so the buyer keeps their place.
  useEffect(() => {
    if (takeFocus) undoRef.current?.focus() // once, as the note appears
  }, [takeFocus])

  /** Holds the note and shows it fully again, in case the fade had begun. */
  const pause = () => {
    setPaused(true) // the timers stop
    setFading(false) // fully visible while held
  }

  // Runs the hold: 5 s from the start, and again from 0 each time a pause ends.
  useEffect(() => {
    if (paused) return // held while the buyer is on it
    const fade = window.setTimeout(() => setFading(true), HOLD_MS - FADE_MS) // the fade-out begins
    const end = window.setTimeout(() => onEndRef.current(), HOLD_MS) // then the note ends
    return () => {
      window.clearTimeout(fade) // a pause or leaving cancels both
      window.clearTimeout(end) // the same
    }
  }, [paused])

  return (
    // The pointer or focus on the note pauses the hold (WCAG 2.2.1); leaving restarts it.
    <div
      data-testid="removed-note"
      onMouseEnter={pause} // the pointer arrives
      onMouseLeave={() => setPaused(false)} // the pointer leaves: a fresh 5 s
      onFocus={pause} // focus arrives inside
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false) // focus left the note: a fresh 5 s
      }}
      className={`${PILL_NOTE} animate-note-in motion-reduce:animate-fade-in transition-opacity duration-(--duration-exit) ${fading ? 'opacity-0' : 'opacity-100'}`} // slides up and fades in; the last 150 ms fade out
    >
      <TrashIcon className="text-trash size-5 shrink-0" /> {/* decorative: the text says it */}
      <span className="min-w-0 flex-1 wrap-break-word">{`${name} removed`}</span> {/* what happened */}
      <button
        ref={undoRef} // for focus
        type="button" // not a form submit
        aria-label={`Undo removing ${label}`} // names the item, the gone ones by id
        onClick={onUndo} // restore the line
        className="focus-visible:outline-focus-ring rounded-pill min-h-11 shrink-0 px-4 font-bold transition-transform duration-(--duration-press) focus-visible:outline-2 focus-visible:outline-offset-0 active:scale-[0.97]" // 44 px, bold, ring
      >
        Undo
      </button>
    </div>
  )
}
