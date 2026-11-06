// Tests for the order form: errors once a field is left, Send order's looks and missing line, the Other field, the captcha, and sending with its failure, retry and success.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react' // render and query
import { useImperativeHandle, useState, type Ref } from 'react' // the stand-in captcha's reset handle
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import { CART_STORAGE_KEY } from '@/features/cart/cart-storage.ts' // the stored cart
import { CartProvider } from '@/features/cart/CartProvider.tsx' // the cart the form clears
import { useCart } from '@/features/cart/use-cart.ts' // reads the cart
import type { OrderLine } from '@/features/cart/cart.ts' // an order line
import type { Club } from '@/shared/data/types.ts' // the club shape
import { PILL_DOCK } from '@/shared/ui/floating-pill-box.ts' // the dock Send order floats in
import { OrderForm } from './OrderForm.tsx' // code under test
import type { OrderStockError } from './send-order.ts' // the refused lines' shape
import { OrderFormProvider } from './OrderFormProvider.tsx' // the form state
import { SENT_ORDER_STORAGE_KEY } from './sent-order-storage.ts' // where a sent order is kept

type StockLine = OrderStockError['lines'][number] // one refused line

const captcha = vi.hoisted(() => ({ reset: vi.fn() })) // counts resets, shared with the mock

// The real captcha loads Turnstile's script, which a test must not do; this stand-in ticks and expires on demand, and counts resets.
vi.mock('./Captcha.tsx', () => ({
  Captcha: ({ onToken, ref }: { onToken: (token: string | null) => void; ref?: Ref<{ reset: () => void }> }) => {
    useImperativeHandle(ref, () => ({ reset: captcha.reset }), []) // the form's handle
    return (
      <div>
        <button type="button" onClick={() => onToken('token-1')}>
          Solve captcha
        </button>
        <button type="button" onClick={() => onToken(null)}>
          Expire captcha
        </button>
        {/* The widget's frame, which takes focus after a reset. */}
        <iframe title="Captcha frame" />
      </div>
    )
  },
}))

beforeEach(() => {
  captcha.reset.mockClear() // no earlier resets
  lookupAnswers.length = 0 // no earlier lookup answers
})

afterEach(() => {
  vi.unstubAllGlobals() // fetch back
  vi.unstubAllEnvs() // the API address back
  vi.useRealTimers() // a fake clock must not leak
  vi.restoreAllMocks() // spies removed
  window.sessionStorage.clear() // no sent order left
  window.location.hash = '' // back to the catalogue address
})

const clubs: Club[] = [{ name: 'Eagles', area: null, language: null, location: null, churchName: null }] // one club

const item = { // one test item
  id: 'knot-tying',
  name: 'Knot Tying',
  category: 'Nature',
  stock: 10,
  price: 3,
  image: null,
} as const // one item at RM 3
const lines: OrderLine[] = [{ item, quantity: 3 }] // RM 9.00

/**
 * Shows the cart as text and offers the catalogue's edits a buyer can make while an order is sending.
 * @return the quantities and two buttons
 */
function CartProbe() {
  const { quantities, setQuantity } = useCart() // the cart
  return (
    <>
      <p data-testid="cart">{JSON.stringify(quantities)}</p>
      <button onClick={() => setQuantity('ants', 2)}>Add two Ants</button>
      <button onClick={() => setQuantity('knot-tying', 1)}>Lower Knot Tying to one</button>
      <button onClick={() => setQuantity('knot-tying', 5)}>Raise Knot Tying to five</button>
    </>
  )
}

/**
 * Renders the form inside its providers, over a stored cart of three Knot Tying.
 * @param clubList the clubs to offer
 */
function renderForm(
  clubList: Club[] = clubs,
  onStockRefused: (refused: StockLine[]) => void = () => {},
  cartQuantity = 3,
  orderLines: OrderLine[] = lines,
) {
  window.localStorage.setItem(CART_STORAGE_KEY, `{"version":1,"quantities":{"knot-tying":${cartQuantity}}}`) // the cart whose sent lines the form removes
  render(
    <CartProvider
      items={null} // the items, null while loading
    >
      <OrderFormProvider>
        <CartProbe />
        <OrderForm lines={orderLines} currency="MYR" clubs={clubList} onStockRefused={onStockRefused} />
      </OrderFormProvider>
    </CartProvider>,
  )
}

/** Fills every field validly. */
function fillValid() {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jo Tan' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jc@mail.com' } })
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+60 12-345 6789' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Club' }), { target: { value: 'Eagles' } })
}

describe('OrderForm', () => {
  it('marks every field required for screen readers while the form stays unvalidated by the browser', () => {
    // catches: a field read out as optional until an error shows, or native validation bubbles replacing the site's errors
    renderForm()
    fireEvent.change(screen.getByRole('combobox', { name: 'Club' }), { target: { value: 'other' } }) // reveals Club name
    for (const label of ['Name', 'Email', 'Phone', 'Club name']) {
      expect(screen.getByLabelText(label)).toBeRequired()
    }
    const club = screen.getByRole('combobox', { name: 'Club' })
    expect(club).toBeRequired()
    expect(club.closest('form')).toHaveAttribute('novalidate')
  })

  it('shows no error before a field is left and one after', () => {
    // catches: errors shouting at the buyer before they have typed
    renderForm()
    expect(screen.queryByText('Enter your name, up to 100 characters.')).not.toBeInTheDocument()
    fireEvent.blur(screen.getByLabelText('Name'))
    expect(screen.getByText('Enter your name, up to 100 characters.')).toBeInTheDocument()
  })

  it('shows the phone rule under the phone field once it is left', () => {
    // catches: a phone error that is missing or worded differently from the spec
    renderForm()
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '12345' } })
    fireEvent.blur(screen.getByLabelText('Phone'))
    expect(screen.getByText('Enter a phone number with 7 to 15 digits.')).toBeInTheDocument()
  })

  it('shows every error and focuses Name when Send order is pressed on an empty form', () => {
    // catches: a press that does nothing, or focus left on the button
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    expect(screen.getByText('Enter your name, up to 100 characters.')).toBeInTheDocument()
    expect(screen.getByText('Enter an email like name@example.com.')).toBeInTheDocument()
    expect(screen.getByText('Enter a phone number with 7 to 15 digits.')).toBeInTheDocument()
    expect(screen.getByText('Choose your club.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })

  it('stays aria-disabled, with the missing line, until the fields are valid and the captcha ticked', () => {
    // catches: a real disabled button that cannot say why, or one that looks ready too early
    renderForm()
    const send = screen.getByRole('button', { name: /^Send order/ })
    expect(send).toHaveAttribute('aria-disabled', 'true')
    expect(send).not.toBeDisabled()
    expect(
      screen.getByText('Fill in your name, email, phone and club and complete the captcha to send.'),
    ).toBeInTheDocument()
    fillValid()
    expect(send).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Complete the captcha to send.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    expect(send).toHaveAttribute('aria-disabled', 'false')
    expect(screen.queryByText(/to send\./)).not.toBeInTheDocument()
  })

  it('goes back to incomplete when the captcha expires', () => {
    // catches: an expired token still counted, so Send would go with a dead token
    renderForm()
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expire captcha' }))
    expect(screen.getByRole('button', { name: /^Send order/ })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Complete the captcha to send.')).toBeInTheDocument()
  })

  it('shows and focuses Club name for Other, and hides it again for a club', async () => {
    // catches: the Other field that never appears, appears unfocused or stays after a club is chosen
    renderForm()
    const select = screen.getByRole('combobox', { name: 'Club' })
    fireEvent.change(select, { target: { value: 'other' } })
    await waitFor(() => expect(screen.getByLabelText('Club name')).toHaveFocus())
    fireEvent.change(select, { target: { value: 'Eagles' } })
    expect(screen.queryByLabelText('Club name')).not.toBeInTheDocument()
  })

  it('shows no select and only Club name when there are no clubs', () => {
    // catches: a required dropdown with nothing to choose
    renderForm([])
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Club name')).toBeInTheDocument()
  })

  it('sets the field types and limits that give phones the right keyboard and browsers autofill', () => {
    // catches: a plain text email or phone field, or no length limit
    renderForm()
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Phone')).toHaveAttribute('type', 'tel')
    expect(screen.getByLabelText('Name')).toHaveAttribute('autocomplete', 'name')
    expect(screen.getByLabelText('Name')).toHaveAttribute('maxlength', '100')
    expect(screen.getByLabelText('Email')).toHaveAttribute('maxlength', '254')
  })

  it('focuses the missing line when only the captcha is missing', () => {
    // catches: a Send press with a valid form and no captcha that gives no feedback at all
    renderForm()
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    expect(screen.getByText('Complete the captcha to send.')).toHaveFocus()
  })
})

/**
 * Stubs fetch with answers handed out one per call.
 * @param answers what each call gives: a response, or a function that gives one later
 * @return the stub, to read its calls
 */
function stubFetch(...answers: Array<Response | (() => Promise<Response>)>) {
  const fetchFn = vi.fn<(url?: string, init?: RequestInit) => Promise<Response>>(async () => {
    const answer = answers.shift() ?? new Response('{}', { status: 500 }) // 500 when the test gave no more
    return typeof answer === 'function' ? answer() : answer
  })
  lookupFn.mockClear() // no earlier lookups
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => (String(url).includes('/orders/status/') ? lookupFn(url, init) : fetchFn(url, init)))
  return fetchFn
}

/** @return a lookup answer saying no order was saved under the id */
const notFound = () => new Response(JSON.stringify({ found: false }), { status: 200 })

/**
 * Makes the lookup answer found.
 * @param order fields to replace in the saved order
 * @return the response
 */
const found = (order: Record<string, unknown> = {}) => new Response(JSON.stringify({ found: true, order: { ...savedOrder, ...order } }), { status: 200 })

const lookupAnswers: Array<Response | (() => Promise<Response>)> = [] // what the next lookups give, one each; not found when empty
const lookupFn = vi.fn<(url?: string, init?: RequestInit) => Promise<Response>>(async () => {
  const answer = lookupAnswers.shift() ?? notFound() // not found unless the test said otherwise
  return typeof answer === 'function' ? answer() : answer
}) // the stand-in for GET /orders/status/<id>; its calls are the lookups

const savedOrder = {
  number: 'PF-20261102-4K7Q',
  createdAt: '2026-11-01T17:00:00.000Z',
  currency: 'MYR',
  totalCents: 900,
  club: 'Eagles',
  lines: [{ itemId: 'knot-tying', name: 'Knot Tying', quantity: 3, priceCents: 300 }],
} // what the Worker saved

/**
 * Makes the Worker's 201 for the saved order.
 * @param order fields to replace in the saved order
 * @return the response, flagged as this send's
 */
const sent = (order: Record<string, unknown> = {}) => new Response(JSON.stringify({ ...savedOrder, ...order, kept: 'this-send' }), { status: 201 })

/**
 * Makes the Worker's 200 for an order an earlier send saved.
 * @param order fields to replace in the saved order
 * @return the response, flagged as an earlier send's
 */
const earlier = (order: Record<string, unknown> = {}) => new Response(JSON.stringify({ ...savedOrder, ...order, kept: 'earlier-send' }), { status: 200 })

/**
 * Makes a refusal response from the Worker.
 * @param status the HTTP status
 * @param body the JSON body
 * @return the response
 */
const refused = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

/**
 * Reads the request id out of a call's body.
 * @param fetchFn the fetch stub
 * @param call the call index
 * @return the request id
 */
function requestOfCall(fetchFn: ReturnType<typeof stubFetch>, call: number): string {
  const body = JSON.parse((fetchFn.mock.calls[call] as unknown as [string, RequestInit])[1].body as string) as {
    requestId: string
  }
  return body.requestId // the UUID the Worker keys a repeat on
}

/** Fills the form validly, ticks the captcha and presses Send order. */
function fillTickAndSend() {
  fillValid()
  fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
  fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
}

/** Sends into a 500 and waits until the failure itself has put focus back on Send order, so a test acts only after that setup ran. */
async function failSend() {
  let answer: (response: Response) => void = () => {} // releases the held send
  const fetchFn = stubFetch(() => new Promise<Response>((resolve) => (answer = resolve))) // the send waits for the test
  const send = screen.getByRole('button', { name: /^Send order/ }) // found before it reads "Sending…"
  fillTickAndSend()
  await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1)) // the order is sending
  send.blur() // focus leaves Send order, so only the failure's own setup can bring it back
  answer(new Response('{}', { status: 500 })) // the send fails
  await screen.findByRole('alert') // the failure note is on screen
  await waitFor(() => expect(send).toHaveFocus()) // the failure's setup has run: focus back and the take-back armed
}

describe('OrderForm look', () => {
  it('draws the fields as 44 px pills with 16 px text and Send order as a full-width 52 px pill', () => {
    // catches: square fields and a rounded-rectangle Send order beside the pill search box and bars
    renderForm()
    for (const label of ['Name', 'Email', 'Phone']) {
      const field = screen.getByLabelText(label)
      expect(field).toHaveClass('rounded-pill', 'min-h-11', 'text-base')
    }
    expect(screen.getByRole('combobox', { name: 'Club' })).toHaveClass('rounded-pill', 'min-h-11')
    expect(screen.getByRole('button', { name: /^Send order/ })).toHaveClass('rounded-pill', 'h-13', 'w-full')
  })

  it('puts a field error as text under the field and not in the label', () => {
    // catches: red used as the only sign of an error, or an error away from its field
    renderForm()
    fireEvent.blur(screen.getByLabelText('Name'))
    const error = screen.getByText('Enter your name, up to 100 characters.')
    expect(error).toHaveClass('text-danger')
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-describedby', error.id)
    expect(screen.getByLabelText('Name').parentElement?.lastElementChild).toBe(error)
  })
})

describe('OrderForm sending', () => {
  it('on a failure keeps the cart and form, shows the alert, resets the captcha and keeps focus on Send', async () => {
    // catches: a failed send that empties the cart, loses the typing, reuses a spent captcha token or leaves focus nowhere
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderForm()
    await failSend() // focus back on Send order comes from the failure itself
    const alert = screen.getByRole('alert') // the failure note
    expect(alert).toHaveTextContent(
      'Your order was not sent. Check your connection, complete the captcha again and press Send order.',
    )
    expect(screen.getByTestId('cart')).toHaveTextContent('{"knot-tying":3}')
    expect(screen.getByLabelText('Name')).toHaveValue('Jo Tan')
    expect(captcha.reset).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /^Send order/ })).toHaveAttribute('aria-disabled', 'true') // token gone
    expect(screen.getByRole('button', { name: /^Send order/ })).toHaveFocus()
    expect(window.location.hash).toBe('')
  })

  it('takes focus back to Send order when the captcha widget grabs it just after a failure', async () => {
    // catches: the widget's reset moving focus into its frame a moment after the failure, so a keyboard buyer lands in the widget
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderForm()
    await failSend() // a failed send, its focus setup done
    screen.getByRole('button', { name: 'Solve captcha' }).focus() // the widget takes focus
    await waitFor(() => expect(screen.getByRole('button', { name: /^Send order/ })).toHaveFocus())
  })

  it('takes focus back to Send order when the captcha widget grabs it long after a failure', async () => {
    // catches: a refocus on a fixed timer, so a slow device's late grab leaves a keyboard buyer inside the widget
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderForm()
    await failSend() // a failed send, its focus setup done
    await new Promise((resolve) => setTimeout(resolve, 400)) // far past any fixed delay
    screen.getByRole('button', { name: 'Solve captcha' }).focus() // the widget takes focus late
    await waitFor(() => expect(screen.getByRole('button', { name: /^Send order/ })).toHaveFocus())
  })

  it('leaves focus in the captcha when the buyer moves there on purpose after a failure', async () => {
    // catches: a refocus that fights a keyboard buyer tabbing into the widget to tick it again
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderForm()
    await failSend() // a failed send, its focus setup done
    fireEvent.keyDown(screen.getByRole('button', { name: /^Send order/ }), { key: 'Tab' }) // the buyer tabs on
    const tick = screen.getByRole('button', { name: 'Solve captcha' })
    tick.focus() // and arrives in the widget
    expect(tick).toHaveFocus()
  })

  it('leaves focus in the captcha when the buyer taps it after a failure', async () => {
    // catches: a refocus that ignores a touch buyer's tap, so tapping the captcha to tick it again jumps back to Send order
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderForm()
    await failSend() // a failed send, its focus setup done
    const tick = screen.getByRole('button', { name: 'Solve captcha' })
    fireEvent.pointerDown(tick) // the buyer taps the widget
    tick.focus() // and focus arrives in it
    expect(tick).toHaveFocus() // not pulled to Send order
  })

  it('stops taking focus back once a second has passed, as a tap inside the captcha frame cannot be seen', async () => {
    // catches: a screen-reader tap on the captcha tick long after a failure being pulled back to Send order
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderForm()
    await failSend() // a failed send, its focus setup done
    await new Promise((resolve) => setTimeout(resolve, 1100)) // past the window for the widget's own grab
    const tick = screen.getByRole('button', { name: 'Solve captcha' })
    tick.focus() // the buyer's tap inside the frame
    expect(tick).toHaveFocus()
  })

  it('stops taking focus back once the captcha reports a token', async () => {
    // catches: a tick on the captcha followed by a stray focus event that jumps the buyer back to Send order
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderForm()
    await failSend() // a failed send, its focus setup done
    const tick = screen.getByRole('button', { name: 'Solve captcha' })
    fireEvent.click(tick) // the widget reports a token
    tick.focus()
    expect(tick).toHaveFocus()
  })

  it('takes focus back to Send order when the widget frame takes focus with only a window blur and no focus event on the page', async () => {
    // catches: the real browser's widget reset, which moves focus into its frame without a focusin reaching the form, leaving a keyboard buyer inside the widget after a failed send
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderForm()
    await failSend() // a failed send, its focus setup done
    screen.getByLabelText('Name').focus() // focus is away from Send order, as it is the instant the frame takes it
    const frame = screen.getByTitle('Captcha frame')
    const active = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(frame) // the page now reports the frame as focused
    act(() => void fireEvent.blur(window)) // the only event the page gets
    active.mockRestore() // the page's own focus tracking again
    await waitFor(() => expect(screen.getByRole('button', { name: /^Send order/ })).toHaveFocus())
  })

  it('leaves focus alone on a window blur that is not the captcha frame', async () => {
    // catches: a refocus on every window blur, so switching tabs right after a failure pulls the buyer to Send order
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderForm()
    await failSend() // a failed send, its focus setup done
    const name = screen.getByLabelText('Name')
    name.focus() // the buyer is in a field
    act(() => void fireEvent.blur(window)) // the window loses focus to another tab
    expect(name).toHaveFocus()
  })

  it('leaves focus where the buyer moved it when the widget frame takes focus after the buyer pressed a key', async () => {
    // catches: a window-blur hand-back that ignores the buyer's own key press, so tabbing into the widget to solve it again jumps back to Send order
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderForm()
    await failSend() // a failed send, its focus setup done
    fireEvent.keyDown(screen.getByRole('button', { name: /^Send order/ }), { key: 'Tab' }) // the buyer tabs on
    const name = screen.getByLabelText('Name')
    name.focus() // focus is away from Send order, where the buyer put it
    const frame = screen.getByTitle('Captcha frame')
    const active = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(frame) // the page now reports the frame as focused
    act(() => void fireEvent.blur(window)) // the only event the page gets
    active.mockRestore() // the page's own focus tracking again
    expect(name).toHaveFocus() // not pulled to Send order
  })

  it('logs an unexpected error by name and stack, never its message', async () => {
    // catches: a bug in the send that leaves only "unexpected" in the console, or a message that holds typed text
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      throw new RangeError('typed text Jo Tan') // a bug inside the send
    })
    renderForm()
    fillTickAndSend()
    await screen.findByRole('alert')
    const logged = JSON.stringify(error.mock.calls)
    expect(logged).toContain('RangeError')
    expect(logged).toContain('unexpected')
    expect(logged).not.toContain('typed text')
    expect(logged).not.toContain('Jo Tan')
  })

  it('does not say the order was not sent when work after a successful send throws', async () => {
    // catches: a sent order shown as failed, which the buyer would send again as a duplicate
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchFn = stubFetch(sent())
    const replace = vi.fn(() => {
      throw new Error('blocked') // the address cannot be replaced
    })
    vi.stubGlobal('location', { ...window.location, replace })
    renderForm()
    fillTickAndSend()
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(error).toHaveBeenCalled()) // the failure is logged, not swallowed
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(captcha.reset).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(/Order sent\. Your order number is PF-\d{8}-[A-Z0-9]{4}\./) // the buyer is told
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    expect(fetchFn).toHaveBeenCalledTimes(1) // and cannot send it twice
  })

  it('words a rate limit differently', async () => {
    // catches: a buyer told to check their connection when the Worker asked them to wait
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(new Response('{}', { status: 429 }))
    renderForm()
    fillTickAndSend()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many orders were sent just now. Wait a minute, complete the captcha again and press Send order.',
    )
  })

  it('words a failed captcha check differently', async () => {
    // catches: a buyer told to check their connection when Cloudflare refused the captcha
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(refused(403, { error: 'captcha' }))
    renderForm()
    fillTickAndSend()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "The captcha check didn't pass. Complete it again and press Send order.",
    )
  })

  it('hands a stock refusal to the screen, shows no failure note, and leaves the cart as it was', async () => {
    // catches: a refused order emptying the cart, a "check your connection" note for a stock problem, or the refused lines never reaching the shop's data
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(refused(409, { error: 'stock', lines: [{ itemId: 'knot-tying', stock: 1 }] }))
    const onStockRefused = vi.fn()
    renderForm(clubs, onStockRefused)
    fillTickAndSend()
    await waitFor(() => expect(onStockRefused).toHaveBeenCalledWith([{ itemId: 'knot-tying', stock: 1 }]))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('cart')).toHaveTextContent('{"knot-tying":3}')
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe('{"version":1,"quantities":{"knot-tying":3}}')
    expect(captcha.reset).toHaveBeenCalledTimes(1) // the spent token is dropped
  })

  it.each([
    ['an empty list', []],
    ['lines whose stock still covers the cart', [{ itemId: 'knot-tying', stock: 3 }]],
    ['lines for items not in the cart', [{ itemId: 'ants', stock: 0 }]],
  ])('shows the general failure note when a stock refusal names %s', async (_name, refusedLines) => {
    // catches: a 409 that leaves nothing to fix doing nothing visible on the details page
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(refused(409, { error: 'stock', lines: refusedLines }))
    const onStockRefused = vi.fn()
    renderForm(clubs, onStockRefused)
    fillTickAndSend()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your order was not sent. Check your connection, complete the captcha again and press Send order.',
    )
    expect(onStockRefused).not.toHaveBeenCalled() // nothing to patch, nothing to send the buyer to the cart for
  })

  it('sends the captcha token, the ids and quantities and the typed club, with a UUID request id', async () => {
    // catches: the token left out, prices sent from the browser, or a typed club sent as a listed one
    const fetchFn = stubFetch(sent())
    renderForm()
    fillValid()
    fireEvent.change(screen.getByRole('combobox', { name: 'Club' }), { target: { value: 'other' } })
    fireEvent.change(screen.getByLabelText('Club name'), { target: { value: 'Riverside' } })
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1))
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as Record<
      string,
      unknown
    >
    expect(body).toEqual({
      requestId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
      turnstileToken: 'token-1',
      name: 'Jo Tan',
      email: 'jc@mail.com',
      phone: '+60 12-345 6789',
      club: { name: 'Riverside', typed: true },
      lines: [{ itemId: 'knot-tying', quantity: 3 }],
    })
  })

  it('logs the failure kind and request id but never the buyer', async () => {
    // catches: a name, email or phone in the console (rule: ids and counts only)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchFn = stubFetch(new Response('{}', { status: 500 }))
    renderForm()
    fillTickAndSend()
    await screen.findByRole('alert')
    const logged = JSON.stringify(error.mock.calls)
    expect(logged).toContain('rejected')
    expect(logged).toContain(requestOfCall(fetchFn, 0)) // the request id says which send
    for (const secret of ['Jo Tan', 'jc@mail.com', '6789']) expect(logged).not.toContain(secret)
  })

  it('keeps the request id for a retry and after an edit', async () => {
    // catches: a retry or an edited resend that gives the Worker a second request id, so a late first send makes a second order
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let next = 0 // a counter that stands in for randomness
    vi.spyOn(crypto, 'randomUUID').mockImplementation(
      () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`,
    ) // every call differs
    const fetchFn = stubFetch(
      new Response('{}', { status: 500 }),
      new Response('{}', { status: 500 }),
      new Response('{}', { status: 500 }),
    )
    renderForm()
    fillTickAndSend()
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2))
    expect(requestOfCall(fetchFn, 1)).toBe(requestOfCall(fetchFn, 0))
    await screen.findByRole('alert')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jo Tan Jr' } })
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(3))
    expect(requestOfCall(fetchFn, 2)).toBe(requestOfCall(fetchFn, 0)) // still the first id: no answer has come back
  })

  it('sends once when Send order is pressed twice, and shows the sending state', async () => {
    // catches: a double press that posts the order twice
    let finish: (response: Response) => void = () => {}
    const fetchFn = stubFetch(() => new Promise<Response>((resolve) => (finish = resolve)))
    renderForm()
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    const send = screen.getByRole('button', { name: /^Send order/ })
    fireEvent.click(send)
    fireEvent.click(send)
    expect(send).toHaveTextContent('Sending…')
    expect(fetchFn).toHaveBeenCalledTimes(1)
    await act(async () => finish(sent()))
    expect(window.location.hash).toBe('#/order-sent')
  })

  it('keeps the send and its request id when the form is left and opened again mid-send', async () => {
    // catches: Back during "Sending…" unmounting the form, so a return shows a ready button and a second send goes out under a new request id
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let finish: (response: Response) => void = () => {}
    const fetchFn = stubFetch(
      () => new Promise<Response>((resolve) => (finish = resolve)),
      new Response('{}', { status: 500 }),
    )
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":3}}') // the stored cart
    /** @return the form behind a Leave button, so a test can unmount and remount it */
    const Screen = () => {
      const [shown, setShown] = useState(true) // the cart screen is showing
      return (
        <>
          <button onClick={() => setShown(!shown)}>Leave or return</button>
          {shown && <OrderForm lines={lines} currency="MYR" clubs={clubs} onStockRefused={() => {}} />}
        </>
      )
    }
    render(
      <CartProvider
        items={null} // the items, null while loading
      >
        <OrderFormProvider>
          <Screen />
        </OrderFormProvider>
      </CartProvider>,
    )
    fillTickAndSend()
    fireEvent.click(screen.getByText('Leave or return')) // browser Back
    fireEvent.click(screen.getByText('Leave or return')) // and forward to the cart again
    const send = screen.getByRole('button', { name: 'Sending…' }) // still in progress
    expect(send).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(send)
    expect(fetchFn).toHaveBeenCalledTimes(1) // no second send
    await act(async () => finish(new Response('{}', { status: 500 }))) // the first one fails while the form is back
    expect(await screen.findByRole('alert')).toHaveTextContent('Your order was not sent.')
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2))
    expect(requestOfCall(fetchFn, 1)).toBe(requestOfCall(fetchFn, 0)) // the retry reuses the request id
    expect(error).toHaveBeenCalledTimes(2) // the failed send, then the failed retry
  })

  it('on success empties the cart and the form, keeps the order for the confirmation and replaces the address', async () => {
    // catches: a cart that survives a sent order, an order the confirmation cannot find, or a Back button that leads to an empty cart
    stubFetch(sent())
    const historyLength = window.history.length
    renderForm()
    fillTickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    await waitFor(() => expect(screen.getByTestId('cart')).toHaveTextContent('{}')) // the cart's save runs after the render
    await waitFor(() => expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe('{"version":1,"quantities":{}}'))
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(window.history.length).toBe(historyLength) // replaced, not pushed
    const stored = JSON.parse(window.sessionStorage.getItem(SENT_ORDER_STORAGE_KEY) ?? '{}') as {
      order: { number: string; totalCents: number; sentAt: string; lines: Array<{ priceCents: number }> }
    }
    expect(stored.order.number).toBe('PF-20261102-4K7Q') // the Worker's number, not one made in the browser
    expect(stored.order.totalCents).toBe(900)
    expect(stored.order.sentAt).toBe('2026-11-01T17:00:00.000Z')
  })

  it("on success stores the Worker's prices and total, not the ones the shop showed", async () => {
    // catches: a confirmation that recomputes from the shop's catalogue after a price edit, showing a total the Worker did not save
    stubFetch(
      new Response(
        JSON.stringify({ ...savedOrder, totalCents: 1350, lines: [{ ...savedOrder.lines[0], priceCents: 450 }] }),
        { status: 201 },
      ),
    )
    renderForm() // the shop shows RM 3.00 a line
    fillTickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    const stored = JSON.parse(window.sessionStorage.getItem(SENT_ORDER_STORAGE_KEY) ?? '{}') as {
      order: { totalCents: number; lines: Array<{ priceCents: number }> }
    }
    expect(stored.order.totalCents).toBe(1350)
    expect(stored.order.lines[0].priceCents).toBe(450)
  })

  it('on success with sessionStorage refusing the write still replaces the address and clears the cart', async () => {
    // catches: a sent order shown as failed, or a cart left full, because the stored order could not be saved
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubFetch(sent())
    renderForm()
    const real = Storage.prototype.setItem // the working save
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (this === window.sessionStorage) throw new Error('blocked') // only the sent order's store refuses
      real.call(this, key, value) // the cart still saves
    })
    fillTickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    await waitFor(() => expect(screen.getByTestId('cart')).toHaveTextContent('{}'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('on success removes a line whose quantity was lowered below the sent amount during the send', async () => {
    // catches: a lowered line that survives a sent order as a negative or leftover quantity
    let finish: (response: Response) => void = () => {}
    stubFetch(() => new Promise<Response>((resolve) => (finish = resolve)))
    renderForm()
    fillTickAndSend()
    fireEvent.click(screen.getByText('Lower Knot Tying to one')) // from three sent to one during "Sending…"
    await act(async () => finish(sent()))
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    await waitFor(() => expect(screen.getByTestId('cart')).toHaveTextContent('{}'))
    await waitFor(() => expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe('{"version":1,"quantities":{}}'))
  })

  it('on success keeps an item the buyer added while the order was sending', async () => { // an item added mid-send stays in the cart
    // catches: a successful send that empties the whole cart, so an item added from the catalogue mid-send is lost unordered
    let finish: (response: Response) => void = () => {}
    stubFetch(() => new Promise<Response>((resolve) => (finish = resolve)))
    renderForm()
    fillTickAndSend()
    fireEvent.click(screen.getByText('Add two Ants')) // added from the catalogue during "Sending…"
    await act(async () => finish(sent()))
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    await waitFor(() => expect(screen.getByTestId('cart')).toHaveTextContent('{"ants":2}'))
    await waitFor(() =>
      expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe('{"version":1,"quantities":{"ants":2}}'),
    )
  })

  it('on success removes only the sent quantity of an item raised while the order was sending', async () => { // only the sent quantity leaves the cart
    // catches: a successful send that drops the extra two Knot Tying the buyer added mid-send
    let finish: (response: Response) => void = () => {}
    stubFetch(() => new Promise<Response>((resolve) => (finish = resolve)))
    renderForm()
    fillTickAndSend()
    fireEvent.click(screen.getByText('Raise Knot Tying to five')) // three were sent, two more added
    await act(async () => finish(sent()))
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    await waitFor(() => expect(screen.getByTestId('cart')).toHaveTextContent('{"knot-tying":2}'))
  })

  it('clears the failure alert once the cart changes', async () => {
    // catches: "Your order was not sent" showing above a changed cart the buyer has not sent yet
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(new Response('{}', { status: 500 }))
    renderForm()
    fillTickAndSend()
    await screen.findByRole('alert')
    fireEvent.click(screen.getByText('Add two Ants')) // a new order takes shape
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    ['a dropped connection', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a timeout', () => Promise.reject(new DOMException('timed out', 'TimeoutError'))],
    ['an HTTP 400', () => Promise.resolve(refused(400, { error: 'invalid' }))],
    ['a captcha refusal', () => Promise.resolve(refused(403, { error: 'captcha' }))],
    ['a 201 that is not an order', () => Promise.resolve(new Response('{"number":7}', { status: 201 }))],
    ['a rate limit', () => Promise.resolve(new Response('{}', { status: 429 }))],
    ['a page that is not JSON', () => Promise.resolve(new Response('<html>', { status: 502 }))],
  ])(
    'keeps the cart, the form and the sent-order store untouched after %s, and clears the captcha',
    async (_label, answer) => {
      // catches: any one failure kind that empties the cart, clears the typing, stores an order or keeps the spent token
      vi.spyOn(console, 'error').mockImplementation(() => {}) // the failure log
      stubFetch(answer as () => Promise<Response>) // the failing answer
      renderForm() // three Knot Tying in the cart
      fillTickAndSend() // press Send
      await screen.findByRole('alert') // the failure shows
      expect(screen.getByTestId('cart')).toHaveTextContent('{"knot-tying":3}') // cart kept
      expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe('{"version":1,"quantities":{"knot-tying":3}}') // stored cart kept
      expect(screen.getByLabelText('Email')).toHaveValue('jc@mail.com') // form kept
      expect(screen.getByLabelText('Phone')).toHaveValue('+60 12-345 6789') // form kept
      expect(screen.getByRole('combobox', { name: 'Club' })).toHaveValue('Eagles') // form kept
      expect(window.sessionStorage.getItem(SENT_ORDER_STORAGE_KEY)).toBeNull() // no confirmation for an unsent order
      expect(window.location.hash).toBe('') // still on the cart
      expect(captcha.reset).toHaveBeenCalledTimes(1) // the spent token is dropped
      expect(screen.getByRole('button', { name: /^Send order/ })).toHaveAttribute('aria-disabled', 'true') // needs a new tick
    },
  )

  it('keeps the request id across a rate-limited retry and then sends successfully under it', async () => {
    // catches: a retry after a 429 that gets a new request id, or a retry that cannot send once the captcha is solved again
    vi.spyOn(console, 'error').mockImplementation(() => {}) // the failure log
    const fetchFn = stubFetch(new Response('{}', { status: 429 }), sent()) // refused once, then accepted
    renderForm() // the cart
    fillTickAndSend() // first press
    await screen.findByRole('alert') // refused
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' })) // tick again
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ })) // retry
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent')) // accepted
    expect(requestOfCall(fetchFn, 1)).toBe(requestOfCall(fetchFn, 0)) // one request id
    const stored = JSON.parse(window.sessionStorage.getItem(SENT_ORDER_STORAGE_KEY) ?? '{}') as {
      order: { number: string }
    } // the confirmation's order
    expect(stored.order.number).toBe('PF-20261102-4K7Q') // the confirmation shows the Worker's number
  })

  it('keeps the request id when the club changes after a failure', async () => {
    // catches: a changed resend under a new id while the first send may still land, which makes a second order
    vi.spyOn(console, 'error').mockImplementation(() => {}) // the failure log
    const two: Club[] = [...clubs, { name: 'Falcons', area: null, language: null, location: null, churchName: null }] // a second club
    let next = 0 // stands in for randomness
    vi.spyOn(crypto, 'randomUUID').mockImplementation(
      () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`,
    ) // every call differs
    const fetchFn = stubFetch(new Response('{}', { status: 500 }), new Response('{}', { status: 500 })) // two failures
    renderForm(two) // two clubs
    fillTickAndSend() // first press
    await screen.findByRole('alert') // failed
    fireEvent.change(screen.getByRole('combobox', { name: 'Club' }), { target: { value: 'Falcons' } }) // another club
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' })) // tick
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ })) // press again
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2)) // sent again
    expect(requestOfCall(fetchFn, 1)).toBe(requestOfCall(fetchFn, 0)) // the same request id
  })

  it('keeps club detail fields out of the whole request body', async () => {
    // catches: area, language, location or church name leaking into the order request through the form
    const gilead: Club = {
      name: 'Gilead Pathfinder Club',
      area: 'Klang',
      language: 'Malay',
      location: 'Hall 3',
      churchName: 'Klang BM SDA Church',
    } // every detail set
    const fetchFn = stubFetch(sent()) // accepted
    renderForm([gilead]) // that club
    fillValid() // fills the Eagles value, so pick Gilead below
    fireEvent.change(screen.getByRole('combobox', { name: 'Club' }), { target: { value: 'Gilead Pathfinder Club' } }) // choose it
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' })) // tick
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ })) // send
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1)) // posted
    const body = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string // the JSON
    expect(body).toContain('Gilead Pathfinder Club') // the name is there
    for (const detail of ['Klang', 'Malay', 'Hall 3']) expect(body).not.toContain(detail) // no detail field, church name included
  })

  it('a double press while sending then a retry after failure sends exactly twice in total', async () => {
    // catches: the send guard never released after a failure, or released too early
    vi.spyOn(console, 'error').mockImplementation(() => {}) // the failure log
    let fail: (response: Response) => void = () => {} // ends the first send
    const fetchFn = stubFetch(() => new Promise<Response>((resolve) => (fail = resolve)), sent()) // slow failure, then success
    renderForm() // the cart
    fillValid() // the fields
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' })) // tick
    const send = screen.getByRole('button', { name: /^Send order/ }) // the button
    fireEvent.click(send) // first press
    fireEvent.click(send) // second press, ignored
    await act(async () => fail(new Response('{}', { status: 500 }))) // the first send fails
    await screen.findByRole('alert') // alert shown
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' })) // tick again
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ })) // retry
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent')) // sent
    expect(fetchFn).toHaveBeenCalledTimes(2) // one failed send and one retry, no extras
  })
})

/**
 * Finds the dock that holds an element.
 * @param element a node inside the dock
 * @return the nearest ancestor carrying every dock class, or null
 */
function dockOf(element: Element): Element | null {
  const names = PILL_DOCK.split(' ') // every class of the dock
  let node: Element | null = element.parentElement // start above the element
  while (node && !names.every((name) => node?.classList.contains(name))) node = node.parentElement // climb until all are found
  return node
}

describe('OrderForm floating pill', () => {
  const LINE = "No payment now. We'll contact you to confirm." // the line above the pill

  it('names the button with the total and hides the dot from readers', () => {
    // catches: a name that drops the total, or a dot read out as a word
    renderForm()
    const send = screen.getByRole('button', { name: 'Send order RM 9.00' })
    expect(within(send).getByText('·')).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps Send order a submit button inside the form, in the dock, after the no-payment line', () => {
    // catches: Send leaving the form, where Enter would no longer submit, or the line drawn below the pill
    renderForm()
    const send = screen.getByRole('button', { name: /^Send order/ })
    const form = send.closest('form') as HTMLFormElement
    expect(form).not.toBeNull()
    expect(send).toHaveAttribute('type', 'submit')
    const dock = dockOf(send)
    expect(dock).not.toBeNull()
    expect(form.contains(dock)).toBe(true)
    const line = screen.getByText(LINE)
    expect(dock?.contains(line)).toBe(true)
    expect(line.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy() // the line comes first
  })

  it('submits from the form, as Enter in a field does, and sends once', async () => {
    // catches: a form whose submit no longer reaches the send
    const fetchFn = stubFetch(sent())
    renderForm()
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    const form = screen.getByRole('button', { name: /^Send order/ }).closest('form') as HTMLFormElement
    act(() => form.requestSubmit()) // the path Enter takes
    act(() => form.requestSubmit()) // a double Enter
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('shows "Sending…" in the pill while it sends', async () => {
    // catches: a pill that keeps its label while the order is in flight
    let finish: (response: Response) => void = () => {}
    stubFetch(() => new Promise<Response>((resolve) => (finish = resolve)))
    renderForm()
    fillTickAndSend()
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeInTheDocument()
    await act(async () => finish(sent()))
  })

  it('puts the failure note in the dock above the line, with a Dismiss button, and keeps the missing line in the form', async () => {
    // catches: the alert left in the form flow where a scrolled-up buyer cannot see it, or the missing line floating
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(new Response('{}', { status: 500 }))
    renderForm()
    fillTickAndSend()
    const alert = await screen.findByRole('alert')
    const send = screen.getByRole('button', { name: /^Send order/ })
    const dock = dockOf(send)
    expect(dock?.contains(alert)).toBe(true)
    expect(alert.compareDocumentPosition(screen.getByText(LINE)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy() // note, then line, then pill
    expect(within(alert.parentElement as HTMLElement).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument() // the red x beside the text
    expect(send).toHaveFocus() // focus stays on Send
    const missing = screen.getByText('Complete the captcha to send.')
    expect(dock?.contains(missing)).toBe(false) // the missing line stays in the form
  })

  it('scrolls the captcha line clear of the failure note after a 429', async () => {
    // catches: the "Complete the captcha to send." line hidden under the failure note at 375 px
    const scrollIntoView = vi.fn() // jsdom has none
    Element.prototype.scrollIntoView = scrollIntoView // stands in for the scroll
    vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      stubFetch(new Response('{}', { status: 429 }))
      renderForm()
      fillTickAndSend()
      await screen.findByRole('alert')
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView // jsdom's prototype as it was, even when the test fails
    }
    expect(scrollIntoView.mock.contexts).toContain(screen.getByText('Complete the captcha to send.')) // that very line was scrolled to
  })

  it('keeps the failure note with no timer until Dismiss, and gives focus back to Send', async () => {
    // catches: a failure note that times out (WCAG 2.2.1 for a message the buyer must act on), or focus lost when it closes
    vi.useFakeTimers({ shouldAdvanceTime: true }) // real time still flows for the async send
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(new Response('{}', { status: 500 }))
    renderForm()
    fillTickAndSend()
    await screen.findByRole('alert')
    act(() => void vi.advanceTimersByTime(120000)) // two minutes
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Send order/ })).toHaveFocus()
  })

  it('removes the failure note when the next send starts', async () => {
    // catches: a stale failure showing over a retry in flight
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let finish: (response: Response) => void = () => {}
    stubFetch(new Response('{}', { status: 500 }), () => new Promise<Response>((resolve) => (finish = resolve)))
    renderForm()
    fillTickAndSend()
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await act(async () => finish(sent()))
  })
})

describe('OrderForm send interruptions', () => {
  it('after a network drop mid-send frees Send, keeps the form, shows one alert and focuses Send', async () => {
    // catches: a drop after the request left that leaves "Sending…" stuck, loses the typing or sends a second request
    vi.spyOn(console, 'error').mockImplementation(() => {}) // the failure log
    let drop: (error: Error) => void = () => {} // drops the connection
    const fetchFn = stubFetch(() => new Promise<Response>((_resolve, reject) => (drop = reject))) // in flight
    renderForm()
    fillTickAndSend()
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeInTheDocument() // in flight
    await act(async () => drop(new TypeError('Failed to fetch'))) // the connection drops
    expect(await screen.findByRole('alert')).toHaveTextContent('Your order was not sent') // told
    const send = screen.getByRole('button', { name: /^Send order/ }) // named again, not "Sending…"
    expect(send).toHaveFocus() // ready for the retry
    expect(screen.getByLabelText('Name')).toHaveValue('Jo Tan') // typing kept
    fireEvent.click(send) // a retry before ticking again
    expect(fetchFn).toHaveBeenCalledTimes(1) // the spent token cannot send again
  })

  it('shows one failure note after two failures, and shows it again after a dismissal and a third', async () => {
    // catches: notes that stack up, or a dismissal that stays remembered so the next failure is silent
    vi.spyOn(console, 'error').mockImplementation(() => {}) // the failure log
    stubFetch(new Response('{}', { status: 500 }), new Response('{}', { status: 500 }), new Response('{}', { status: 500 })) // three failures
    renderForm()
    fillTickAndSend() // first failure
    await screen.findByRole('alert') // shown
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' })) // a fresh token
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ })) // second failure
    await waitFor(() => expect(captcha.reset).toHaveBeenCalledTimes(2)) // the second send finished
    expect(screen.getAllByRole('alert')).toHaveLength(1) // one note, not two
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' })) // closed
    expect(screen.queryByRole('alert')).not.toBeInTheDocument() // gone
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' })) // a fresh token
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ })) // third failure
    expect(await screen.findByRole('alert')).toBeInTheDocument() // shown again
  })

  it('keeps the failure note while the buyer edits a field and ticks the captcha, until the next send', async () => {
    // catches: a note that vanishes on typing or on the new tick, before the buyer has pressed Send again
    vi.spyOn(console, 'error').mockImplementation(() => {}) // the failure log
    stubFetch(new Response('{}', { status: 500 })) // one failure
    renderForm()
    fillTickAndSend()
    await screen.findByRole('alert') // shown
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jo Tan Jr' } }) // an edit
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' })) // a new token
    expect(screen.getByRole('alert')).toBeInTheDocument() // still there
  })

  it('puts the rate-limit note in the dock too, with its Dismiss button', async () => {
    // catches: the 429 wording drawn outside the dock, away from Send
    vi.spyOn(console, 'error').mockImplementation(() => {}) // the failure log
    stubFetch(new Response('{}', { status: 429 })) // rate limited
    renderForm()
    fillTickAndSend()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Too many orders') // the 429 wording
    const dock = dockOf(screen.getByRole('button', { name: /^Send order/ })) // Send's dock
    expect(dock?.contains(alert)).toBe(true) // in the dock
    expect(within(dock as HTMLElement).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument() // closable
  })

  it('sends once when a click and a form submit overlap, and does nothing for a submit with the captcha unticked', async () => {
    // catches: the click path and the Enter path guarding separately, so the two together post twice
    let finish: (response: Response) => void = () => {} // answers the send
    const fetchFn = stubFetch(() => new Promise<Response>((resolve) => (finish = resolve))) // pending
    renderForm()
    fillValid()
    const form = screen.getByRole('button', { name: /^Send order/ }).closest('form') as HTMLFormElement // the form
    act(() => form.requestSubmit()) // Enter with the captcha unticked
    expect(fetchFn).not.toHaveBeenCalled() // nothing sent
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' })) // ticked
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ })) // the click
    act(() => form.requestSubmit()) // an Enter while it sends
    expect(fetchFn).toHaveBeenCalledTimes(1) // one request
    await act(async () => finish(sent())) // done
  })

  it('keeps the buyer out of every console channel and the address on a network drop whose error text holds the email', async () => {
    // catches: a fetch error message, the form values or the order echoed to the console or into the URL
    const channels = (['error', 'warn', 'info', 'log', 'debug'] as const).map((name) =>
      vi.spyOn(console, name).mockImplementation(() => {}),
    ) // every console method
    const fetchFn = stubFetch(() => Promise.reject(new TypeError('Failed to fetch https://x/?email=jc@mail.com Jo Tan 6789'))) // a message that holds the buyer
    renderForm()
    fillTickAndSend()
    await screen.findByRole('alert')
    const logged = JSON.stringify(channels.map((spy) => spy.mock.calls)) // all console output
    for (const secret of ['Jo Tan', 'jc@mail.com', '6789', 'Eagles']) {
      expect(logged).not.toContain(secret) // no buyer data logged
      expect(window.location.href).not.toContain(secret) // none in the URL
    }
    expect(fetchFn.mock.calls[0]).toBeDefined() // the send did go out
    expect(new URL(window.location.href).search).toBe('') // no query string
    const note = screen.getByRole('alert').textContent ?? '' // the shown text
    for (const secret of ['Jo Tan', 'jc@mail.com', '6789']) expect(note).not.toContain(secret) // none in the note
  })

  it('posts to the bare orders address, with no query string, and leaves the buyer out of the address after success', async () => {
    // catches: buyer data moved into the request URL or the confirmation address
    vi.stubEnv('VITE_API_URL', '/api') // the dev proxy's address
    const fetchFn = stubFetch(sent()) // accepted
    renderForm()
    fillTickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent')) // confirmation
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe('/api/orders') // no query
    expect(window.location.href).not.toMatch(/Jo|jc@|6789|Eagles/) // nothing in the address
  })
})

const PENDING_KEY = 'pem-pf-store:pending-send' // where the send in flight is kept

describe('OrderForm reload mid-send', () => {
  /** Starts a send that never answers, then drops the page the way a reload does. */
  async function sendThenReload() {
    const held = stubFetch(() => new Promise<Response>(() => {})) // the answer never comes
    renderForm()
    fillTickAndSend()
    await waitFor(() => expect(held).toHaveBeenCalledTimes(1)) // the order left
    const firstId = requestOfCall(held, 0) // the id the Worker saved it under
    cleanup() // the page goes: memory is lost, sessionStorage stays
    return { firstId } // the id to compare with
  }

  it('refills the form and reuses the request id when Send is pressed again after a reload', async () => {
    // catches: a reload mid-send that forgets the request id, so a second Send saves a second order
    const { firstId } = await sendThenReload()
    const fetchFn = stubFetch(sent()) // the Worker answers with the saved order
    renderForm() // the reloaded page
    expect(screen.getByLabelText('Name')).toHaveValue('Jo Tan') // refilled
    expect(screen.getByLabelText('Email')).toHaveValue('jc@mail.com') // refilled
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' })) // a fresh token
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1))
    expect(requestOfCall(fetchFn, 0)).toBe(firstId) // the same order
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
  })

  it('needs a fresh captcha token after the reload before it sends', async () => {
    // catches: a stored token or a send without the captcha after a reload
    await sendThenReload()
    const fetchFn = stubFetch(sent())
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ })) // no token yet
    expect(fetchFn).not.toHaveBeenCalled() // nothing sent
  })

  it('keeps the request id when a form field is changed after the reload', async () => {
    // catches: a changed order under a new id after a reload, while the cut-off send may still land
    const { firstId } = await sendThenReload()
    const fetchFn = stubFetch(sent())
    renderForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jo Tan Jr' } }) // an edit
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1))
    expect(lookupFn).toHaveBeenCalledTimes(1) // the kept id is looked up first
    expect(requestOfCall(fetchFn, 0)).toBe(firstId) // the same order id
  })

  it('keeps the pending send, refills the form and reuses the request id when the cart changed before the reload came back', async () => {
    // catches: a sent line lowered before the reload dropping the request id, so a late first send meets a second id
    const { firstId } = await sendThenReload()
    const fetchFn = stubFetch(sent())
    renderForm(clubs, () => {}, 2) // the cart now holds two
    expect(screen.getByLabelText('Name')).toHaveValue('Jo Tan') // refilled
    expect(window.sessionStorage.getItem(PENDING_KEY)).not.toBeNull() // kept
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1))
    expect(lookupFn).toHaveBeenCalledTimes(1) // looked up first
    expect(requestOfCall(fetchFn, 0)).toBe(firstId) // the same id
  })

  it('keeps the pending send while the answer is awaited and clears it once the order is stored', async () => {
    // catches: a pending send that stays after success, so the next order reuses a spent id; or one never kept
    let finish: (response: Response) => void = () => {}
    stubFetch(() => new Promise<Response>((resolve) => (finish = resolve)))
    renderForm()
    fillTickAndSend()
    await waitFor(() => expect(window.sessionStorage.getItem(PENDING_KEY)).not.toBeNull()) // kept while in flight
    await act(async () => finish(sent()))
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(window.sessionStorage.getItem(SENT_ORDER_STORAGE_KEY)).not.toBeNull() // the order is stored
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull() // and the pending send is gone
  })

  it.each(['not json', '{"version":1,"requestId":5}', '{"version":2,"requestId":"x","lines":[],"values":{}}', 'null'])(
    'ignores and removes a stored pending send that is malformed or foreign (%s)',
    (stored) => {
      // catches: a bad stored value that crashes the form, fills it with junk or stays forever
      window.sessionStorage.setItem(PENDING_KEY, stored)
      renderForm()
      expect(screen.getByLabelText('Name')).toHaveValue('') // not refilled
      expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull() // removed
    },
  )

  const GOOD_VALUES = { name: 'Jo', email: 'j@x.co', phone: '1', club: 'Eagles', otherClub: '' } // a whole form part

  it.each([
    ['a wrapper that is not an object', '5'],
    ['a bad request id', JSON.stringify({ version: 1, pending: { requestId: 5, lines: [['a', 1]], values: GOOD_VALUES } })],
    ['an empty request id', JSON.stringify({ version: 1, pending: { requestId: '', lines: [['a', 1]], values: GOOD_VALUES } })],
    ['a bad line', JSON.stringify({ version: 1, pending: { requestId: 'x', lines: [['a', 1.5]], values: GOOD_VALUES } })],
    ['an empty list of lines', JSON.stringify({ version: 1, pending: { requestId: 'x', lines: [], values: GOOD_VALUES } })],
    [
      'a bad form field',
      JSON.stringify({ version: 1, pending: { requestId: 'x', lines: [['a', 1]], values: { ...GOOD_VALUES, phone: 7 } } }),
    ],
    ['no form part', JSON.stringify({ version: 1, pending: { requestId: 'x', lines: [['a', 1]], values: null } })],
  ])('removes a stored pending send with %s that passes the wrapper', (_name, stored) => {
    // catches: a half-valid stored send that is read, refills the form with junk or stays forever
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.sessionStorage.setItem(PENDING_KEY, stored)
    renderForm()
    expect(screen.getByLabelText('Name')).toHaveValue('') // not refilled
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull() // removed
  })

  it.each([
    ['a captcha refusal', () => refused(403, { error: 'captcha' })],
    ['a rate limit', () => new Response('{}', { status: 429 })],
    ['a rejection', () => new Response('{}', { status: 500 })],
    [
      'a stock refusal that patches the cart',
      () => refused(409, { error: 'stock', lines: [{ itemId: 'knot-tying', stock: 1 }] }),
    ],
    ['a stock refusal with nothing to patch', () => refused(409, { error: 'stock', lines: [] })],
  ])('keeps the pending send after %s', async (_name, answer) => {
    // catches: a refusal that drops the id while an earlier send may still land, so the next Send makes a second order
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(answer())
    renderForm()
    fillTickAndSend()
    await waitFor(() => expect(captcha.reset).toHaveBeenCalledTimes(1)) // the answer came
    expect(window.sessionStorage.getItem(PENDING_KEY)).not.toBeNull() // kept until an order comes back
  })

  it.each([
    ['a dropped connection', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a timeout', () => Promise.reject(new DOMException('timed out', 'TimeoutError'))],
  ])('keeps the pending send after %s', async (_name, answer) => {
    // catches: a pending send cleared when the outcome is unknown, so a reload makes a second order
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(answer)
    renderForm()
    fillTickAndSend()
    await waitFor(() => expect(captcha.reset).toHaveBeenCalledTimes(1)) // the failure came
    expect(window.sessionStorage.getItem(PENDING_KEY)).not.toBeNull() // kept
  })

  it('renders and still sends when reading window.sessionStorage itself throws', async () => {
    // catches: blocked site data that throws at App start because the storage object is read outside the try
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const realStorage = Object.getOwnPropertyDescriptor(window, 'sessionStorage') as PropertyDescriptor // to put back
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('blocked', 'SecurityError') // what blocked site data does
      },
    })
    try {
      const fetchFn = stubFetch(sent())
      renderForm()
      fillTickAndSend()
      await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1)) // sent regardless
    } finally {
      Object.defineProperty(window, 'sessionStorage', realStorage) // working storage again
    }
  })

  it('still sends when sessionStorage throws', async () => {
    // catches: blocked storage that stops an order from being sent
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const realGet = Storage.prototype.getItem // the working read, for the cart
    const realSet = Storage.prototype.setItem // the working save, for the cart
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      if (this === window.sessionStorage) throw new Error('blocked')
      return realGet.call(this, key)
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (this === window.sessionStorage) throw new Error('blocked')
      realSet.call(this, key, value)
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage) {
      if (this === window.sessionStorage) throw new Error('blocked')
    })
    const fetchFn = stubFetch(sent())
    renderForm()
    fillTickAndSend()
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1)) // sent regardless
  })
})

describe('OrderForm lookup after a lost send', () => {
  const two: Club[] = [...clubs, { name: 'Falcons', area: null, language: null, location: null, churchName: null }] // a second club to change to
  const drop = () => Promise.reject(new TypeError('Failed to fetch')) // a send that gets no answer

  /** @return the sent order the confirmation page will read */
  function storedOrder() {
    return (JSON.parse(window.sessionStorage.getItem(SENT_ORDER_STORAGE_KEY) ?? 'null') as {
      order: { number: string; club: { subject: string }; contact: { name: string; phone: string } | null; changesNotSent: boolean }
    } | null)?.order
  }

  /** Ticks the captcha and presses Send order. */
  function tickAndSend() {
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
  }

  /**
   * Picks another club.
   * @param name the club's name
   */
  function pickClub(name: string) {
    fireEvent.change(screen.getByRole('combobox', { name: 'Club' }), { target: { value: name } }) // the change
  }

  /**
   * Sends into a dropped connection and waits for the failure note.
   * @param answers what the next POSTs give after the drop
   * @return the fetch stub
   */
  async function sendThenDrop(...answers: Array<Response | (() => Promise<Response>)>) {
    vi.spyOn(console, 'error').mockImplementation(() => {}) // the failure log
    const fetchFn = stubFetch(drop, ...answers) // a drop, then the rest
    renderForm(two)
    fillTickAndSend()
    await screen.findByRole('alert') // no answer came
    return fetchFn
  }

  it('makes no lookup for a first send', async () => {
    // catches: an extra GET on every ordinary send
    stubFetch(sent())
    renderForm()
    fillTickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(lookupFn).not.toHaveBeenCalled() // no lookup
  })

  it('looks up once after a drop and, when the order is found, sends nothing and shows the plain confirmation', async () => {
    // catches: an unchanged resend that posts again, or a found order shown with a note or left in the cart
    lookupAnswers.push(found())
    const fetchFn = await sendThenDrop()
    tickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(lookupFn).toHaveBeenCalledTimes(1) // one GET
    expect(fetchFn).toHaveBeenCalledTimes(1) // only the dropped POST
    expect(storedOrder()).toMatchObject({ number: 'PF-20261102-4K7Q', changesNotSent: false }) // plain
    expect(screen.getByTestId('cart')).toHaveTextContent('{}') // the order's lines left the cart
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull() // spent
  })

  it("shows the Worker's club and lines with the note, and posts nothing, when a changed resend finds the order", async () => {
    // catches: a confirmation for content that was never saved
    lookupAnswers.push(found({ club: 'Eagles' }))
    const fetchFn = await sendThenDrop()
    pickClub('Falcons') // a changed order
    tickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(fetchFn).toHaveBeenCalledTimes(1) // no second POST
    expect(storedOrder()).toMatchObject({ club: { subject: 'Eagles' }, changesNotSent: true }) // the first club
  })

  it('posts the changed body under the same id when nothing was found, and shows the plain page for this send', async () => {
    // catches: a not-found lookup that makes a new id, or a this-send page that shows the old club
    const fetchFn = await sendThenDrop(sent({ club: 'Falcons' }))
    pickClub('Falcons')
    tickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(requestOfCall(fetchFn, 1)).toBe(requestOfCall(fetchFn, 0)) // one id
    expect(JSON.parse((fetchFn.mock.calls[1] as unknown as [string, RequestInit])[1].body as string).club).toEqual({ name: 'Falcons', typed: false }) // the changed body
    expect(storedOrder()).toMatchObject({ club: { subject: 'Falcons' }, changesNotSent: false }) // plain
  })

  it('shows the earlier order with the note when the first send landed between the lookup and the resend', async () => {
    // catches: a confirmation for the changed lines when the Worker kept the earlier send's
    await sendThenDrop(earlier({ club: 'Eagles', lines: [{ itemId: 'knot-tying', name: 'Knot Tying', quantity: 3, priceCents: 300 }] }))
    pickClub('Falcons')
    tickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(storedOrder()).toMatchObject({ club: { subject: 'Eagles' }, changesNotSent: true }) // the earlier order, flagged
  })

  it("removes only the earlier order's lines from the cart", async () => {
    // catches: the changed cart's quantities removed for an order that holds fewer
    vi.spyOn(console, 'error').mockImplementation(() => {}) // the failure log
    stubFetch(drop, earlier()) // a drop, then the earlier order
    renderForm(clubs, () => {}, 5, [{ item, quantity: 5 }]) // five in the cart and in the order
    fillTickAndSend()
    await screen.findByRole('alert')
    tickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(screen.getByTestId('cart')).toHaveTextContent('{"knot-tying":2}') // 5 - the 3 the earlier order holds
    expect(storedOrder()?.changesNotSent).toBe(true) // five differs from three
  })

  it.each([
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a timeout', () => Promise.reject(new DOMException('timed out', 'TimeoutError'))],
    ['a 500', () => Promise.resolve(new Response('{}', { status: 500 }))],
    ['a 404 (the route is not deployed yet)', () => Promise.resolve(new Response('{}', { status: 404 }))],
  ])('goes on to post under the same id when the lookup fails with %s, with no dialog', async (_name, answer) => {
    // catches: a failed lookup that blocks the resend, asks the buyer, or makes a second id
    lookupAnswers.push(answer)
    const fetchFn = await sendThenDrop(sent())
    pickClub('Falcons')
    tickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // no notice
    expect(requestOfCall(fetchFn, 1)).toBe(requestOfCall(fetchFn, 0)) // one id
  })

  it('keeps the pending send and the id when the lookup and the POST both fail, and looks up again on the next Send', async () => {
    // catches: a double failure that drops the id, so the next Send makes a second order
    const fetchFn = await sendThenDrop(drop, sent())
    lookupAnswers.push(() => Promise.reject(new TypeError('Failed to fetch'))) // the lookup fails too
    tickAndSend()
    await waitFor(() => expect(captcha.reset).toHaveBeenCalledTimes(2)) // failed again
    expect(window.sessionStorage.getItem(PENDING_KEY)).not.toBeNull() // kept
    tickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(lookupFn).toHaveBeenCalledTimes(2) // looked up again
    expect(requestOfCall(fetchFn, 2)).toBe(requestOfCall(fetchFn, 0)) // one id
  })

  it.each([
    ['a stock refusal', () => refused(409, { error: 'stock', lines: [{ itemId: 'knot-tying', stock: 1 }] })],
    ['a failed captcha', () => refused(403, { error: 'captcha' })],
    ['a 400', () => refused(400, { error: 'invalid' })],
    ['a rate limit', () => new Response('{}', { status: 429 })],
  ])('keeps the id after %s on a resend, and the next Send looks up first', async (_name, answer) => {
    // catches: a refusal that drops the id while the first send may still land
    const fetchFn = await sendThenDrop(answer(), sent())
    tickAndSend()
    await waitFor(() => expect(captcha.reset).toHaveBeenCalledTimes(2)) // the refusal came
    expect(window.sessionStorage.getItem(PENDING_KEY)).not.toBeNull() // kept
    await waitFor(() => expect(screen.getByRole('button', { name: 'Solve captcha' })).toBeInTheDocument())
    tickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(lookupFn).toHaveBeenCalledTimes(2) // looked up before each reuse
    expect(requestOfCall(fetchFn, 2)).toBe(requestOfCall(fetchFn, 0)) // one id
  })

  it('does one lookup and at most one POST for a double click during the lookup', async () => {
    // catches: a double click that makes two lookups or two POSTs
    let release: (response: Response) => void = () => {} // ends the lookup
    const fetchFn = await sendThenDrop(sent())
    lookupAnswers.push(() => new Promise<Response>((resolve) => (release = resolve)))
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    const send = screen.getByRole('button', { name: /^Send order/ })
    fireEvent.click(send)
    fireEvent.click(send)
    expect(lookupFn).toHaveBeenCalledTimes(1) // one GET
    await act(async () => release(notFound()))
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(fetchFn).toHaveBeenCalledTimes(2) // the drop and one resend
  })

  it('keeps the pending send over a reload during the lookup, and the next Send looks up', async () => {
    // catches: a reload mid-lookup that forgets the id
    const fetchFn = await sendThenDrop(sent())
    const firstId = requestOfCall(fetchFn, 0)
    lookupAnswers.push(() => new Promise<Response>(() => {})) // the lookup never answers
    tickAndSend()
    await waitFor(() => expect(lookupFn).toHaveBeenCalledTimes(1))
    cleanup() // the reload
    expect(window.sessionStorage.getItem(PENDING_KEY)).not.toBeNull() // still there
    renderForm(two)
    expect(screen.getByLabelText('Name')).toHaveValue('Jo Tan') // refilled
    tickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(lookupFn).toHaveBeenCalledTimes(2) // looked up again
    expect(requestOfCall(fetchFn, 1)).toBe(firstId) // the same id
  })

  it('shows no contact when the phone changed between two unanswered sends and the earlier order is found', async () => {
    // catches: a phone number shown that the saved order may not hold
    await sendThenDrop(drop)
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+60 11-000 0000' } })
    tickAndSend() // lookup says not found, the POST drops with the second phone
    await waitFor(() => expect(captcha.reset).toHaveBeenCalledTimes(2))
    lookupAnswers.push(found())
    tickAndSend() // now the first send turns up
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(storedOrder()).toMatchObject({ contact: null, changesNotSent: true }) // no contact, note shown
  })

  it('shows the sent contact with the note when the phone was changed but never sent', async () => {
    // catches: the unsent phone shown as the order's
    lookupAnswers.push(found())
    await sendThenDrop()
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+60 11-000 0000' } })
    tickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(storedOrder()).toMatchObject({ contact: { phone: '+60 12-345 6789' }, changesNotSent: true })
  })

  it('gives the next order a new id and makes no lookup after a success', async () => {
    // catches: an id that outlives its order, so the next order is looked up and shown as the old one
    let next = 0 // stands in for randomness
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`) // every call differs
    const fetchFn = stubFetch(sent(), sent())
    renderForm(two)
    fillTickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    fillValid()
    tickAndSend()
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2))
    expect(lookupFn).not.toHaveBeenCalled() // no lookup
    expect(requestOfCall(fetchFn, 1)).not.toBe(requestOfCall(fetchFn, 0)) // a new id
  })

  it('keeps one id across a change when sessionStorage is blocked', async () => {
    // catches: an id that lives only in storage, so blocked storage makes a second id
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const realGet = Storage.prototype.getItem // the working read, for the cart
    const realSet = Storage.prototype.setItem // the working save, for the cart
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      if (this === window.sessionStorage) throw new Error('blocked')
      return realGet.call(this, key)
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (this === window.sessionStorage) throw new Error('blocked')
      realSet.call(this, key, value)
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage) {
      if (this === window.sessionStorage) throw new Error('blocked')
    })
    const fetchFn = await sendThenDrop(sent())
    pickClub('Falcons')
    tickAndSend()
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2))
    expect(requestOfCall(fetchFn, 1)).toBe(requestOfCall(fetchFn, 0)) // one id
  })

  it('puts no buyer data in any console call or address on the lookup paths', async () => {
    // catches: a name, email or phone in a log or in the lookup address
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    lookupAnswers.push(() => Promise.reject(new TypeError('Failed to fetch for jc@mail.com')))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch(drop, sent())
    renderForm(two)
    fillTickAndSend()
    await screen.findByRole('alert')
    tickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    const printed = JSON.stringify([...warn.mock.calls, ...log.mock.calls, ...error.mock.calls]) // everything printed
    const addresses = JSON.stringify(lookupFn.mock.calls.map((call) => call[0])) // every lookup address
    for (const secret of ['Jo Tan', 'jc@mail.com', '6789']) {
      expect(printed).not.toContain(secret)
      expect(addresses).not.toContain(secret)
    }
  })

  it('does one lookup and one POST for presses made while the resend POST is still out', async () => {
    // catches: Send freed after the lookup, so a press during the POST starts a second send
    let release: (response: Response) => void = () => {} // ends the resend POST
    const fetchFn = await sendThenDrop(() => new Promise<Response>((resolve) => (release = resolve))) // the drop, then a held POST
    tickAndSend() // lookup says not found, the POST goes out and waits
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2)) // the held POST is out
    const send = screen.getByRole('button', { name: /^Sending/ }) // the pill reads Sending… while the POST is out
    fireEvent.click(send) // a second press
    fireEvent.click(send) // and a third
    expect(lookupFn).toHaveBeenCalledTimes(1) // no second GET
    expect(fetchFn).toHaveBeenCalledTimes(2) // no second POST
    await act(async () => release(sent()))
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(fetchFn).toHaveBeenCalledTimes(2) // still the drop and one resend
  })

  it.each([
    ['a changed phone shows no contact and the note', '+60 11-000 0000', null, true],
    ['an unchanged resend shows the sent contact and no note', '+60 12-345 6789', { phone: '+60 12-345 6789' }, false],
  ])('reads an old Worker (no lookup route, no kept, no club) on a resend: %s', async (_name, phone, contact, note) => {
    // catches: a bare 200 taken as this send, which would show a phone the saved order may not hold
    const bare: Record<string, unknown> = { ...savedOrder } // the old reply: five fields
    delete bare.club // no club
    lookupAnswers.push(new Response('{"error":"not-found"}', { status: 404 })) // the route is not deployed
    const fetchFn = await sendThenDrop(new Response(JSON.stringify(bare), { status: 200 })) // a drop, then the old Worker's repeat answer
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: phone } })
    tickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(requestOfCall(fetchFn, 1)).toBe(requestOfCall(fetchFn, 0)) // one id
    expect(storedOrder()).toMatchObject({ contact, changesNotSent: note, club: { subject: 'Eagles' } }) // the form's club stands in
  })

  it.each([
    ['a 403 (the shop is the same origin and sends no Origin)', () => Promise.resolve(new Response('{"error":"forbidden-origin"}', { status: 403 }))],
    ['a 429', () => Promise.resolve(new Response('{"error":"rate-limited"}', { status: 429 }))],
    ['a found order with no club', () => Promise.resolve(new Response(JSON.stringify({ found: true, order: { ...savedOrder, club: undefined } }), { status: 200 }))],
    ['an answer that is not JSON', () => Promise.resolve(new Response('<html>', { status: 200 }))],
  ])('posts under the same id when the lookup gets %s', async (_name, answer) => {
    // catches: a lookup refusal or bad shape that blocks the resend or makes a second id
    lookupAnswers.push(answer)
    const fetchFn = await sendThenDrop(sent())
    tickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(requestOfCall(fetchFn, 1)).toBe(requestOfCall(fetchFn, 0)) // one id
    expect(fetchFn).toHaveBeenCalledTimes(2) // the drop and one resend
  })

  it('finds the earlier order after a reload with the sent line lowered in the cart, and takes the line out', async () => {
    // catches: a reload that drops the id because the cart changed, or a confirmation of the lowered cart
    const fetchFn = await sendThenDrop() // three sent, the answer lost
    fireEvent.click(screen.getByRole('button', { name: 'Lower Knot Tying to one' })) // the buyer lowers the line
    cleanup() // the reload
    renderForm(two, () => {}, 1, [{ item, quantity: 1 }]) // the cart now holds one
    expect(screen.getByLabelText('Name')).toHaveValue('Jo Tan') // refilled from the pending send
    lookupAnswers.push(found()) // the first send had landed
    tickAndSend()
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(fetchFn).toHaveBeenCalledTimes(1) // no second POST
    expect(storedOrder()).toMatchObject({ number: 'PF-20261102-4K7Q', changesNotSent: true }) // the saved order, flagged
    expect(JSON.parse(window.sessionStorage.getItem(SENT_ORDER_STORAGE_KEY) ?? '{}').order.lines).toEqual([{ itemId: 'knot-tying', name: 'Knot Tying', quantity: 3, priceCents: 300 }]) // three, not the lowered one
    expect(screen.getByTestId('cart')).toHaveTextContent('{}') // the line is out of the cart
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull() // spent
  })

  it('looks up before the next send after a stock refusal and shows the order when the first send had landed', async () => {
    // catches: a refusal that skips the lookup, so the late first send is followed by a second order
    lookupAnswers.push(notFound(), found()) // not yet landed at the refused resend, landed by the next
    const fetchFn = await sendThenDrop(refused(409, { error: 'stock', lines: [{ itemId: 'knot-tying', stock: 1 }] }))
    tickAndSend() // refused for stock
    await waitFor(() => expect(captcha.reset).toHaveBeenCalledTimes(2))
    tickAndSend() // the cart is unchanged, the first send has since landed
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
    expect(lookupFn).toHaveBeenCalledTimes(2) // looked up before each reuse
    expect(fetchFn).toHaveBeenCalledTimes(2) // the drop and the refused POST only
    expect(storedOrder()).toMatchObject({ number: 'PF-20261102-4K7Q' }) // the earlier order
  })

  it('shows no dialog anywhere on the resend paths', async () => {
    // catches: the plain resend notice coming back
    await sendThenDrop(sent())
    pickClub('Falcons')
    tickAndSend()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // the notice is gone for good
    await waitFor(() => expect(window.location.hash).toBe('#/order-sent'))
  })
})
