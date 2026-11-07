// Tests for the Orders screen with fetch stubbed at the boundary: the filter, the lookup, every list state and its copy, and the email-Off note.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react' // rendering and events
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API
import type { AdminOrder } from '../../../workers/admin/src/admin-types.ts' // the order shape
import { OrdersScreen } from './OrdersScreen.tsx' // the code under test
import { orderAt, orders } from '@/test/order-fixtures.ts' // shared data

type Handler = (url: string) => Response | Promise<Response> // answers one request

const pageOf = (list: AdminOrder[], nextCursor: string | null = null) => Response.json({ orders: list, nextCursor }) // a page answer

/**
 * Stubs fetch for the orders and settings routes.
 * @param pages answers GET /api/orders
 * @param settings answers GET /api/settings
 * @return the requested URLs
 */
function stubApi(pages: Handler = () => pageOf(orders), settings: Handler = () => Response.json({ orderEmailOn: true })) {
  const urls: string[] = [] // every URL asked
  vi.stubGlobal('fetch', (url: unknown) => {
    urls.push(String(url)) // record
    return Promise.resolve().then(() => (String(url).startsWith('/api/settings') ? settings(String(url)) : pages(String(url))))
  })
  return urls
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true })) // time moves, and the tests can jump it
afterEach(() => {
  vi.useRealTimers() // the real clock
  vi.unstubAllGlobals() // no stub leaks on
})

describe('OrdersScreen', () => {
  it('lists the orders with their facts and never says honor', async () => {
    // Catches the shop-wide copy rule slipping into an admin screen.
    stubApi()
    const { container } = render(<OrdersScreen number={null} />)
    expect(await screen.findByText('PF-20261105-AAAA')).toBeInTheDocument()
    expect(screen.getByText('PF-20261103-CCCC')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/honor/i)
    expect(screen.getByLabelText('Order number')).toHaveAttribute('placeholder', 'PF-20261105-ABCD')
  })

  it('filters by step through the select, and says "No Paid orders." for an empty step', async () => {
    // Catches a filter that does not refetch, or a blank empty state.
    const urls = stubApi((url) => (url.includes('step=paid') ? pageOf([]) : pageOf(orders)))
    render(<OrdersScreen number={null} />)
    await screen.findByText('PF-20261105-AAAA')
    fireEvent.change(screen.getByLabelText('Step filter'), { target: { value: 'paid' } })
    expect(await screen.findByText('No Paid orders.')).toBeInTheDocument()
    expect(urls).toContain('/api/orders?step=paid')
  })

  it('says "No orders yet." for an empty shop', async () => {
    // Catches a blank screen with no orders.
    stubApi(() => pageOf([]))
    render(<OrdersScreen number={null} />)
    expect(await screen.findByText('No orders yet.')).toBeInTheDocument()
  })

  it('looks up an order number from the route, with the field filled in', async () => {
    // Catches a link that opens the list instead of the order.
    const urls = stubApi(() => pageOf([orderAt('PF-20261105-ABCD', 'new')]))
    render(<OrdersScreen number="PF-20261105-ABCD" />)
    expect(await screen.findByText('PF-20261105-ABCD')).toBeInTheDocument()
    expect(urls).toContain('/api/orders?number=PF-20261105-ABCD')
    expect(screen.getByLabelText('Order number')).toHaveValue('PF-20261105-ABCD')
    expect(screen.getByRole('button', { name: /PF-20261105-ABCD/ })).toHaveAttribute('aria-expanded', 'true') // the one found order is open
  })

  it('says "No order … found." for an unknown number', async () => {
    // Catches an empty list with no reason.
    stubApi(() => pageOf([]))
    render(<OrdersScreen number="PF-20261105-ABCD" />)
    expect(await screen.findByText('No order PF-20261105-ABCD found.')).toBeInTheDocument()
  })

  it('upper-cases a typed number, refuses a bad one with a hint, and does not fetch it', async () => {
    // Catches a bad entry that costs a 400 round trip.
    const urls = stubApi()
    render(<OrdersScreen number={null} />)
    await screen.findByText('PF-20261105-AAAA')
    const field = screen.getByLabelText('Order number')
    fireEvent.change(field, { target: { value: 'PF-20261105-ABC0' } })
    fireEvent.submit(field.closest('form') as HTMLFormElement)
    expect(screen.getByText('Enter an order number like PF-20261105-ABCD.')).toBeInTheDocument()
    expect(urls.some((url) => url.includes('number='))).toBe(false)
    fireEvent.change(field, { target: { value: 'pf-20261105-abcd' } })
    fireEvent.submit(field.closest('form') as HTMLFormElement)
    await waitFor(() => expect(urls).toContain('/api/orders?number=PF-20261105-ABCD'))
  })

  it('shows skeleton rows only after 300 ms', async () => {
    // Catches a skeleton that flashes on a quick load.
    let release: (response: Response) => void = () => undefined
    stubApi(() => new Promise<Response>((resolve) => (release = resolve)))
    render(<OrdersScreen number={null} />)
    expect(screen.queryAllByTestId('order-skeleton-row')).toHaveLength(0)
    await act(async () => void vi.advanceTimersByTime(300)) // the request reaches the stub and the delay passes
    expect(screen.getAllByTestId('order-skeleton-row')).toHaveLength(6)
    await act(async () => release(pageOf(orders)))
    expect(screen.queryAllByTestId('order-skeleton-row')).toHaveLength(0)
  })

  it('shows the failure line with Try again, and the signed-out line for a 403', async () => {
    // Catches a failure that leaves an empty page.
    let status = 500
    stubApi(() => (status === 500 ? Response.json({}, { status }) : pageOf(orders)))
    render(<OrdersScreen number={null} />)
    expect(await screen.findByText("We couldn't load the orders.")).toBeInTheDocument()
    status = 200
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('PF-20261105-AAAA')).toBeInTheDocument()
  })

  it('shows the signed-out line for a 403', async () => {
    // Catches a 403 shown as a plain failure.
    stubApi(() => Response.json({}, { status: 403 }))
    render(<OrdersScreen number={null} />)
    expect(
      await screen.findByText('Your sign-in has ended. Open this page in a new tab to sign in, then try again.'),
    ).toBeInTheDocument()
  })

  it('loads more, shows "Loading…", and keeps the rows with a failure line when it fails', async () => {
    // Catches a failed second page wiping the list.
    let fail = true
    stubApi((url) =>
      url.includes('cursor=')
        ? fail
          ? Response.json({}, { status: 500 })
          : pageOf([orderAt('PF-20261101-DDDD', 'new')])
        : pageOf(orders, 'next'),
    )
    render(<OrdersScreen number={null} />)
    await screen.findByText('PF-20261105-AAAA')
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText("We couldn't load more orders.")).toBeInTheDocument()
    expect(screen.getByText('PF-20261105-AAAA')).toBeInTheDocument()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('PF-20261101-DDDD')).toBeInTheDocument()
  })

  it('shows the Off note with a Settings link only when the email is off', async () => {
    // Catches an admin who does not know orders are not being emailed.
    stubApi(undefined, () => Response.json({ orderEmailOn: false }))
    const off = render(<OrdersScreen number={null} />)
    expect(await screen.findByText('Order emails are off. New orders show only here.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '#/settings')
    off.unmount()
    stubApi()
    render(<OrdersScreen number={null} />)
    await screen.findByText('PF-20261105-AAAA')
    expect(screen.queryByText('Order emails are off. New orders show only here.')).not.toBeInTheDocument()
  })

  it('never shows the old filter\'s rows as current when a filter change fails, and offers Try again', async () => {
    // Catches All-steps orders left under a Paid filter with no way to retry.
    let fail = true
    stubApi((url) => (url.includes('step=paid') ? (fail ? Response.json({}, { status: 500 }) : pageOf([orderAt('PF-20261102-EEEE', 'paid')])) : pageOf(orders)))
    render(<OrdersScreen number={null} />)
    await screen.findByText('PF-20261105-AAAA')
    fireEvent.change(screen.getByLabelText('Step filter'), { target: { value: 'paid' } })
    expect(await screen.findByText("We couldn't load the orders.")).toBeInTheDocument()
    expect(screen.queryByText('PF-20261105-AAAA')).not.toBeInTheDocument()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('PF-20261102-EEEE')).toBeInTheDocument()
  })

  it('offers Try again when a lookup fails after rows were loaded', async () => {
    // Catches a failed lookup that leaves the list on screen with no retry.
    stubApi((url) => (url.includes('number=') ? Response.json({}, { status: 500 }) : pageOf(orders)))
    render(<OrdersScreen number={null} />)
    await screen.findByText('PF-20261105-AAAA')
    const field = screen.getByLabelText('Order number')
    fireEvent.change(field, { target: { value: 'PF-20261105-ABCD' } })
    fireEvent.submit(field.closest('form') as HTMLFormElement)
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByText('PF-20261105-AAAA')).not.toBeInTheDocument()
  })

  it('dims the old rows while a new filter loads', async () => {
    // Catches a filter change that gives no sign the list is stale.
    let release: (response: Response) => void = () => undefined
    stubApi((url) => (url.includes('step=paid') ? new Promise<Response>((resolve) => (release = resolve)) : pageOf(orders)))
    render(<OrdersScreen number={null} />)
    const row = await screen.findByText('PF-20261105-AAAA')
    fireEvent.change(screen.getByLabelText('Step filter'), { target: { value: 'paid' } })
    const list = row.closest('ul') as HTMLElement
    expect(list).toHaveClass('opacity-50')
    expect(list).toHaveAttribute('aria-busy', 'true')
    await act(async () => undefined) // the request has reached the stub
    await act(async () => release(pageOf([])))
    expect(await screen.findByText('No Paid orders.')).toBeInTheDocument()
  })

  it('shows a not-found line with a way back for a malformed number, and sends nothing', () => {
    // Catches a bad link that costs a 400 and a Try again that fails the same way.
    const urls = stubApi()
    render(<OrdersScreen number="ABC" />)
    expect(screen.getByText("That link isn't an order number.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All orders' })).toHaveAttribute('href', '#/orders')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(urls.some((url) => url.startsWith('/api/orders'))).toBe(false)
  })

  /**
   * Cancels the one open order with restock through its dialog.
   * @param number the order number on the row
   */
  async function cancelOpenOrder(number: string) { // cancels the opened order with restock
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(number) })) // open the row
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel order' })) // the dialog
    const dialog = screen.getByRole('dialog', { hidden: true }) // its box
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel order' })) // confirm
    await screen.findByText(/^Order cancelled/) // answered
  }

  it('reports onRestocked after a restocking cancel in the list', async () => { // a cancel in the list reaches the shell
    // catches: a list that drops the restock news before it reaches the shell
    const onRestocked = vi.fn() // the spy
    stubApi((url) => (url.startsWith('/api/orders/step') ? Response.json({ order: orderAt('PF-20261105-AAAA', 'cancelled'), restocked: 2 }) : pageOf(orders))) // answers set for this case
    render(<OrdersScreen number={null} onRestocked={onRestocked} />) // the screen
    await cancelOpenOrder('PF-20261105-AAAA') // the cancel
    expect(onRestocked).toHaveBeenCalledTimes(1) // called once
  })

  it('reports onRestocked after a restocking cancel in a lookup', async () => { // a cancel in a number lookup reaches the shell
    // catches: a lookup screen that does not pass the callback down
    const onRestocked = vi.fn() // the spy
    stubApi((url) => (url.startsWith('/api/orders/step') ? Response.json({ order: orderAt('PF-20261105-ABCD', 'cancelled'), restocked: 1 }) : pageOf([orderAt('PF-20261105-ABCD', 'new')]))) // answers set for this case
    render(<OrdersScreen number="PF-20261105-ABCD" onRestocked={onRestocked} />) // the screen
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel order' })) // the lookup row is already open
    fireEvent.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Cancel order' })) // confirm
    await screen.findByText(/^Order cancelled/) // answered
    expect(onRestocked).toHaveBeenCalledTimes(1) // called once
  })
})
