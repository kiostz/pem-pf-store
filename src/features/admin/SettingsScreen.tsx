// The admin Settings screen: the Shop section (currency and default price, saved together with one Save button) above the "Email each new order to the club inbox" switch, which saves at once, each with its Saved, failed, conflict and signed-out notes, and the line about clearing the club inbox.

import { useEffect, useRef, useState } from 'react' // the stored value, notes and the in-flight guard
import { ACTION_BOX } from '@/shared/ui/button-box.ts' // the shared 44 px pill action
import { formatPrice } from '@/shared/format/price.ts' // "RM 4.00"
import type { PriceSettings, PricesChange } from '../../../workers/admin/src/admin-types.ts' // the shapes
import { CURRENCIES } from '@/shared/format/currencies.ts' // the currencies the Worker accepts
import { loadMeta, loadSettings, savePrices, saveSettings, SIGNED_OUT_NOTE } from './admin-api.ts' // the settings calls
import { FIELD_BOX, SOFT_BUTTON } from './admin-boxes.ts' // the field and the quiet 44 px action
import { currencySymbol, formatPriceInput, parsePrice } from './price-input.ts' // the price field

const INBOX_LINE =
  "The club inbox keeps each order email with the buyer's name, email and phone. Delete the ones older than 12 months there." // the yearly clean-up reminder

// Where the screen stands: waiting, ready with the switch, or failed.
type Load = 'loading' | 'ready' | 'error' | 'signed-out'

/**
 * The Shop section: Currency and Default price, with one Save button.
 * @param onPricesSaved told the stored values after a save and after a conflict, so Items can follow
 * @return the Shop heading with its form, or its skeleton, failure or signed-out line
 */
function ShopSection({ onPricesSaved }: { onPricesSaved?: (prices: PriceSettings) => void }) { // the Shop form
  const [load, setLoad] = useState<Load>('loading') // the read
  const [stored, setStored] = useState<PriceSettings>({ currency: 'MYR', defaultPriceCents: 0 }) // what the Worker holds
  const [currency, setCurrency] = useState('MYR') // the select as shown
  const [priceText, setPriceText] = useState('') // the price field as typed
  const [priceError, setPriceError] = useState<string | null>(null) // the line under the price
  const [note, setNote] = useState<{ text: string; failed: boolean } | null>(null) // the line under Save
  const [busy, setBusy] = useState(false) // a save is out
  const [attempt, setAttempt] = useState(0) // bumped by Try again
  const saving = useRef(false) // blocks a second save before the first answers

  /**
   * Puts the stored values in the fields.
   * @param prices the values the Worker holds
   */
  function show(prices: PriceSettings) { // fills the fields
    setStored(prices) // the new baseline
    setCurrency(prices.currency) // the select
    setPriceText(formatPriceInput(prices.defaultPriceCents)) // the field
    setPriceError(null) // no old line
  }

  // Reads the stored values; Try again reads them again.
  useEffect(() => { // runs on mount and on Try again
    let live = true // false after unmount
    void loadMeta().then((result) => { // the read
      if (!live) return // a late answer is dropped
      if (result.kind === 'ok') { // the read worked
        show({ currency: result.meta.currency, defaultPriceCents: result.meta.defaultPriceCents }) // the stored values
        setLoad('ready') // show the form
      } else setLoad(result.kind === 'signed-out' ? 'signed-out' : 'error')
    })
    return () => { // cleanup
      live = false // stop listening
    }
  }, [attempt])

  /**
   * Saves what changed; nothing is sent when nothing did.
   * @param event the form's submit
   */
  async function save(event: React.FormEvent) { // the form's submit
    event.preventDefault() // no page load
    if (saving.current) return // one save at a time
    const price = parsePrice(priceText) // the typed price
    if (!price.ok) { // the typed price is not valid
      setPriceError(price.error) // the line says why
      setNote(null) // nothing was saved
      return // nothing goes out
    }
    setPriceError(null) // the field is fine
    const change: PricesChange = {} // only what changed
    if (currency !== stored.currency) change.currency = { from: stored.currency, to: currency } // the select moved
    if (price.cents !== stored.defaultPriceCents) change.defaultPriceCents = { from: stored.defaultPriceCents, to: price.cents } // the price moved
    if (change.currency === undefined && change.defaultPriceCents === undefined) { // no change
      setNote({ text: 'Nothing to save.', failed: false }) // the Worker refuses a no-op
      return // nothing goes out
    }
    saving.current = true // taken
    setBusy(true) // the button says so
    setNote(null) // the old note goes
    const result = await savePrices(change) // the write
    saving.current = false // free again
    setBusy(false) // the button is back
    if (result.kind === 'ok') { // saved
      show(result.prices) // the stored values, written as the field shows them
      setNote({ text: 'Saved.', failed: false }) // confirmed in place
      onPricesSaved?.(result.prices) // Items follows
    } else if (result.kind === 'conflict') { // another tab changed it
      show(result.prices) // the stored values win
      setNote({
        text: `These settings were changed in another tab. They are now ${result.prices.currency} and ${formatPrice(result.prices.defaultPriceCents / 100, result.prices.currency)}.`,
        failed: false,
      })
      onPricesSaved?.(result.prices) // Items follows
    } else setNote({ text: result.kind === 'signed-out' ? SIGNED_OUT_NOTE : "The settings weren't saved.", failed: true }) // the typing stays
  }

  const codes = CURRENCIES.some((code) => code === stored.currency) ? [...CURRENCIES] : [stored.currency, ...CURRENCIES] // a stored code outside the list is shown, so the field never lies

  return (
    <section aria-labelledby="shop-title">
      <h2 id="shop-title" className="text-lg font-bold">
        Shop
      </h2>
      {/* The form's shape while the read is out. */}
      {load === 'loading' && <div aria-hidden="true" className="bg-border-subtle animate-skeleton rounded-card mt-3 h-64 motion-reduce:animate-none" />}
      {load === 'ready' && (
        <form onSubmit={(event) => void save(event)} noValidate className="border-border-subtle bg-bg-surface rounded-card mt-3 border p-3">
          <div className="grid gap-4">
            <div>
              <label htmlFor="shop-currency" className="mb-1 block text-sm font-medium">
                Currency
              </label>
              <select
                id="shop-currency" // the label points here
                value={currency} // controlled
                disabled={busy} // locked while a save runs, so the answer cannot overwrite typing
                onChange={(event) => { // the choice
                  setCurrency(event.target.value) // the choice
                  setNote(null) // the last outcome no longer describes the form
                }}
                aria-describedby={currency !== stored.currency ? 'shop-currency-note' : undefined} // read with the field
                className={`category-filter ${FIELD_BOX} w-full`} // the site's select styling
              >
                {codes.map((code) => (
                  <option key={code} value={code}>
                    {`${code} (${currencySymbol(code)})`}
                  </option>
                ))}
              </select>
              {currency !== stored.currency && (
                <p id="shop-currency-note" className="text-text-muted mt-1 text-sm">
                  {`Prices aren't converted: ${formatPrice(4, stored.currency)} becomes ${formatPrice(4, currency)}.`} {/* built from the two fields */}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="shop-price" className="mb-1 block text-sm font-medium">
                {`Default price (${currencySymbol(stored.currency)})`}
              </label>
              <input
                id="shop-price" // the label points here
                value={priceText} // controlled
                readOnly={busy} // locked while a save runs, so the answer cannot overwrite typing
                onChange={(event) => { // every keystroke
                  setPriceText(event.target.value) // every keystroke
                  setNote(null) // the last outcome no longer describes the form
                }}
                inputMode="decimal" // a number pad on phones
                aria-invalid={priceError !== null} // the line below says why
                aria-describedby={priceError ? 'shop-price-error' : 'shop-price-hint'} // read with the field
                autoComplete="off" // no history dropdown
                className={`${FIELD_BOX} w-full`} // the field box
              />
              {priceError ? (
                <p id="shop-price-error" className="text-danger mt-1 text-sm">
                  {priceError} {/* what to fix */}
                </p>
              ) : (
                <p id="shop-price-hint" className="text-text-muted mt-1 text-sm">
                  New items start at this price. Existing prices don&apos;t change.
                </p>
              )}
            </div>
          </div>
          <button
            type="submit" // Enter in the price does this
            aria-disabled={busy} // a second click is ignored
            className={`${ACTION_BOX} bg-accent text-on-accent mt-4 h-13 w-full px-6 font-extrabold! aria-disabled:opacity-60 sm:w-auto`} // oxblood, the section's one primary
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}
      {load === 'error' && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-danger">We couldn&apos;t load the shop settings.</p>
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
    </section>
  )
}

/**
 * The Order email section.
 * @return the switch with its notes and the inbox line
 */
function OrderEmailSection() {
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

/**
 * The Settings screen.
 * @param onPricesSaved told the stored currency and default price after a Shop save or a conflict
 * @return the Shop section above the Order email section
 */
export function SettingsScreen({ onPricesSaved }: { onPricesSaved?: (prices: PriceSettings) => void }) {
  return (
    <div className="grid gap-8">
      <ShopSection onPricesSaved={onPricesSaved} /> {/* currency and default price */}
      <OrderEmailSection /> {/* the switch */}
    </div>
  )
}
