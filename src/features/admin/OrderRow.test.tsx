// Tests for one order row: open and close, the contact links, step saves with their outcomes, and Cancel order through the dialog.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react' // rendering and events
import { useState } from 'react' // a host that keeps the order
import { afterEach, describe, expect, it, vi } from 'vitest' // test API
import { OrderRow } from './OrderRow.tsx' // the code under test
import { makeOrder, orderAt } from '@/test/order-fixtures.ts' // order builders

const order = makeOrder({ number: 'PF-20261105-AAAA' }) // a New order with details

/**
 * Stubs fetch for the step route.
 * @param handler answers one POST
 * @return the spy
 */
function stubStep(handler: (body: Record<string, unknown>) => Response | Promise<Response>) {
  const spy = vi.fn((_url: unknown, init?: RequestInit) =>
    Promise.resolve().then(() => handler(JSON.parse(init?.body as string))),
  ) // one answer per call
  vi.stubGlobal('fetch', spy) // the page's fetch
  return spy
}

/**
 * Renders the row inside a list.
 * @param value the order
 * @param onChanged the callback
 * @param onRestocked called after a cancel that put stock back
 * @return the render result
 */
const renderRow = (value = order, onChanged = vi.fn(), onRestocked = vi.fn()) => // renders the row in a list
  render(
    <ul>
      {/* the row, with the spy for a restocking cancel */}
      <OrderRow order={value} onChanged={onChanged} onRestocked={onRestocked} />
    </ul>,
  )

afterEach(() => vi.unstubAllGlobals()) // no stub leaks on

describe('OrderRow', () => {
  it('shows the facts collapsed and opens with aria-expanded', () => {
    // Catches a row that hides its number, or a disclosure with no state.
    renderRow()
    const toggle = screen.getByRole('button', { name: /PF-20261105-AAAA/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveTextContent('Test Buyer')
    expect(toggle).toHaveTextContent('Test Club')
    expect(toggle).toHaveTextContent('3 items · RM 12.00')
    expect(toggle).toHaveTextContent('5 Nov 2026, 10:00 am')
    expect(screen.queryByLabelText('Step')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the lines and the mailto and tel links when open', () => {
    // Catches contact text that cannot be tapped.
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /PF-20261105-AAAA/ }))
    expect(screen.getByText('Knot Tying')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'buyer@example.test' })).toHaveAttribute('href', 'mailto:buyer@example.test')
    expect(screen.getByRole('link', { name: '+60 12 000 0000' })).toHaveAttribute('href', 'tel:+60120000000')
  })

  it('always shows the buyer name in the closed row and the contact links in the open row, never "No buyer details"', () => {
    // Catches the removed null-buyer branch coming back, or a closed row without the buyer's name.
    renderRow()
    const toggle = screen.getByRole('button', { name: /PF-20261105-AAAA/ })
    expect(toggle).toHaveTextContent('Test Buyer')
    fireEvent.click(toggle)
    expect(screen.getByText('Test Buyer')).toBeInTheDocument() // still shown once the row is open
    expect(screen.getByRole('link', { name: 'buyer@example.test' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+60 12 000 0000' })).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('No buyer details')
  })

  it('saves a step change, sending from, and says "Step saved."', async () => {
    // Catches a save without the guard value, or no confirmation.
    const onChanged = vi.fn()
    const spy = stubStep(() => Response.json({ order: orderAt('PF-20261105-AAAA', 'paid'), restocked: 0 }))
    renderRow(order, onChanged)
    fireEvent.click(screen.getByRole('button', { name: /PF-20261105-AAAA/ }))
    fireEvent.change(screen.getByLabelText('Step'), { target: { value: 'paid' } })
    expect(await screen.findByText('Step saved.')).toBeInTheDocument()
    expect(JSON.parse(spy.mock.calls[0][1]?.body as string)).toEqual({
      number: 'PF-20261105-AAAA',
      from: 'new',
      to: 'paid',
      restock: false,
    })
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ step: 'paid' }))
  })

  it('shows the conflict with the latest step and takes the latest order', async () => {
    // Catches a silent overwrite of another admin's change.
    const onChanged = vi.fn()
    stubStep(() => Response.json({ error: 'conflict', order: orderAt('PF-20261105-AAAA', 'paid') }, { status: 409 }))
    renderRow(order, onChanged)
    fireEvent.click(screen.getByRole('button', { name: /PF-20261105-AAAA/ }))
    fireEvent.change(screen.getByLabelText('Step'), { target: { value: 'handed_out' } })
    expect(await screen.findByText('This order has been updated. It is now Paid.')).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ step: 'paid' }))
  })

  it('keeps the old step on a failure and offers Try again', async () => {
    // Catches a select that shows a step that was never saved.
    const onChanged = vi.fn()
    const spy = stubStep(() => Response.json({}, { status: 500 }))
    renderRow(order, onChanged)
    fireEvent.click(screen.getByRole('button', { name: /PF-20261105-AAAA/ }))
    fireEvent.change(screen.getByLabelText('Step'), { target: { value: 'paid' } })
    expect(await screen.findByText("The step wasn't saved.")).toBeInTheDocument()
    expect(screen.getByLabelText('Step')).toHaveValue('new')
    expect(onChanged).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
  })

  it('sends once when the step is changed twice before the answer', async () => {
    // Catches a double change that sends two requests.
    let release: (response: Response) => void = () => undefined
    const spy = stubStep(() => new Promise<Response>((resolve) => (release = resolve)))
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /PF-20261105-AAAA/ }))
    const select = screen.getByLabelText('Step')
    fireEvent.change(select, { target: { value: 'paid' } })
    fireEvent.change(select, { target: { value: 'handed_out' } })
    expect(spy).toHaveBeenCalledTimes(1)
    await act(async () => undefined) // the request has reached the stub
    release(Response.json({ order: orderAt('PF-20261105-AAAA', 'paid'), restocked: 0 }))
    expect(await screen.findByText('Step saved.')).toBeInTheDocument()
  })

  it('shows the signed-out line for a 403', async () => {
    // Catches a 403 shown as a plain failure.
    stubStep(() => Response.json({}, { status: 403 }))
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /PF-20261105-AAAA/ }))
    fireEvent.change(screen.getByLabelText('Step'), { target: { value: 'paid' } })
    expect(
      await screen.findByText('Your sign-in has ended. Open this page in a new tab to sign in, then try again.'),
    ).toBeInTheDocument()
  })

  it('cancels with restock through the dialog and says how many items went back', async () => {
    // Catches a cancel that sends restock false while the box is ticked, or no result line.
    const onChanged = vi.fn()
    const spy = stubStep(() => Response.json({ order: orderAt('PF-20261105-AAAA', 'cancelled'), restocked: 3 }))
    renderRow(order, onChanged)
    fireEvent.click(screen.getByRole('button', { name: /PF-20261105-AAAA/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
    const dialog = screen.getByRole('dialog', { hidden: true })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel order' }))
    expect(await screen.findByText('Order cancelled. 3 items put back in stock.')).toBeInTheDocument()
    expect(JSON.parse(spy.mock.calls[0][1]?.body as string)).toEqual({
      number: 'PF-20261105-AAAA',
      from: 'new',
      to: 'cancelled',
      restock: true,
    })
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ step: 'cancelled' }))
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('says only "Order cancelled." when nothing was restocked', async () => {
    // Catches "0 items put back in stock".
    stubStep(() => Response.json({ order: orderAt('PF-20261105-AAAA', 'cancelled'), restocked: 0 }))
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /PF-20261105-AAAA/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Cancel order' }))
    expect(await screen.findByText('Order cancelled.')).toBeInTheDocument()
  })

  it('closes the dialog on a 409 and shows the conflict on the row', async () => {
    // Catches a refused cancel that leaves the dialog open over a changed order.
    stubStep(() => Response.json({ error: 'conflict', order: orderAt('PF-20261105-AAAA', 'cancelled') }, { status: 409 }))
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /PF-20261105-AAAA/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
    fireEvent.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Cancel order' }))
    expect(await screen.findByText('This order has been updated. It is now Cancelled.')).toBeInTheDocument()
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('has no step control and no Cancel order on a cancelled order', () => {
    // Catches a way to reopen a final order.
    renderRow(orderAt('PF-20261105-AAAA', 'cancelled'))
    fireEvent.click(screen.getByRole('button', { name: /PF-20261105-AAAA/ }))
    expect(screen.queryByLabelText('Step')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })

  it('shows the step as text and an icon, not colour alone', () => {
    // Catches a status that only a colour carries.
    renderRow(orderAt('PF-20261105-AAAA', 'handed_out'))
    expect(screen.getByText('Handed out')).toBeInTheDocument()
  })

  /** Opens the row and its Cancel dialog; returns the dialog. */
  function openDialog() {
    fireEvent.click(screen.getByRole('button', { name: /PF-20261105-AAAA/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
    return screen.getByRole('dialog', { hidden: true })
  }

  it('sends one request for a real double click on Cancel order in the dialog', async () => {
    // Catches two cancels (and two restocks) from one double click.
    let release: (response: Response) => void = () => undefined
    const spy = stubStep(() => new Promise<Response>((resolve) => (release = resolve)))
    renderRow()
    const confirm = within(openDialog()).getByRole('button', { name: 'Cancel order' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(spy).toHaveBeenCalledTimes(1)
    await act(async () => undefined) // the request has reached the stub
    release(Response.json({ order: orderAt('PF-20261105-AAAA', 'cancelled'), restocked: 3 }))
    expect(await screen.findByText('Order cancelled. 3 items put back in stock.')).toBeInTheDocument()
  })

  it('calls onRestocked once for a cancel answered with restocked 2', async () => { // a restocking cancel is reported once
    // catches: a cancel that put stock back without telling the Items list
    const onRestocked = vi.fn() // the spy
    stubStep(() => Response.json({ order: orderAt('PF-20261105-AAAA', 'cancelled'), restocked: 2 })) // two went back
    renderRow(order, vi.fn(), onRestocked) // the row
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Cancel order' })) // confirms the cancel in the dialog
    expect(await screen.findByText('Order cancelled. 2 items put back in stock.')).toBeInTheDocument() // the cancel finished
    expect(onRestocked).toHaveBeenCalledTimes(1) // called once
  })

  it('does not call onRestocked for a cancel with restocked 0', async () => { // a cancel with nothing put back is not reported
    // catches: a reload after a cancel that changed no stock
    const onRestocked = vi.fn() // the spy
    stubStep(() => Response.json({ order: orderAt('PF-20261105-AAAA', 'cancelled'), restocked: 0 })) // nothing went back
    renderRow(order, vi.fn(), onRestocked) // the row
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Cancel order' })) // confirms the cancel in the dialog
    expect(await screen.findByText('Order cancelled.')).toBeInTheDocument() // the cancel finished
    expect(onRestocked).not.toHaveBeenCalled() // not called
  })

  it('does not call onRestocked for a step change', async () => { // a plain step change is not reported
    // catches: the callback firing on any changed answer, not only a restocking cancel
    const onRestocked = vi.fn() // the spy
    stubStep(() => Response.json({ order: orderAt('PF-20261105-AAAA', 'paid'), restocked: 0 })) // a plain step
    renderRow(order, vi.fn(), onRestocked) // the row
    fireEvent.click(screen.getByRole('button', { name: /PF-20261105-AAAA/ })) // opens the row
    fireEvent.change(screen.getByLabelText('Step'), { target: { value: 'paid' } }) // picks Paid
    expect(await screen.findByText('Step saved.')).toBeInTheDocument() // the step finished
    expect(onRestocked).not.toHaveBeenCalled() // not called
  })

  it.each([ // the three failing answers
    ['a conflict', () => Response.json({ error: 'conflict', order: orderAt('PF-20261105-AAAA', 'cancelled') }, { status: 409 })], // a failing answer
    ['a 500', () => Response.json({}, { status: 500 })], // a failing answer
    ['a 403', () => Response.json({}, { status: 403 })], // a failing answer
  ])('does not call onRestocked after %s', async (_name, answer) => { // runs once per failing answer
    // catches: a reload after a cancel that never restocked
    const onRestocked = vi.fn() // the spy
    const spy = stubStep(answer) // the failing answer
    renderRow(order, vi.fn(), onRestocked) // the row
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Cancel order' })) // confirms the cancel in the dialog
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1)) // called once
    await act(async () => undefined) // the answer is handled
    expect(onRestocked).not.toHaveBeenCalled() // not called
  })

  it('calls onRestocked once for a double click on Cancel order', async () => { // two clicks send and report one cancel
    // catches: two reloads from one double click
    const onRestocked = vi.fn() // the spy
    const spy = stubStep(() => Response.json({ order: orderAt('PF-20261105-AAAA', 'cancelled'), restocked: 3 })) // three went back
    renderRow(order, vi.fn(), onRestocked) // the row
    const confirm = within(openDialog()).getByRole('button', { name: 'Cancel order' }) // confirms the cancel
    fireEvent.click(confirm) // the first click sends the cancel
    fireEvent.click(confirm) // the second click lands while it is in flight and sends nothing
    expect(await screen.findByText('Order cancelled. 3 items put back in stock.')).toBeInTheDocument() // the cancel finished
    expect(spy).toHaveBeenCalledTimes(1) // called once
    expect(onRestocked).toHaveBeenCalledTimes(1) // called once
  })

  it('keeps the dialog open with a failure line when the cancel fails', async () => {
    // Catches a failed cancel with no feedback.
    stubStep(() => Response.json({}, { status: 500 }))
    renderRow()
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Cancel order' }))
    expect(await screen.findByText("The order wasn't cancelled. Try again.")).toBeInTheDocument()
    expect(document.querySelector('dialog')).not.toBeNull()
  })

  it('shows the signed-out line in the dialog for a 403 on the cancel', async () => {
    // Catches a 403 on a cancel shown as a plain failure.
    stubStep(() => Response.json({}, { status: 403 }))
    renderRow()
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Cancel order' }))
    expect(
      await screen.findByText('Your sign-in has ended. Open this page in a new tab to sign in, then try again.'),
    ).toBeInTheDocument()
    expect(document.querySelector('dialog')).not.toBeNull()
  })

  it('closes on a 409 after a dropped first attempt and a retry', async () => {
    // Catches a retry after a network drop that lands on an already-cancelled order and stays stuck.
    let calls = 0
    const spy = vi.fn(() => {
      calls += 1
      return calls === 1
        ? Promise.reject(new TypeError('network'))
        : Promise.resolve(Response.json({ error: 'conflict', order: orderAt('PF-20261105-AAAA', 'cancelled') }, { status: 409 }))
    })
    vi.stubGlobal('fetch', spy)
    renderRow()
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Cancel order' }))
    expect(await screen.findByText("The order wasn't cancelled. Try again.")).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Cancel order' }))
    expect(await screen.findByText('This order has been updated. It is now Cancelled.')).toBeInTheDocument()
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('puts focus on the row header, not the page, after a completed cancel', async () => {
    // Catches focus dropping to the top of the page when the Cancel order button leaves.
    stubStep(() => Response.json({ order: orderAt('PF-20261105-AAAA', 'cancelled'), restocked: 3 }))
    function Host() {
      const [value, setValue] = useState(order)
      return (
        <ul>
          <OrderRow order={value} onChanged={setValue} />
        </ul>
      )
    }
    render(<Host />)
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Cancel order' }))
    await screen.findByText('Order cancelled. 3 items put back in stock.')
    await waitFor(() => expect(screen.getByRole('button', { name: /PF-20261105-AAAA/ })).toHaveFocus())
  })
})
