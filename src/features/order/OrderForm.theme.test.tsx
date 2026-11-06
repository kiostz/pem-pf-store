// Test for the order form with the real Captcha (only the Turnstile package stood in): a theme change must unready Send order, and a failed send after it must keep the cart and the typing.

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react' // render, query and flush updates
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import { CART_STORAGE_KEY } from '@/features/cart/cart-storage.ts' // the stored cart
import { CartProvider } from '@/features/cart/CartProvider.tsx' // the cart the form clears
import type { OrderLine } from '@/features/cart/cart.ts' // an order line
import { useCart } from '@/features/cart/use-cart.ts' // reads the cart
import { useTheme } from '@/shared/theme/use-theme.ts' // the hook the Theme control uses
import { OrderForm } from './OrderForm.tsx' // code under test
import { OrderFormProvider } from './OrderFormProvider.tsx' // the form state

const saved = {
  number: 'PF-20261102-4K7Q',
  createdAt: '2026-11-01T17:00:00.000Z',
  currency: 'MYR',
  totalCents: 900,
  lines: [{ itemId: 'knot-tying', name: 'Knot Tying', quantity: 3, priceCents: 300 }],
} // what the Worker saved

const tickCount = vi.hoisted(() => ({ n: 0 })) // how many times the widget was ticked, so each token is distinct

// The package's widget replaced by a button that ticks it, so the real Captcha wrapper and the form run unchanged.
vi.mock('@marsidev/react-turnstile', () => ({
  /**
   * The stand-in widget.
   * @param props the wrapper's callbacks
   * @return a button that reports a token
   */
  Turnstile: ({ onSuccess }: { onSuccess: (token: string) => void }) => (
    <button type="button" onClick={() => onSuccess(`token-${++tickCount.n}`)}>
      Solve captcha
    </button>
  ),
}))

beforeEach(() => {
  tickCount.n = 0 // the first tick gives token-1
  // jsdom has no matchMedia; a light, silent one is enough here.
  window.matchMedia = ((query: string) => ({
    matches: false, // the system is light
    media: query, // the asked query
    addEventListener: () => {}, // no system switch in this test
    removeEventListener: () => {}, // nothing to stop
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  vi.unstubAllGlobals() // fetch back
  vi.restoreAllMocks() // spies removed
  document.documentElement.removeAttribute('data-theme') // the next test starts on System
  window.localStorage.clear() // no saved pick or cart left
  window.sessionStorage.clear() // no sent order left
})

const item = { // one test item
  id: 'knot-tying',
  name: 'Knot Tying',
  category: 'Nature',
  subcategory: null, // no subcategory
  stock: 10,
  price: 3,
  image: null,
} as const // one item at RM 3
const lines: OrderLine[] = [{ item, quantity: 3 }] // RM 9.00

/**
 * Shows the cart as text.
 * @return the quantities
 */
function CartProbe() {
  const { quantities } = useCart() // the cart
  return <p data-testid="cart">{JSON.stringify(quantities)}</p>
}

describe('OrderForm with a theme change', () => {
  it('unreadies Send order on a theme change, and keeps the cart and typing when the next send fails', async () => {
    // catches: a form that keeps a token the redrawn widget no longer holds, or loses the cart after the retry fails
    vi.spyOn(console, 'error').mockImplementation(() => {})
    readyForm(500) // filled, ticked, and the send will fail
    const send = screen.getByRole('button', { name: /^Send order/ })
    expect(send).toHaveAttribute('aria-disabled', 'false') // ready
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setChoice('dark')) // the buyer picks Dark in the Theme control
    expect(send).toHaveAttribute('aria-disabled', 'true') // the redrawn widget is unticked
    expect(screen.getByText('Complete the captcha to send.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' })) // ticked again in the new theme
    fireEvent.click(send)
    await screen.findByRole('alert')
    expect(screen.getByTestId('cart')).toHaveTextContent('{"knot-tying":3}')
    expect(screen.getByLabelText('Name')).toHaveValue('Jo Tan')
  })

  /**
   * Renders the form filled in and ticked, with a fetch stand-in.
   * @param status the HTTP status the stand-in answers
   * @return the fetch stand-in
   */
  function readyForm(status: number) {
    const fetchMock = vi.fn(async () => new Response(status < 300 ? JSON.stringify(saved) : '{}', { status })) // the send
    vi.stubGlobal('fetch', fetchMock)
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":3}}') // the cart
    render(
      <CartProvider
        items={null} // the items, null while loading
      >
        <OrderFormProvider>
          <CartProbe />
          <OrderForm
            lines={lines}
            currency="MYR"
            clubs={[{ name: 'Eagles', area: null, language: null, location: null, churchName: null }]}
            onStockRefused={() => {}}
          />
        </OrderFormProvider>
      </CartProvider>,
    )
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jo Tan' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jc@mail.com' } })
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+60 12-345 6789' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Club' }), { target: { value: 'Eagles' } })
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' })) // token-1
    return fetchMock
  }

  it('sends nothing when Send order is pressed after a theme change until the captcha is ticked again', async () => {
    // catches: a send that goes out with the dead token of the old theme
    const fetchMock = readyForm(200)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setChoice('dark')) // the token is cleared
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    await act(async () => {}) // let any send start
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('cart')).toHaveTextContent('{"knot-tying":3}')
  })

  it('sends the token ticked after the theme change, not the one held before it', async () => {
    // catches: the old token kept in the form and posted to the Worker
    const fetchMock = readyForm(200)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setChoice('dark'))
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' })) // token-2
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(body.turnstileToken).toBe('token-2')
  })

  it('sends once when Send order is double-clicked after a theme change and a new tick', async () => {
    // catches: a double click that posts the order twice after the token was re-ticked
    const fetchMock = readyForm(200)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setChoice('dark'))
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    const send = screen.getByRole('button', { name: /^Send order/ })
    fireEvent.click(send)
    fireEvent.click(send)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the buyer out of logs and the alert when a send fails after a theme change', async () => {
    // catches: a failure path that logs or shows the name, email or phone
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const fetchMock = readyForm(500)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setChoice('dark'))
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    const alert = await screen.findByRole('alert')
    const seen =
      JSON.stringify([errorSpy, warnSpy, logSpy, infoSpy].map((spy) => spy.mock.calls)) +
      (alert.textContent ?? '') +
      String((fetchMock.mock.calls[0] as unknown as [string])[0])
    expect(window.location.href).not.toMatch(/Jo(%20|\+| )Tan|jc(@|%40)mail|12-345|123456789/) // the page address holds no buyer data
    for (const secret of ['Jo Tan', 'jc@mail.com', '12-345', '123456789']) expect(seen).not.toContain(secret)
  })
})
