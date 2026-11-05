// Holds the order form's values and the running send above the routes, in memory only, so a buyer who goes back mid-send finds the form as they left it.

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react' // state, refs and context
import { useCart } from '@/features/cart/use-cart.ts' // a changed cart ends the last failure's alert
import { EMPTY_ORDER_FORM, type OrderField, type OrderFormValues } from './order-form.ts' // the form's shapes
import type { Contact } from './order-email.ts' // one send's contact
import { OrderFormContext } from './use-order-form.ts' // the context this provider fills
import { readPendingSend } from './pending-send-storage.ts' // a send a reload cut off

const ALL_FIELDS: OrderField[] = ['name', 'email', 'phone', 'club', 'otherClub'] // every field of the form

/**
 * Holds the form for everything below it.
 * @param children the screens that read or edit the form
 * @return the provider element
 */
export function OrderFormProvider({ children }: { children: ReactNode }) {
  const { quantities } = useCart() // the cart, watched for changes
  const [pending] = useState(() => readPendingSend()) // a send a reload cut off, read once; it stays whatever the cart holds, because its order may still land
  const [values, setValues] = useState<OrderFormValues>(pending?.values ?? EMPTY_ORDER_FORM) // what the buyer has typed; refilled after a reload mid-send
  const [touched, setTouched] = useState<Partial<Record<OrderField, boolean>>>({}) // fields the buyer has left
  const [sending, setSendingState] = useState(false) // an order is on its way
  const [failure, setFailure] = useState<{ text: string } | null>(null) // the alert of the last failed send
  const [refused, setRefused] = useState(false) // the Worker refused the last order for stock: the cart says so until it changes
  const sendingRef = useRef(false) // blocks a second press in the same tick, before state shows
  const requestRef = useRef<{ requestId: string; contacts: Contact[] } | null>(
    pending && { requestId: pending.requestId, contacts: pending.contacts },
  ) // the request id, kept until an order comes back, with every contact sent under it; after a reload the cut-off send's
  const [seenCart, setSeenCart] = useState(quantities) // the cart at the last render

  // A changed cart is a new order, so the last failure's alert goes; adjusted while rendering (React's way to derive state).
  if (seenCart !== quantities) {
    setSeenCart(quantities) // this change is handled
    setFailure(null) // never above a cart the buyer has not sent
    setRefused(false) // nor the refusal note
  }

  /**
   * Changes one field's value.
   * @param field the field
   * @param value its new value
   */
  const setField = useCallback(
    (field: OrderField, value: string) => setValues((current) => ({ ...current, [field]: value })),
    [],
  ) // one field changes
  /**
   * Marks one field as left, so its error can show.
   * @param field the field
   */
  const touch = useCallback(
    (field: OrderField) => setTouched((current) => (current[field] ? current : { ...current, [field]: true })),
    [],
  ) // no re-render when already touched
  /** Marks every field as left, so every error shows after a Send press. */
  const touchAll = useCallback(() => setTouched(Object.fromEntries(ALL_FIELDS.map((field) => [field, true]))), []) // a Send press shows every error
  /** Empties the form and hides every error. */
  const reset = useCallback(() => {
    setValues(EMPTY_ORDER_FORM) // empty fields
    setTouched({}) // no errors showing
    setFailure(null) // a new order starts without the last one's alert
    setRefused(false) // or the last one's refusal
  }, [])

  /**
   * Starts or ends a send, in the flag and in the state.
   * @param next true while an order is on its way
   */
  const setSending = useCallback((next: boolean) => {
    sendingRef.current = next // a second press in this tick sees it
    setSendingState(next) // the screen shows it
  }, [])

  const value = useMemo(
    () => ({
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
      refused,
      setRefused,
      requestRef,
    }), // what every reader gets
    [values, touched, setField, touch, touchAll, reset, sending, setSending, failure, refused], // the refs and the setters never change
  ) // new only when one changes
  return <OrderFormContext.Provider value={value}>{children}</OrderFormContext.Provider> // everything below reads the form
}
