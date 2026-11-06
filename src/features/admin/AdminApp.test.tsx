// Tests for the admin shell: the tab bar and its marks, Items kept mounted with its pending changes across tabs, and the leave warning on Orders.

import { act, fireEvent, render, screen, within } from '@testing-library/react' // rendering and events
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API
import { AdminApp } from './AdminApp.tsx' // the code under test
import { clubs } from '@/test/club-fixtures.ts' // shared clubs
import { meta, rows } from '@/test/item-fixtures.ts' // shared items
import { orders } from '@/test/order-fixtures.ts' // shared orders

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown) =>
      Promise.resolve().then(() => {
        const path = String(url).split('?')[0] // the route
        if (path === '/api/meta') return Response.json(meta)
        if (path === '/api/orders') return Response.json({ orders, nextCursor: null })
        if (path === '/api/clubs') return Response.json({ clubs })
        if (path === '/api/settings') return Response.json({ orderEmailOn: true })
        if (path === '/api/settings/prices') return Response.json({ currency: 'SGD', defaultPriceCents: 450 }) // the save's answer
        return Response.json({ items: rows, nextCursor: null })
      }),
    ),
  ) // every route the shell touches
  window.location.hash = '#/items'
})
afterEach(() => {
  vi.unstubAllGlobals() // no stub leaks on
  window.location.hash = '' // no hash leaks on
})

/**
 * Goes to a tab the way a link does.
 * @param hash the new hash
 */
const goTo = (hash: string) =>
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })

describe('AdminApp', () => {
  it('marks the current tab with aria-current and titles the page after it', async () => {
    // Catches a tab bar that does not say where the admin is.
    render(<AdminApp />)
    const nav = screen.getByRole('navigation', { name: 'Admin' })
    expect(within(nav).getByRole('link', { name: 'Items' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Orders' })).not.toHaveAttribute('aria-current')
    expect(within(nav).getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '#/orders')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Items')
    await goTo('#/orders')
    expect(within(nav).getByRole('link', { name: 'Orders' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Orders')
    expect(await screen.findByText('PF-20261105-AAAA')).toBeInTheDocument()
    await goTo('#/settings')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Settings')
    expect(await screen.findByRole('switch')).toBeInTheDocument()
  })

  it('shows the new currency symbol on Items after Settings saves it, with no reload', async () => {
    // Catches an AdminApp that does not hand the saved prices to Items, which keeps the old symbol until a reload.
    render(<AdminApp />)
    await screen.findByText('Knot Tying')
    expect(screen.getAllByText(/RM\s4\.00/).length).toBeGreaterThan(0) // the old symbol
    await goTo('#/settings')
    fireEvent.change(await screen.findByRole('combobox', { name: 'Currency' }), { target: { value: 'SGD' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved.')
    await goTo('#/items')
    expect(screen.getAllByText(/\$4\.00/).length).toBeGreaterThan(0) // the new symbol
    expect(screen.queryByText(/RM\s4\.00/)).not.toBeInTheDocument()
  })

  it('shows four links in order and titles the page Clubs on #/clubs', async () => {
    // Catches a missing or misplaced Clubs link, or a Clubs screen under the wrong title.
    render(<AdminApp />)
    const nav = screen.getByRole('navigation', { name: 'Admin' })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Items', 'Orders', 'Clubs', 'Settings'])
    expect(within(nav).getByRole('link', { name: 'Clubs' })).toHaveAttribute('href', '#/clubs')
    await goTo('#/clubs')
    expect(within(nav).getByRole('link', { name: 'Clubs' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Clubs')
    expect(await screen.findByRole('button', { name: 'Phoenix Club' })).toBeInTheDocument()
  })

  it('keeps a pending stock edit across Items, Orders and back, and flags it on the Items link', async () => {
    // Catches an unmounted Items screen that drops the admin's unsaved edit on a tab change.
    render(<AdminApp />)
    await screen.findByText('Knot Tying')
    fireEvent.click(screen.getByRole('switch', { name: 'Active: Knot Tying' })) // a pending status edit
    expect(screen.getByRole('button', { name: /Save \(1 change/ })).toBeInTheDocument()
    await goTo('#/clubs')
    await screen.findByRole('button', { name: 'Phoenix Club' })
    await goTo('#/orders')
    expect(screen.getByText('changes not saved')).toBeInTheDocument() // the dot's words, still in the page
    expect(within(screen.getByRole('navigation', { name: 'Admin' })).getByRole('link', { name: /Items/ })).toHaveTextContent(
      'changes not saved',
    )
    await goTo('#/settings')
    await goTo('#/items')
    expect(screen.getByRole('switch', { name: 'Active: Knot Tying' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: /Save \(1 change/ })).toBeVisible()
  })

  it('hides the Items screen and its Save pill on other tabs', async () => {
    // Catches a Save pill floating over the Orders list.
    render(<AdminApp />)
    await screen.findByText('Knot Tying')
    fireEvent.click(screen.getByRole('switch', { name: 'Active: Knot Tying' }))
    await goTo('#/orders')
    expect(screen.getByRole('button', { name: /Save \(1 change/, hidden: true })).not.toBeVisible()
  })

  it('still warns before leaving the page while on Orders with edits pending', async () => {
    // Catches a leave warning that goes away with the Items tab.
    render(<AdminApp />)
    await screen.findByText('Knot Tying')
    fireEvent.click(screen.getByRole('switch', { name: 'Active: Knot Tying' }))
    await goTo('#/orders')
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('shows no dot when nothing is pending', async () => {
    // Catches a dot that is always on.
    render(<AdminApp />)
    await screen.findByText('Knot Tying')
    expect(screen.queryByText('changes not saved')).not.toBeInTheDocument()
  })
})
