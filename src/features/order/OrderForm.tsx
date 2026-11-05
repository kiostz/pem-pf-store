// The order form under the cart's estimated total: name, email, phone, club and captcha, with Send order that looks ready only when everything is filled in and sends the order.

import { useEffect, useRef, useState, type FormEvent } from 'react' // the captcha token, the send state and focus
import { InfoIcon } from '@/features/cart/cart-icons.tsx' // the failure note's icon
import { estimatedTotalCents, type OrderLine } from '@/features/cart/cart.ts' // the order lines being sent, and their total
import { useCart } from '@/features/cart/use-cart.ts' // the sent order lines leave it
import type { ClubList } from '@/shared/data/types.ts' // the clubs
import { ORDER_SENT_HASH } from '@/shared/routes.ts' // the confirmation page's address
import { formatPrice } from '@/shared/format/price.ts' // "RM 24.00"
import { PILL_ACTION, PILL_DOCK, PILL_NOTE, PILL_SURFACE } from '@/shared/ui/floating-pill-box.ts' // the floating pill and the note above it
import { Captcha, type CaptchaHandle } from './Captcha.tsx' // the Turnstile widget
import { ClubSelect } from './ClubSelect.tsx' // the club field
import { FIELD_BOX, FIELD_ERROR, FIELD_LABEL } from './field-box.ts' // the shared field look
import { toSentOrder, type SentOrder } from './order-email.ts' // the stored order
import { missingText, validateOrderForm, type OrderField } from './order-form.ts' // the form's rules
import { OrderSendError, OrderStockError, sendOrder, toOrderRequest } from './send-order.ts' // the send and its failures
import { clearPendingSend, writePendingSend } from './pending-send-storage.ts' // keeps the send for a reload
import { writeSentOrder } from './sent-order-storage.ts' // keeps the order for the confirmation
import { useOrderForm } from './use-order-form.ts' // the form's values

const FAILED_TEXT = 'Your order was not sent. Check your connection, complete the captcha again and press Send order.' // in the note above Send order after a failure
const RATE_LIMITED_TEXT =
  'Too many orders were sent just now. Wait a minute, complete the captcha again and press Send order.' // in the note above Send order after a 429
const CAPTCHA_TEXT = "The captcha check didn't pass. Complete it again and press Send order." // in the note above Send order when Cloudflare refused the token

const TAKE_BACK_MS = 1000 // how long after a failure the widget's own focus grab is handed back to Send order

const FIELD_IDS: Record<OrderField, string> = {
  name: 'order-name',
  email: 'order-email',
  phone: 'order-phone',
  club: 'order-club',
  otherClub: 'order-other-club',
} // the DOM id of each field, in form order, for focusing the first invalid one

/**
 * Draws the order form.
 * @param lines the order lines to send
 * @param currency the ISO code from settings
 * @param clubs the clubs for the dropdown
 * @param onStockRefused called with the Worker's short lines when it refuses the order, so the shop's data shows them
 * @return the fields, the captcha, Send order and the line saying what is missing
 */
export function OrderForm({
  lines,
  currency,
  clubs,
  onStockRefused,
}: {
  lines: OrderLine[]
  currency: string
  clubs: ClubList
  onStockRefused: (refused: OrderStockError['lines']) => void
}) {
  const {
    values,
    touched,
    setField,
    touch,
    touchAll,
    reset,
    sending,
    sendingRef,
    setSending,
    failure,
    setFailure,
    setRefused,
    requestRef,
  } = useOrderForm() // the form's state and the running send, kept above the routes
  const { removeOrderLines } = useCart() // a sent order leaves the cart
  const [token, setToken] = useState<string | null>(null) // the captcha token, until it expires
  const [sentNumber, setSentNumber] = useState<string | null>(null) // set when the order went out but the confirmation page could not open
  const captchaRef = useRef<CaptchaHandle>(null) // reset after every failed send, because the Worker spends the token
  const sendRef = useRef<HTMLButtonElement>(null) // focused after a failure
  const missingRef = useRef<HTMLParagraphElement>(null) // focused when only the captcha is missing
  const captchaBoxRef = useRef<HTMLDivElement>(null) // holds the widget's frame, to tell its focus grab from any other window blur
  const takeFocusBackRef = useRef(false) // set by a failure, cleared by the buyer's first key or tap, a captcha token or a second's wait: the captcha's reset may then grab focus once
  const errors = validateOrderForm(values, clubs) // what is wrong now
  const complete = Object.keys(errors).length === 0 && token !== null // ready to send
  const missing = missingText(errors, token !== null) // the line under the button
  const totalText = formatPrice(estimatedTotalCents(lines) / 100, currency).replace(/\u00a0/g, ' ') // "RM 24.00"; the formatter puts a no-break space after "RM", and the button's name should read with a plain one
  /**
   * Gives the error text of a field once the buyer has left it.
   * @param field the field
   * @return the text, or undefined while it is untouched or valid
   */
  const shownError = (field: OrderField) => (touched[field] ? errors[field] : undefined)

  // After a failed send the buyer is back at Send order, ready to solve the captcha again and retry.
  useEffect(() => {
    if (failure === null) return // nothing failed
    sendRef.current?.focus() // the screen is no longer inert by now
    missingRef.current?.scrollIntoView?.({ block: 'nearest' }) // the note stacks over the dock: bring the captcha line above it, as scroll-mb-64 below leaves room (jsdom has no scrollIntoView)
    takeFocusBackRef.current = true // the widget's reset may take focus for its frame soon; the captcha's focus event hands it back
    const timer = window.setTimeout(() => (takeFocusBackRef.current = false), TAKE_BACK_MS) // a tap inside the frame cannot be seen, so the window closes
    /** Hands focus back when the widget's frame takes it: the page gets a window blur and no focus event of its own. */
    const onWindowBlur = () => {
      const frame = document.activeElement // the frame, when it now holds focus
      if (!takeFocusBackRef.current) return // the buyer is steering, or the window closed
      if (!(frame instanceof HTMLIFrameElement) || !captchaBoxRef.current?.contains(frame)) return // another tab or window, not the widget
      takeFocusBackRef.current = false // once
      sendRef.current?.focus() // back to Send order
    }
    window.addEventListener('blur', onWindowBlur) // a frame taking focus blurs the window
    return () => {
      window.clearTimeout(timer) // a new failure or leaving the screen
      window.removeEventListener('blur', onWindowBlur) // stop listening
    }
  }, [failure])

  /** Closes the failure note and puts focus back on Send order, where it was. */
  const dismissFailure = () => {
    setFailure(null) // the note goes
    sendRef.current?.focus() // the × is gone with it, so focus returns to Send order
  }

  /**
   * Handles Send order: an incomplete form shows what is missing; a complete one sends the order.
   * @param event the form's submit
   */
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault() // never a page load
    if (sendingRef.current || sentNumber !== null) return // one send at a time, and never a sent order again
    if (!complete || token === null) {
      touchAll() // every error shows
      const first = (Object.keys(FIELD_IDS) as OrderField[]).find((field) => errors[field] !== undefined) // the first invalid field in form order
      if (first)
        document.getElementById(FIELD_IDS[first])?.focus() // the buyer starts there
      else missingRef.current?.focus() // only the captcha is missing: read the line that says so
      return
    }
    sendRef.current?.focus() // focus stays on Send order, which sits outside the inert fields, so it is not lost to the page
    setSending(true) // no second press, "Sending…", and the screen freezes
    setFailure(null) // the last failure is old news
    const signature = JSON.stringify([lines.map((line) => [line.honor.id, line.quantity]), values]) // what the order is: what the Worker would save
    if (requestRef.current?.signature !== signature) requestRef.current = { signature, requestId: crypto.randomUUID() } // a retry keeps its request id, so a lost reply never makes a second order; an edit gets a new one
    const requestId = requestRef.current.requestId // for the log and the send
    writePendingSend({ requestId, lines: lines.map((line) => [line.honor.id, line.quantity]), values }) // a reload before the answer reuses this id
    let order: SentOrder // what the confirmation keeps, once the Worker has saved it
    try {
      const saved = await sendOrder(toOrderRequest(requestId, token, lines, values)) // the Worker checks, saves and numbers it
      order = toSentOrder(saved, values) // the Worker's names, prices and number
    } catch (error) {
      const kind = // what the log and the note go by
        error instanceof OrderSendError
          ? error.kind // a known failure
          : error instanceof OrderStockError
            ? 'stock' // lines short of stock
            : 'unexpected' // a bug is logged too, never hidden
      const detail = // the safe part of an unexpected error
        error instanceof Error // only an Error has a name and a stack
          ? { name: error.name, stack: (error.stack ?? '').split(`${error.name}: ${error.message}`).join('') } // the stack without the message, which could hold typed text
          : {} // not an Error: nothing safe to add
      console.error('Order send failed', { kind, requestId, ...(kind === 'unexpected' ? detail : {}) }) // no buyer data
      if (kind !== 'network' && kind !== 'timeout' && kind !== 'unexpected') clearPendingSend() // the Worker answered for good: the id is spent; an unknown outcome keeps it
      captchaRef.current?.reset() // the spent token cannot be used again
      setToken(null) // Send is incomplete until solved again
      if (
        error instanceof OrderStockError &&
        error.lines.some((short) => {
          const cartLine = lines.find((line) => line.honor.id === short.honorId) // the cart's line for it
          return cartLine !== undefined && (short.stock === null || short.stock < cartLine.quantity) // gone, or short of the quantity
        })
      ) {
        setRefused(true) // the cart shows why the buyer is back there
        onStockRefused(error.lines) // the lines go red or drop out, and the details page sends the buyer to the cart; cart and form stay as they are
        return // no failure note: the cart says what to fix
      }
      setFailure({
        text: kind === 'rate-limited' ? RATE_LIMITED_TEXT : kind === 'captcha' ? CAPTCHA_TEXT : FAILED_TEXT,
      }) // cart and form stay as they are
      return // the finally below frees the screen
    } finally {
      setSending(false) // the next press may send, the button is itself again and the screen is free
    }
    // The order is sent: nothing below may say it was not.
    try {
      writeSentOrder(order) // for the confirmation page
      clearPendingSend() // the answer is stored: the id is spent
      window.location.replace(ORDER_SENT_HASH) // the confirmation first, so no empty-cart frame paints; Back leads to the cart
      removeOrderLines(order.lines) // only after the Worker saved it, and only what it saved
      reset() // empty fields
      requestRef.current = null // the next order is a new one
    } catch (error) {
      console.error('Order sent but the screen could not be updated', {
        orderNumber: order.number, // which order
        name: error instanceof Error ? error.name : 'unknown', // the kind of error, never its message
      }) // an error here is logged, and the buyer is not told the order failed
      setSentNumber(order.number) // the buyer is told the order went out, in place of the confirmation page
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      onKeyDownCapture={() => (takeFocusBackRef.current = false)} // a key press means the buyer is steering, so the widget may keep focus
      onPointerDownCapture={() => (takeFocusBackRef.current = false)} // so does a tap
      className="mt-6"
    >
      {/* Everything the buyer edits waits while an order sends; Send order sits outside it, so it keeps focus. */}
      <div inert={sending} aria-busy={sending} className="space-y-4">
        {/* Name. */}
        <div>
          <label htmlFor="order-name" className={FIELD_LABEL}>
            Name
          </label>
          <input
            id="order-name" // the label points here
            required // screen readers say it is required; noValidate keeps the browser's own messages off
            type="text" // plain text
            autoComplete="name" // the browser can fill it
            maxLength={100} // the longest name
            value={values.name} // controlled by the form
            onChange={(event) => setField('name', event.target.value)} // report the typing
            onBlur={() => touch('name')} // errors show once the field is left
            aria-invalid={shownError('name') ? true : undefined} // red border with the error text
            aria-describedby={shownError('name') ? 'order-name-error' : undefined} // read the error with the field
            className={FIELD_BOX} // the shared field look
          />
          {shownError('name') && (
            <p id="order-name-error" className={FIELD_ERROR}>
              {shownError('name')}
            </p>
          )}
        </div>
        {/* Email. */}
        <div>
          <label htmlFor="order-email" className={FIELD_LABEL}>
            Email
          </label>
          <input
            id="order-email" // the label points here
            required // screen readers say it is required; noValidate keeps the browser's own messages off
            type="email" // the email keyboard on phones
            autoComplete="email" // the browser can fill it
            maxLength={254} // the longest address
            value={values.email} // controlled by the form
            onChange={(event) => setField('email', event.target.value)} // report the typing
            onBlur={() => touch('email')} // errors show once the field is left
            aria-invalid={shownError('email') ? true : undefined} // red border with the error text
            aria-describedby={shownError('email') ? 'order-email-error' : undefined} // read the error with the field
            className={FIELD_BOX} // the shared field look
          />
          {shownError('email') && (
            <p id="order-email-error" className={FIELD_ERROR}>
              {shownError('email')}
            </p>
          )}
        </div>
        {/* Phone. */}
        <div>
          <label htmlFor="order-phone" className={FIELD_LABEL}>
            Phone
          </label>
          <input
            id="order-phone" // the label points here
            required // screen readers say it is required; noValidate keeps the browser's own messages off
            type="tel" // the number pad on phones
            autoComplete="tel" // the browser can fill it
            maxLength={30} // room for spaces, dashes and brackets round 15 digits
            value={values.phone} // controlled by the form
            onChange={(event) => setField('phone', event.target.value)} // report the typing
            onBlur={() => touch('phone')} // errors show once the field is left
            aria-invalid={shownError('phone') ? true : undefined} // red border with the error text
            aria-describedby={shownError('phone') ? 'order-phone-error' : undefined} // read the error with the field
            className={FIELD_BOX} // the shared field look
          />
          {shownError('phone') && (
            <p id="order-phone-error" className={FIELD_ERROR}>
              {shownError('phone')}
            </p>
          )}
        </div>
        {/* Club: the dropdown and the Other field. */}
        <ClubSelect
          clubs={clubs}
          value={values.club}
          otherValue={values.otherClub}
          error={shownError('club')}
          otherError={shownError('otherClub')}
          onChange={(value) => setField('club', value)}
          onOtherChange={(value) => setField('otherClub', value)}
          onBlur={touch}
        />
        {/* The captcha; its token is what lets Send order look ready. */}
        <div
          ref={captchaBoxRef} // the widget's frame lives in here
          onFocus={() => {
            if (!takeFocusBackRef.current) return // the buyer went here on purpose, or nothing failed
            takeFocusBackRef.current = false // once
            sendRef.current?.focus() // the widget's reset grabbed focus; back to Send order
          }} // focus events bubble from the widget's frame
        >
          <Captcha
            onToken={(next) => {
              takeFocusBackRef.current = false // the widget has spoken; its focus is the buyer's own
              setToken(next) // the token, or null when it expires
            }}
            ref={captchaRef}
          />
        </div>
        {/* The order went out but the confirmation page could not open. */}
        {sentNumber && (
          <p role="status" className="text-sm">
            Order sent. Your order number is {sentNumber}. Do not send it again; the treasurer will email you the
            invoice.
          </p>
        )}
        {/* Why the button looks disabled. */}
        {missing && (
          <p
            ref={missingRef}
            tabIndex={-1}
            id="order-missing"
            className="text-text-muted scroll-mb-64 text-sm outline-none"
          >
            {missing}
          </p>
        )}
      </div>
      {/* Heard when a send starts; mounted before, so the first announcement is read. */}
      <p aria-live="polite" className="sr-only">
        {sending ? 'Sending…' : ''}
      </p>
      {/* The dock: the failure note, the no-payment line and the pill, stacked 12 px apart; Send order stays inside the form, so Enter in a field presses it. */}
      <div className={PILL_DOCK}>
        {/* Says the order was not sent, with a red × to close it; no timer, so it stays until the next send or the ×. */}
        {failure && (
          <div data-failure-note className={`${PILL_NOTE} animate-note-in motion-reduce:animate-fade-in`}>
            <InfoIcon className="size-5 shrink-0" /> {/* decorative: the text says it */}
            <p role="alert" className="min-w-0 flex-1 py-2 text-sm wrap-break-word">
              {failure.text}
            </p>
            <button
              type="button" // not a form submit
              aria-label="Dismiss" // the × glyph is decorative
              onClick={dismissFailure} // close the note
              className="focus-visible:outline-focus-ring rounded-pill flex size-11 shrink-0 items-center justify-center transition-transform duration-(--duration-press) focus-visible:outline-2 focus-visible:outline-offset-0 active:scale-[0.97]" // 44 px target
            >
              <span
                aria-hidden="true"
                className="bg-note-close text-on-note-close flex size-8 items-center justify-center rounded-full text-xl leading-none font-bold"
              >
                × {/* the close mark: white on a 32 px red circle */}
              </span>
            </button>
          </div>
        )}
        {/* What happens after Send: on a stone strip so it reads over the form scrolling beneath. */}
        <p className="bg-bg-app text-text-muted rounded-card px-3 py-1 text-center text-[0.8125rem]">
          No payment now. We&apos;ll contact you to confirm.
        </p>
        {/* The pill; aria-disabled keeps Send order focusable so a press can say what is missing. */}
        <div className={PILL_SURFACE}>
          <button
            ref={sendRef} // focused after a failure
            type="submit" // Enter in a field presses it too
            aria-disabled={!complete || sending} // looks disabled until complete, and while sending
            aria-describedby={missing ? 'order-missing' : undefined} // read what is missing with the button
            className={`${PILL_ACTION} w-full px-6 aria-disabled:opacity-50`} // the screen's one primary pill, full width
          >
            {sending ? (
              'Sending…'
            ) : (
              <>
                Send order <span aria-hidden="true">·</span> {totalText}{' '}
                {/* the label, then the total; the dot is not read */}
              </>
            )}
            {/* Appears only after the loader delay, so a quick send flashes nothing. */}
            {sending && <span aria-hidden="true" className="send-spinner ml-2" />}
          </button>
        </div>
      </div>
    </form>
  )
}
