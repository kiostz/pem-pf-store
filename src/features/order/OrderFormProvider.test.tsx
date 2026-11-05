// Tests for OrderFormProvider: typing and leaving fields, and reset, which the success path uses to empty the form.

import { fireEvent, render, screen } from '@testing-library/react' // render and query
import { useState } from 'react' // the probe's read-out
import { afterEach, describe, expect, it } from 'vitest' // test API
import { CART_STORAGE_KEY } from '@/features/cart/cart-storage.ts' // the stored cart
import { PENDING_SEND_STORAGE_KEY } from './pending-send-storage.ts' // where a cut-off send is kept
import { CartProvider } from '@/features/cart/CartProvider.tsx' // the cart the provider watches
import { OrderFormProvider } from './OrderFormProvider.tsx' // code under test
import { useOrderForm } from './use-order-form.ts' // reads the form

/**
 * Shows the form state as text and offers buttons to change it.
 * @return the values, the touched fields and the buttons
 */
function Probe() {
  const { values, touched, setField, touch, touchAll, reset, failure, setFailure, requestRef } = useOrderForm() // the form
  const [request, setRequest] = useState('not read') // the kept request id and contacts, read on demand
  return (
    <>
      <p data-testid="request">{request}</p>
      <button onClick={() => setRequest(JSON.stringify(requestRef.current))}>read request</button>
      <p data-testid="failure">{failure?.text ?? 'none'}</p>
      <button onClick={() => setFailure({ text: 'Not sent' })}>fail</button>
      <p data-testid="values">{JSON.stringify(values)}</p>
      <p data-testid="touched">{JSON.stringify(touched)}</p>
      <button onClick={() => setField('name', 'Jo')}>type name</button>
      <button onClick={() => touch('email')}>leave email</button>
      <button onClick={touchAll}>press send</button>
      <button onClick={reset}>reset</button>
    </>
  )
}

afterEach(() => {
  window.sessionStorage.clear() // no pending send left
  window.localStorage.clear() // no cart left
})

describe('OrderFormProvider', () => {
  it('keeps the pending send, refills the form and seeds the request id after a reload with a sent line lowered in the cart', () => {
    // catches: a lowered line dropping the request id, so a late first send meets a second id
    const contact = { name: 'Jo Tan', email: 'jc@mail.com', phone: '+60 12-345 6789' } // what the cut-off send carried
    window.sessionStorage.setItem(
      PENDING_SEND_STORAGE_KEY,
      JSON.stringify({ version: 2, pending: { requestId: 'req-1', lines: [['knot-tying', 3]], values: { ...contact, club: 'Eagles', otherClub: '' }, contacts: [contact] } }),
    ) // the cut-off send
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":1}}') // the line was lowered from 3
    render(
      <CartProvider honors={null}>
        <OrderFormProvider>
          <Probe />
        </OrderFormProvider>
      </CartProvider>,
    )
    expect(screen.getByTestId('values')).toHaveTextContent('"name":"Jo Tan"') // refilled
    fireEvent.click(screen.getByText('read request'))
    expect(screen.getByTestId('request')).toHaveTextContent('"requestId":"req-1"') // the id is kept
    expect(screen.getByTestId('request')).toHaveTextContent('"phone":"+60 12-345 6789"') // with its contact
    expect(window.sessionStorage.getItem(PENDING_SEND_STORAGE_KEY)).not.toBeNull() // still stored
  })

  it('reset empties every value and hides every error', () => {
    // catches: a sent order's name and email staying in the form for the next buyer on a shared computer
    render(
      <CartProvider honors={null}>
        <OrderFormProvider>
          <Probe />
        </OrderFormProvider>
      </CartProvider>,
    )
    fireEvent.click(screen.getByText('type name'))
    fireEvent.click(screen.getByText('press send'))
    expect(screen.getByTestId('values')).toHaveTextContent('"name":"Jo"')
    expect(screen.getByTestId('touched')).toHaveTextContent('"email":true')
    fireEvent.click(screen.getByText('reset'))
    expect(screen.getByTestId('values')).toHaveTextContent('{"name":"","email":"","phone":"","club":"","otherClub":""}')
    expect(screen.getByTestId('touched')).toHaveTextContent('{}')
  })

  it('reset clears the failure alert, as a new order starts', () => {
    // catches: the last order's "not sent" alert showing above the next order
    render(
      <CartProvider honors={null}>
        <OrderFormProvider>
          <Probe />
        </OrderFormProvider>
      </CartProvider>,
    )
    fireEvent.click(screen.getByText('fail'))
    expect(screen.getByTestId('failure')).toHaveTextContent('Not sent')
    fireEvent.click(screen.getByText('reset'))
    expect(screen.getByTestId('failure')).toHaveTextContent('none')
  })
})
