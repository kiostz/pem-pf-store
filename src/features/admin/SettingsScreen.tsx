// The admin Settings screen: the "Email each new order to the club inbox" switch, which saves at once, with its Saved, failed, conflict and signed-out notes, and the line about clearing the club inbox.

import { useEffect, useRef, useState } from 'react' // the stored value, notes and the in-flight guard
import { loadSettings, saveSettings, SIGNED_OUT_NOTE } from './admin-api.ts' // the settings calls
import { SOFT_BUTTON } from './admin-boxes.ts' // the quiet 44 px action

const INBOX_LINE =
  "The club inbox keeps each order email with the buyer's name, email and phone. Delete the ones older than 12 months there." // the yearly clean-up reminder

// Where the screen stands: waiting, ready with the switch, or failed.
type Load = 'loading' | 'ready' | 'error' | 'signed-out'

/**
 * The Settings screen.
 * @return the Order email section
 */
export function SettingsScreen() {
  const [load, setLoad] = useState<Load>('loading') // the read
  const [on, setOn] = useState(true) // the switch as shown
  const [note, setNote] = useState<{ text: string; failed: boolean } | null>(null) // the line under the switch
  const [attempt, setAttempt] = useState(0) // bumped by Try again
  const saving = useRef(false) // blocks a second save before the first answers

  // Reads the stored switch; Try again reads it again.
  useEffect(() => {
    let live = true // false after unmount
    void loadSettings().then((result) => {
      if (!live) return // a late answer is dropped
      if (result.kind === 'ok') {
        setOn(result.orderEmailOn) // the stored value
        setLoad('ready') // show the switch
      } else setLoad(result.kind === 'signed-out' ? 'signed-out' : 'error') // a read never conflicts
    })
    return () => {
      live = false // stop listening
    }
  }, [attempt])

  /** Flips the switch and saves at once; a failure flips it back. */
  async function flip() {
    if (saving.current) return // one save at a time
    saving.current = true // taken
    const from = on // what the admin saw
    setOn(!from) // the switch moves now
    setNote(null) // the old note goes
    const result = await saveSettings(from, !from) // a real flip: the Worker refuses from === to
    saving.current = false // free again
    if (result.kind === 'ok') setNote({ text: 'Saved.', failed: false }) // confirmed in place
    else if (result.kind === 'conflict') {
      setOn(result.orderEmailOn) // the stored value wins
      setNote({
        text: `This setting was changed in another tab. It is now ${result.orderEmailOn ? 'On' : 'Off'}.`,
        failed: false,
      })
    } else {
      setOn(from) // flips back
      setNote({ text: result.kind === 'signed-out' ? SIGNED_OUT_NOTE : "The setting wasn't saved.", failed: true })
    }
  }

  return (
    <section aria-labelledby="order-email-title">
      <h2 id="order-email-title" className="text-lg font-bold">
        Order email
      </h2>
      {/* The switch row's shape while the read is out. */}
      {load === 'loading' && <div aria-hidden="true" className="bg-border-subtle animate-skeleton rounded-card mt-3 h-14 motion-reduce:animate-none" />}
      {load === 'ready' && (
        <div className="border-border-subtle bg-bg-surface rounded-card mt-3 flex items-center justify-between gap-3 border p-3">
          <span id="order-email-label">Email each new order to the club inbox</span>
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button" // not a form submit
              role="switch" // an on/off control
              aria-checked={on} // the state
              aria-labelledby="order-email-label" // named by the text beside it
              onClick={() => void flip()} // saves at once
              className="rounded-pill focus-visible:outline-focus-ring flex h-11 w-11 shrink-0 items-center focus-visible:outline-2 focus-visible:outline-offset-0" // one 44 px target, ring outside it
            >
              {/* The track: green when on, grey when off. */}
              <span
                aria-hidden="true" // the word beside it says it
                className={`rounded-pill relative h-6 w-11 shrink-0 transition-colors duration-(--duration-press) ${on ? 'bg-success' : 'bg-text-muted'}`}
              >
                <span
                  className={`bg-bg-surface rounded-pill absolute top-0.5 left-0.5 size-5 transition-transform duration-(--duration-press) ${on ? 'translate-x-5' : ''}`} // slides 20 px when on
                />
              </span>
            </button>
            <span aria-hidden="true" className="w-8 text-sm font-medium">
              {on ? 'On' : 'Off'}
            </span>
          </span>
        </div>
      )}
      {load === 'error' && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-danger">We couldn&apos;t load the settings.</p>
          <button
            type="button" // not a form submit
            onClick={() => {
              setLoad('loading') // waiting again
              setAttempt((value) => value + 1) // reads again
            }}
            className={SOFT_BUTTON} // the quiet 44 px action
          >
            Try again
          </button>
        </div>
      )}
      {load === 'signed-out' && <p className="mt-3">{SIGNED_OUT_NOTE}</p>}
      {/* The save's outcome; mounted always so screen readers hear it appear. */}
      <p role="status" className={`mt-2 min-h-6 text-sm ${note?.failed ? 'text-danger' : 'text-text-muted'}`}>
        {note?.text}
      </p>
      <p className="text-text-muted mt-3">{INBOX_LINE}</p>
    </section>
  )
}
