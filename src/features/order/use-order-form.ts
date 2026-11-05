// The order form's context and its hook, in their own file so OrderFormProvider.tsx exports only a component.

import { createContext, useContext, type RefObject } from 'react' // context, its reader and the ref type
import type { Contact } from './order-email.ts' // one send's contact
import type { OrderField, OrderFormValues } from './order-form.ts' // the form's shapes

// What every reader of the form gets.
export type OrderFormValue = {
  values: OrderFormValues // what the buyer has typed or chosen
  touched: Partial<Record<OrderField, boolean>> // fields the buyer has left, or all after a Send press
  setField: (field: OrderField, value: string) => void // change one field
  touch: (field: OrderField) => void // mark one field as left
  touchAll: () => void // mark every field, so every error shows
  reset: () => void // empty the form
  sending: boolean // an order is on its way, kept here so leaving the cart screen cannot lose it
  sendingRef: RefObject<boolean> // the same flag, readable in the same tick as a second press
  setSending: (sending: boolean) => void // starts or ends a send
  failure: { text: string } | null // the alert of the last failed send, a new object per failure
  setFailure: (failure: { text: string } | null) => void // shows or clears the alert
  refused: boolean // the Worker refused the last order for stock or availability, until the cart changes
  setRefused: (refused: boolean) => void // sets or clears it
  requestRef: RefObject<{ requestId: string; contacts: Contact[] } | null> // the request id kept until an order comes back, with every contact sent under it
}

export const OrderFormContext = createContext<OrderFormValue | null>(null) // null outside an OrderFormProvider

/**
 * Reads the order form.
 * @return the values, which fields were left, how to change them, and the send's state
 */
export function useOrderForm(): OrderFormValue {
  const value = useContext(OrderFormContext) // the nearest provider
  if (value === null)
    throw new Error('useOrderForm must be used inside an OrderFormProvider') // a wiring mistake, fail loudly
  return value // the form
}
