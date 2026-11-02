// Tests for the cart screen: two-line order lines, the Removed note with Undo, Unavailable lines, the Checkout bar, and the loading, error and empty states.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react' // render and query
import { useEffect, useState } from 'react' // leaves the screen, starts a send
import { afterEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import type { CatalogueLoad } from '@/features/catalogue/use-catalogue-data.ts' // the load the screen receives
import { OrderFormProvider } from '@/features/order/OrderFormProvider.tsx' // the form state the screen reads
import { useOrderForm } from '@/features/order/use-order-form.ts' // starts a send
import type { Honor } from '@/shared/data/types.ts' // the shape of an honor
import { honor } from '@/test/shop-fetch.ts' // the honor builder
import { CART_STORAGE_KEY } from './cart-storage.ts' // where the cart is kept
import { CartProvider } from './CartProvider.tsx' // the state the screen edits
import { CartScreen } from './CartScreen.tsx' // code under test
import { PILL_DOCK } from '@/shared/ui/floating-pill-box.ts' // the dock the pill and the note share
import { useCart } from './use-cart.ts' // reads the cart

const honors: Honor[] = [honor('knot-tying', 'Knot Tying'), honor('ants', 'Ants', { price: 3.5 })] // Knot Tying RM 4.00 and Ants RM 3.50; africa-lore is not listed, like a Hidden honor

const ready: CatalogueLoad = {
  state: { status: 'ready', honors, settings: { currency: 'MYR' }, clubs: [] },
  showSkeleton: false,
  retry: () => {},
} // the load as the app hands it over

afterEach(() => {
  vi.useRealTimers() // a test that faked the clock must not leak it
  window.location.hash = '' // back to the catalogue address
})

/**
 * Renders the screen over a stored cart, as a reload does.
 * @param quantities honor id to quantity, written to storage first
 * @param data the load, ready by default
 * @param onBack called by Browse more
 */
function renderScreen(quantities: Record<string, number>, data: CatalogueLoad = ready, onBack: () => void = () => {}) {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ version: 1, quantities })) // the saved cart
  render(
    <CartProvider honors={honors}>
      <OrderFormProvider>
        <CartScreen data={data} onBack={onBack} />
      </OrderFormProvider>
    </CartProvider>,
  )
}

/**
 * Reads the stored cart.
 * @return honor id to quantity as saved
 */
function storedCart(): Record<string, number> {
  return (
    JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? '{"quantities":{}}') as {
      quantities: Record<string, number>
    }
  ).quantities // the quantities part
}

/**
 * Removes a line by its trash as a mouse or finger does.
 * @param name the honor's name
 * @param keyboard true for a keyboard press (click detail 0)
 */
function removeLine(name: string, keyboard = false) {
  const trash = screen.getByRole('button', { name: `Remove ${name}` }) // the trash
  fireEvent.click(trash, { detail: keyboard ? 0 : 1 }) // a keyboard click has detail 0
}

describe('CartScreen lines', () => {
  it('lists lines A to Z with name, line total, "each" price and the stepper, and no total row in the card', () => {
    // catches: lines in cart order, a wrong line total, or the Estimated total drawn twice (card and bar)
    renderScreen({ 'knot-tying': 2, ants: 3 })
    const lines = screen.getAllByRole('listitem')
    expect(lines).toHaveLength(2)
    expect(within(lines[0]).getByText('Ants')).toBeInTheDocument()
    expect(within(lines[0]).getByText('RM 3.50 each')).toBeInTheDocument()
    expect(within(lines[0]).getByRole('textbox', { name: 'Quantity of Ants' })).toHaveValue('3')
    expect(within(lines[0]).getByText('RM 10.50')).toBeInTheDocument()
    expect(within(lines[1]).getByText('Knot Tying')).toBeInTheDocument()
    expect(within(lines[1]).getByText('RM 8.00')).toBeInTheDocument()
    expect(screen.getAllByText('Estimated total · 5 items')).toHaveLength(1) // only the pill's
    expect(screen.getByRole('list').parentElement).not.toHaveTextContent('Estimated total')
    expect(screen.getByText('RM 18.50')).toBeInTheDocument() // the bar's total
  })

  it('updates the line and the bar total on a change, and shows the trash at 1', () => {
    // catches: a stepper that edits a copy, leaving the totals stale, or a dead minus at 1
    renderScreen({ 'knot-tying': 2 })
    fireEvent.click(screen.getByRole('button', { name: 'One more Knot Tying' }))
    expect(screen.getByRole('textbox', { name: 'Quantity of Knot Tying' })).toHaveValue('3')
    expect(screen.getAllByText('RM 12.00')).toHaveLength(2) // the line and the bar
    fireEvent.click(screen.getByRole('button', { name: 'One fewer Knot Tying' }))
    fireEvent.click(screen.getByRole('button', { name: 'One fewer Knot Tying' }))
    expect(screen.getByRole('button', { name: 'Remove Knot Tying' })).toBeInTheDocument() // 1 left: the trash
  })

  it('shows the invoice note under the card, and none on an empty cart', () => {
    // catches: the note missing so the buyer does not know an invoice follows, or shown with nothing to order
    renderScreen({ 'knot-tying': 1 })
    const note = screen.getByText("Estimated total at today's prices. The treasurer will email you the invoice.")
    expect(
      screen.getByRole('list').parentElement!.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument() // the form lives on the details page
    expect(screen.queryByRole('button', { name: /^Send order/ })).not.toBeInTheDocument()
  })

  it('focuses its heading when it opens', () => {
    // catches: keyboard focus left on the link that is no longer on screen
    renderScreen({ 'knot-tying': 1 })
    expect(screen.getByRole('heading', { name: 'Your cart' })).toHaveFocus()
  })

  it('has no quiet Browse more link while it holds lines; the header Back is the way out', () => {
    // catches: a second way back beside the header's < button
    renderScreen({ 'knot-tying': 1 })
    expect(screen.queryByRole('link', { name: 'Browse more' })).not.toBeInTheDocument()
  })

  it('never says "honors" in the ways back to the shop', () => {
    // catches: stale "Back to honors" copy
    renderScreen({ 'knot-tying': 1 })
    expect(screen.queryByText(/Back to honors|Browse honors/)).not.toBeInTheDocument()
  })

  it('makes lines, bar and heading inert and busy while an order is sending, even after leaving and returning', () => {
    // catches: a cart that can be edited mid-send, so the sent order differs from what the buyer sees
    /** @return the cart screen with a send started, behind a button that leaves and returns */
    const Leaving = () => {
      const { setSending } = useOrderForm() // the send flag
      const [shown, setShown] = useState(true) // the cart route is showing
      // A send is running.
      useEffect(() => setSending(true), [setSending])
      return (
        <>
          <button onClick={() => setShown(!shown)}>Leave or return</button>
          {shown && <CartScreen data={ready} onBack={() => {}} />}
        </>
      )
    }
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":1}}')
    render(
      <CartProvider honors={honors}>
        <OrderFormProvider>
          <Leaving />
        </OrderFormProvider>
      </CartProvider>,
    )
    for (let round = 0; round < 2; round++) {
      expect(screen.getByRole('button', { name: 'Remove Knot Tying' }).closest('[inert]')).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Checkout' }).closest('[inert]')).not.toBeNull()
      expect(screen.getByRole('heading', { name: 'Your cart' }).closest('[aria-busy="true"]')).not.toBeNull()
      fireEvent.click(screen.getByText('Leave or return')) // browser Back
      fireEvent.click(screen.getByText('Leave or return')) // and the cart again
    }
  })
})

describe('CartScreen removal and Undo', () => {
  it('removes the line with the trash, says it in the status region, and Undo restores the quantity and focuses its number field', async () => {
    // catches: a removal nobody hears, a lost quantity, or focus falling to the page when Undo goes
    renderScreen({ ants: 3, 'knot-tying': 2 })
    fireEvent.click(screen.getByRole('button', { name: 'One fewer Ants' }))
    fireEvent.click(screen.getByRole('button', { name: 'One fewer Ants' }))
    removeLine('Ants') // 1 left, the trash
    fireEvent.click(screen.getByRole('button', { name: 'One more Knot Tying' })) // an unrelated edit
    expect(screen.queryByRole('textbox', { name: 'Quantity of Ants' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Ants removed')
    expect(storedCart()).toEqual({ 'knot-tying': 3 })
    fireEvent.click(screen.getByRole('button', { name: 'Undo removing Ants' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Quantity of Ants' })).toHaveFocus())
    expect(screen.getByRole('textbox', { name: 'Quantity of Ants' })).toHaveValue('1') // the quantity it had at removal
    expect(storedCart()).toEqual({ ants: 1, 'knot-tying': 3 })
  })

  it('Undo restores the old quantity of a line removed with a typed 0', async () => {
    // catches: Undo bringing back 1 instead of what was there
    renderScreen({ ants: 3 })
    const field = screen.getByRole('textbox', { name: 'Quantity of Ants' })
    fireEvent.change(field, { target: { value: '0' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Undo removing Ants' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Quantity of Ants' })).toHaveValue('3'))
  })

  it('ends the note after 5 s, and the removal stands in storage', () => {
    // catches: a note that never goes, or a removal that was only visual
    vi.useFakeTimers()
    renderScreen({ ants: 1, 'knot-tying': 2 })
    removeLine('Ants')
    expect(screen.getByRole('button', { name: 'Undo removing Ants' })).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(4999))
    expect(screen.getByRole('button', { name: 'Undo removing Ants' })).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(1))
    expect(screen.queryByRole('button', { name: 'Undo removing Ants' })).not.toBeInTheDocument()
    expect(storedCart()).toEqual({ 'knot-tying': 2 })
  })

  it('pauses the timer while the pointer is over the note and restarts 5 s after it leaves', () => {
    // catches: a timeout the buyer cannot stop (WCAG 2.2.1)
    vi.useFakeTimers()
    renderScreen({ ants: 1, 'knot-tying': 2 })
    removeLine('Ants')
    const note = screen.getByTestId('removed-note')
    fireEvent.mouseEnter(note)
    act(() => void vi.advanceTimersByTime(30000))
    expect(screen.getByRole('button', { name: 'Undo removing Ants' })).toBeInTheDocument()
    fireEvent.mouseLeave(note)
    act(() => void vi.advanceTimersByTime(5000))
    expect(screen.queryByRole('button', { name: 'Undo removing Ants' })).not.toBeInTheDocument()
  })

  it('focuses Undo after a keyboard removal', () => {
    // catches: a keyboard user losing their place and Undo
    renderScreen({ ants: 1, 'knot-tying': 2 })
    removeLine('Ants', true)
    expect(screen.getByRole('button', { name: 'Undo removing Ants' })).toHaveFocus()
  })

  it('focuses the next line after a pointer removal, and the heading after the last one', async () => {
    // catches: focus falling to the page body after the focused trash unmounts
    renderScreen({ ants: 1, 'knot-tying': 1 })
    removeLine('Ants') // pointer; Knot Tying follows
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Knot Tying' })).toHaveFocus())
    removeLine('Knot Tying') // the last line
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Your cart' })).toHaveFocus())
  })

  it('focuses a gone line after a pointer removal above it, and its trash after Undo', async () => {
    // catches: a gone honor's line with no id, so focus falls to the heading or the page (a keyboard buyer stranded)
    renderScreen({ ants: 1, 'no-such-honor': 2 })
    removeLine('Ants') // pointer; the gone line follows
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove Item no longer in the shop (no-such-honor)' })).toHaveFocus(),
    )
    removeLine('Item no longer in the shop (no-such-honor)', true) // keyboard: focus on Undo
    fireEvent.click(screen.getByRole('button', { name: 'Undo removing Item no longer in the shop (no-such-honor)' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove Item no longer in the shop (no-such-honor)' })).toHaveFocus(),
    )
  })

  it('moves focus the same way when the note ends with focus inside it', () => {
    // catches: Undo unmounting under a keyboard user's focus
    vi.useFakeTimers()
    renderScreen({ ants: 1, 'knot-tying': 1 })
    removeLine('Ants', true) // focus on Undo
    act(() => void vi.advanceTimersByTime(5000)) // paused by focus: nothing yet
    expect(screen.getByRole('button', { name: 'Undo removing Ants' })).toBeInTheDocument()
    act(() => screen.getByRole('textbox', { name: 'Quantity of Knot Tying' }).focus()) // leaves the note
    act(() => void vi.advanceTimersByTime(5000))
    expect(screen.queryByRole('button', { name: 'Undo removing Ants' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Quantity of Knot Tying' })).toHaveFocus() // not stolen
  })

  it('replaces the note on a second removal, and Undo brings back only the second', () => {
    // catches: two notes at once, or Undo restoring the wrong line
    renderScreen({ ants: 1, 'knot-tying': 1 })
    removeLine('Ants')
    removeLine('Knot Tying')
    expect(screen.queryByRole('button', { name: 'Undo removing Ants' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Undo removing Knot Tying' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Knot Tying')).toBeInTheDocument()
    expect(storedCart()).toEqual({ 'knot-tying': 1 })
  })

  it('removes a line when 0 is typed and Enter pressed, with the note', () => {
    // catches: a typed 0 that leaves a zero line, or removes with no way back
    renderScreen({ ants: 3, 'knot-tying': 2 })
    const field = screen.getByRole('textbox', { name: 'Quantity of Ants' })
    fireEvent.change(field, { target: { value: '0' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(screen.queryByRole('textbox', { name: 'Quantity of Ants' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo removing Ants' })).toBeInTheDocument()
  })

  it('leaves focus where the buyer tapped when a typed 0 is committed by moving to another field', async () => {
    // catches: the note stealing focus from the field the buyer just chose, which closes a phone keyboard
    renderScreen({ ants: 3, 'knot-tying': 2 })
    const ants = screen.getByRole('textbox', { name: 'Quantity of Ants' })
    const knots = screen.getByRole('textbox', { name: 'Quantity of Knot Tying' })
    ants.focus()
    fireEvent.change(ants, { target: { value: '0' } })
    act(() => knots.focus()) // blur commits the zero, focus ends on the other field
    expect(screen.getByRole('button', { name: 'Undo removing Ants' })).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20)) // longer than the focus move's one tick
    })
    expect(screen.getByRole('textbox', { name: 'Quantity of Knot Tying' })).toHaveFocus()
  })

  it('does not even briefly focus another control while focus is on its way to the tapped field', async () => {
    // catches: a focus move in the same tick as the blur, when the page reports no focus, so the next line steals it
    renderScreen({ ants: 3, 'knot-tying': 2, 'africa-lore': 1 })
    const ants = screen.getByRole('textbox', { name: 'Quantity of Ants' })
    const knots = screen.getByRole('textbox', { name: 'Quantity of Knot Tying' })
    const focused: string[] = [] // every element that received focus
    const record = (event: FocusEvent) => focused.push((event.target as HTMLElement).getAttribute('aria-label') ?? '') // who got focus
    document.addEventListener('focusin', record)
    ants.focus()
    fireEvent.change(ants, { target: { value: '0' } })
    act(() => ants.blur()) // the blur commits the zero while the page has no focus
    act(() => knots.focus()) // the tapped field takes it in the same tick
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    document.removeEventListener('focusin', record)
    expect(focused).toEqual(['Quantity of Ants', 'Quantity of Knot Tying']) // nothing else ever had focus
  })

  it('shows no note after leaving and reopening the screen, and the removal stands', () => {
    // catches: a note, or a restored line, that survives leaving the screen
    /** @return the cart screen behind a button that leaves and returns */
    const Leaving = () => {
      const [shown, setShown] = useState(true) // the cart route is showing
      return (
        <>
          <button onClick={() => setShown(!shown)}>Leave or return</button>
          {shown && <CartScreen data={ready} onBack={() => {}} />}
        </>
      )
    }
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"ants":1,"knot-tying":1}}')
    render(
      <CartProvider honors={honors}>
        <OrderFormProvider>
          <Leaving />
        </OrderFormProvider>
      </CartProvider>,
    )
    removeLine('Ants')
    fireEvent.click(screen.getByText('Leave or return'))
    fireEvent.click(screen.getByText('Leave or return'))
    expect(screen.queryByRole('button', { name: /Undo removing/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Ants')).not.toBeInTheDocument()
  })
})

describe('CartScreen Unavailable lines', () => {
  it('shows a Hidden honor, which the shop no longer lists, greyed with the tag, "Not in your total", a Remove button and no stepper', () => {
    // catches: an unavailable line that can still be stepped, or one that is priced into the total
    renderScreen({ 'knot-tying': 2, 'africa-lore': 3 })
    const line = screen.getByText('Item no longer in the shop').closest('li')!
    expect(within(line).getByText('Unavailable')).toBeInTheDocument()
    expect(within(line).getByText('Not in your total')).toBeInTheDocument()
    expect(within(line).getByRole('button', { name: 'Remove Item no longer in the shop (africa-lore)' })).toBeInTheDocument()
    expect(within(line).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(line).queryByText(/RM 15\.00/)).not.toBeInTheDocument()
    expect(screen.getByText('Item no longer in the shop')).toHaveClass('text-text-muted')
    expect(screen.getAllByText('RM 8.00')).toHaveLength(2) // Knot Tying's line and the bar: Africa Lore is left out
  })

  it('shows the count banner right after the heading, as a plain paragraph with no live region', () => {
    // catches: review Critical 2, a banner announced over the heading's focus on arrival
    renderScreen({ 'knot-tying': 1, 'africa-lore': 2 })
    const banner = screen.getByText('1 item is no longer available')
    expect(screen.getByRole('heading', { name: 'Your cart' }).nextElementSibling).toBe(banner)
    expect(banner.tagName).toBe('P')
    expect(banner).not.toHaveAttribute('role')
    expect(banner.closest('[role="status"], [role="alert"], [aria-live]')).toBeNull()
  })

  it('counts lines, a gone honor included, and shows a gone honor as "Item no longer in the shop"', () => {
    // catches: a gone id vanishing silently, or a count of quantities instead of lines
    renderScreen({ 'knot-tying': 1, 'africa-lore': 4, 'no-such-honor': 2 })
    expect(screen.getByText('2 items are no longer available')).toBeInTheDocument()
    const line = screen.getAllByText('Item no longer in the shop')[1].closest('li')! // two gone lines, africa-lore then no-such-honor
    expect(within(line).getByText('Unavailable')).toBeInTheDocument()
    expect(
      within(line).getByRole('button', { name: 'Remove Item no longer in the shop (no-such-honor)' }),
    ).toBeInTheDocument()
  })

  it('gives two gone lines different accessible names for Remove and Undo', () => {
    // catches: a screen-reader buyer meeting two identical "Remove Item no longer in the shop" buttons
    renderScreen({ 'gone-a': 1, 'gone-b': 2 })
    expect(screen.getByRole('button', { name: 'Remove Item no longer in the shop (gone-a)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Item no longer in the shop (gone-b)' })).toBeInTheDocument()
    removeLine('Item no longer in the shop (gone-b)')
    expect(
      screen.getByRole('button', { name: 'Undo removing Item no longer in the shop (gone-b)' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Item no longer in the shop removed')
  })

  it('puts an undone gone line back in its old place among gone lines', () => {
    // catches: equal-name gone lines ordered by cart insertion, so Undo moves the restored line to the end
    renderScreen({ 'gone-a': 1, 'gone-b': 2 })
    const order = () => screen.getAllByRole('listitem').map((item) => item.getAttribute('data-line-id')) // lines top to bottom
    expect(order()).toEqual(['gone-a', 'gone-b'])
    removeLine('Item no longer in the shop (gone-a)')
    fireEvent.click(screen.getByRole('button', { name: 'Undo removing Item no longer in the shop (gone-a)' }))
    expect(order()).toEqual(['gone-a', 'gone-b'])
  })

  it('finds a gone line whose saved id holds a quote, after a pointer removal above it', async () => {
    // catches: an id spliced raw into a selector, which throws and strands focus
    renderScreen({ ants: 1, 'we"ird': 2 })
    removeLine('Ants') // pointer; the gone line follows
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove Item no longer in the shop (we"ird)' })).toHaveFocus(),
    )
  })

  it('removing an unavailable line lowers the count and shows the note; at 0 the banner goes', () => {
    // catches: a stale banner, or a removal with no way back
    renderScreen({ 'knot-tying': 1, 'africa-lore': 4, 'no-such-honor': 2 })
    removeLine('Item no longer in the shop (africa-lore)')
    expect(screen.getByText('1 item is no longer available')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo removing Item no longer in the shop (africa-lore)' })).toBeInTheDocument()
    removeLine('Item no longer in the shop (no-such-honor)')
    expect(screen.queryByText(/no longer available/)).not.toBeInTheDocument()
  })

  it('with only unavailable lines shows the list and banner, and Browse more in the bar instead of Checkout', () => {
    // catches: a Checkout that leads to an order with nothing in it
    const onBack = vi.fn()
    renderScreen({ 'africa-lore': 2 }, ready, onBack)
    expect(screen.getByText('Item no longer in the shop')).toBeInTheDocument()
    expect(screen.getByText('1 item is no longer available')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Checkout' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Browse more' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('keeps the unavailable lines on a reload', () => {
    // catches: the old take-out on load
    renderScreen({ 'knot-tying': 1, 'africa-lore': 2 })
    expect(storedCart()).toEqual({ 'knot-tying': 1, 'africa-lore': 2 })
  })
})

describe('CartScreen Checkout', () => {
  it('takes the unavailable lines out of the cart, then opens the details page', () => {
    // catches: an unavailable line reaching an order
    const seen: string[] = [] // each render's address and cart
    /** @return nothing drawn; records the address and the cart on every render */
    const Probe = () => {
      const { quantities } = useCart() // the cart
      seen.push(`${window.location.hash}|${Object.keys(quantities).sort().join(',')}`) // what this render saw
      return null
    }
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      '{"version":1,"quantities":{"knot-tying":2,"africa-lore":1,"no-such-honor":3}}',
    )
    render(
      <CartProvider honors={honors}>
        <OrderFormProvider>
          <Probe />
          <CartScreen data={ready} onBack={() => {}} />
        </OrderFormProvider>
      </CartProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Checkout' }))
    expect(window.location.hash).toBe('#/details')
    expect(storedCart()).toEqual({ 'knot-tying': 2 })
    expect(seen.filter((entry) => entry.startsWith('#/details|') && entry !== '#/details|knot-tying')).toEqual([]) // no render saw the details address with an unavailable id
  })

  it('pushes one history entry for a double tap', () => {
    // catches: a double tap on Checkout adding two entries, so Back needs two presses
    renderScreen({ 'knot-tying': 1 })
    const before = window.history.length
    const checkout = screen.getByRole('button', { name: 'Checkout' })
    fireEvent.click(checkout)
    fireEvent.click(checkout)
    expect(window.history.length).toBe(before + 1)
  })
})

describe('CartScreen empty, loading and error', () => {
  it('shows no card, the two lines of copy and Browse more in the bar for a cart that starts empty, and no top link', () => {
    // catches: a blank screen, a card around nothing, or two ways out
    const onBack = vi.fn()
    renderScreen({}, ready, onBack)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
    expect(screen.getByText("Add items from the shop and they'll show up here.")).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Browse more' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Browse more' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('shows the empty state when the last line is removed, keeping the note', () => {
    // catches: no way out of an emptied cart, or the Undo note lost with the last line
    renderScreen({ 'knot-tying': 1 })
    removeLine('Knot Tying')
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo removing Knot Tying' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Browse more' })).toHaveLength(1)
  })

  it('shows nothing under the heading for 300 ms, then 3 row-shaped skeleton lines and no total bar', () => {
    // catches: a skeleton flash on a fast load, the wrong shape, or a total bar over a loading screen
    const loading: CatalogueLoad = { state: { status: 'loading' }, showSkeleton: false, retry: () => {} }
    const tree = (data: CatalogueLoad) => (
      <CartProvider honors={honors}>
        <OrderFormProvider>
          <CartScreen data={data} onBack={() => {}} />
        </OrderFormProvider>
      </CartProvider>
    ) // the screen over a load
    const { rerender } = render(tree(loading))
    expect(screen.getByRole('heading', { name: 'Your cart' })).toBeInTheDocument()
    expect(screen.queryAllByTestId('cart-skeleton-line')).toHaveLength(0)
    expect(screen.queryByText('Your cart is empty')).not.toBeInTheDocument() // not empty, only unknown
    rerender(tree({ ...loading, showSkeleton: true }))
    const lines = screen.getAllByTestId('cart-skeleton-line')
    expect(lines).toHaveLength(3)
    expect(lines[0].className).toContain('min-h-20') // the real row's 80 px
    expect(screen.queryByText(/^Estimated total/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Checkout' })).not.toBeInTheDocument()
  })

  it('shows the catalogue error copy and Try again, and no bar, when the load failed', () => {
    // catches: no way to recover from a failed load, or a Checkout over an error
    const retry = vi.fn()
    renderScreen({ 'knot-tying': 1 }, { state: { status: 'error', reason: 'failed' }, showSkeleton: false, retry })
    expect(screen.getByText("We couldn't load the shop. Check your connection and try again.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Checkout' })).not.toBeInTheDocument()
  })
})

/**
 * Tells whether an element carries every class of a class string.
 * @param element the element
 * @param classes space-separated classes
 * @return true when all are present
 */
function hasAll(element: Element | null, classes: string): boolean {
  return element !== null && classes.split(' ').every((name) => element.classList.contains(name)) // every one is there
}

describe('CartScreen floating pill', () => {
  it('puts the Removed note and the pill in one dock, the note first', () => {
    // catches: the note drawn under or behind the pill, or outside the dock that gives it the pill's width
    renderScreen({ ants: 1, 'knot-tying': 2 })
    removeLine('Ants')
    const note = screen.getByTestId('removed-note')
    const pill = screen.getByRole('button', { name: 'Checkout' }).parentElement as HTMLElement // the pill holding Checkout
    expect(note.parentElement).toBe(pill.parentElement)
    expect(hasAll(pill.parentElement, PILL_DOCK)).toBe(true)
    expect(note.nextElementSibling).toBe(pill)
  })

  it('counts five items in the pill for a 2 + 3 cart with an unavailable line', () => {
    // catches: a pill that counts unavailable lines or quantities wrongly, so it disagrees with the Cart tab
    renderScreen({ 'knot-tying': 2, ants: 3, 'africa-lore': 4 })
    expect(screen.getByText('Estimated total · 5 items')).toBeInTheDocument()
    expect(screen.getByText('RM 18.50')).toBeInTheDocument()
  })

  it('shows only Browse more in the pill for an empty cart', () => {
    // catches: a Checkout or a total over an empty cart
    renderScreen({})
    expect(screen.queryByRole('button', { name: 'Checkout' })).not.toBeInTheDocument()
    expect(screen.queryByText(/^Estimated total/)).not.toBeInTheDocument()
    const browse = screen.getByRole('button', { name: 'Browse more' })
    expect(browse.parentElement?.children).toHaveLength(1)
    expect(hasAll(browse.parentElement?.parentElement ?? null, PILL_DOCK)).toBe(true)
  })

  it('keeps the bottom padding that clears the note, the gap and the pill', () => {
    // catches: the last line hidden behind the floating pill
    renderScreen({ ants: 1 })
    expect(screen.getByRole('heading', { name: 'Your cart' }).parentElement).toHaveClass('pb-24')
  })
})
