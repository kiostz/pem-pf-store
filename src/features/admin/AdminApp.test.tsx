// Tests for the admin shell: the tab bar and its marks, Items kept mounted with its pending changes across tabs, and the leave warning on Orders.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react' // rendering and events
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API
import { AdminApp } from './AdminApp.tsx' // the code under test
import { clubs } from '@/test/club-fixtures.ts' // shared clubs
import { makeItem, meta, rows } from '@/test/item-fixtures.ts' // shared items
import { orderAt, orders } from '@/test/order-fixtures.ts' // shared orders

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

  describe('after a cancel that restocks', () => { // a group for the restocking reload
    /**
     * Stubs fetch with an Items list that changes after the cancel.
     * @param options the answers that differ: the list after the cancel, the cancel's restocked count, the save's answer, and a handler for every item-list request (url and how many lists were asked, this one included)
     * @return the recorded requests, each as [url, method, body]
     */
    function stubStock(options: { after?: () => Response; restocked?: number; changes?: () => Response | Promise<Response>; pages?: (url: string, listed: number) => Response | Promise<Response> } = {}) { // stubs the API with a list that changes after the cancel
      const calls: [string, string, unknown][] = [] // every request made: url, method, body
      let listed = 0 // how many item lists were answered
      vi.stubGlobal('fetch', (url: unknown, init?: RequestInit) => { // the page's fetch, recording each call
        const text = String(url) // the request
        calls.push([text, init?.method ?? 'GET', init?.body]) // record
        return Promise.resolve().then(() => { // answers on a later tick like the network
          const path = text.split('?')[0] // the route
          if (path === '/api/meta') return Response.json(meta) // the meta route
          if (path === '/api/settings') return Response.json({ orderEmailOn: true }) // the settings route
          if (path === '/api/orders') return Response.json({ orders, nextCursor: null }) // the orders list route
          if (path === '/api/orders/step') return Response.json({ order: orderAt('PF-20261105-AAAA', 'cancelled'), restocked: options.restocked ?? 1 }) // the step route answers a cancel with its restocked count
          if (path === '/api/items/changes') return (options.changes ?? (() => Response.json({ items: [] })))() // the save route
          listed += 1 // another list
          if (options.pages !== undefined) return options.pages(text, listed) // a test that answers every list itself
          if (listed === 1) return Response.json({ items: rows, nextCursor: null }) // the first page
          return (options.after ?? (() => Response.json({ items: rows.map((row) => (row.id === 'knot-tying' ? { ...row, stock: 13 } : row)), nextCursor: null })))() // the reload
        })
      })
      return calls // the recorded calls
    }

    /** Cancels the first order with restock, through the Orders tab, and waits for its answer. */
    async function cancelFirstOrder() { // cancels order AAAA with restock through the Orders tab
      await goTo('#/orders') // opens the Orders tab
      fireEvent.click(await screen.findByRole('button', { name: /PF-20261105-AAAA/ })) // opens the order row
      fireEvent.click(screen.getByRole('button', { name: 'Cancel order' })) // opens the Cancel dialog
      fireEvent.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Cancel order' })) // confirms the cancel in the dialog
      await screen.findByText(/^Order cancelled/) // the cancel was answered
    }

    /** Sets Knot Tying's stock to 20 in its sheet and presses Done. */
    function editKnotStock() { // sets Knot Tying's stock to 20 in its sheet and presses Done
      fireEvent.click(screen.getByRole('button', { name: 'Edit Knot Tying' })) // opens Knot Tying's sheet
      const field = screen.getByRole('textbox', { name: 'Stock of Knot Tying' }) // the stock field
      fireEvent.change(field, { target: { value: '20' } }) // types 20
      fireEvent.blur(field) // commits it
      fireEvent.click(screen.getByRole('button', { name: 'Done' })) // records the edit as pending
    }

    /** @return the item-list URLs requested so far */
    const listUrls = (calls: [string, string, unknown][]) => calls.map(([url]) => url).filter((url) => url.startsWith('/api/items?')) // the item-list requests so far

    it('shows the new stock on Items with no page reload, from one more request with the same filters', async () => { // the Items row reloads to the new stock
      // catches: an Items list that keeps the old stock after a restocking cancel, or a reload that drops the search
      const calls = stubStock() // the recorded requests
      render(<AdminApp />) // the shell
      await screen.findByText('Knot Tying') // the rows have loaded
      expect(screen.getByText('12 in stock')).toBeInTheDocument() // Knot Tying before the cancel
      const before = listUrls(calls) // the first load
      await cancelFirstOrder() // the cancel
      await goTo('#/items') // back to the Items tab
      expect(await screen.findByText('13 in stock')).toBeInTheDocument() // Knot Tying after the reload
      const after = listUrls(calls) // with the reload
      expect(after).toHaveLength(before.length + 1) // exactly one reload
      expect(after[after.length - 1]).toBe(before[0]) // the same search, category and sort
    })

    it('sends no new item request for a cancel with restocked 0', async () => { // no restock means no reload
      // catches: a reload after a cancel that changed no stock
      const calls = stubStock({ restocked: 0 }) // the recorded requests
      render(<AdminApp />) // the shell
      await screen.findByText('Knot Tying') // the rows have loaded
      const before = listUrls(calls).length // the first load
      await cancelFirstOrder() // the cancel
      await goTo('#/items') // back to the Items tab
      expect(listUrls(calls)).toHaveLength(before) // no reload
      expect(screen.getByText('12 in stock')).toBeInTheDocument() // Knot Tying before the cancel
    })

    it('keeps a pending stock edit on the restocked item and flags it with the new stock, saving nothing', async () => { // a pending edit survives and is flagged
      // catches: a reload that drops the admin's edit, hides the moved stock, or saves on its own
      const calls = stubStock() // the recorded requests
      render(<AdminApp />) // the shell
      await screen.findByText('Knot Tying') // the rows have loaded
      editKnotStock() // a pending stock edit
      await cancelFirstOrder() // the cancel
      await goTo('#/items') // back to the Items tab
      expect(await screen.findByText('This item has been updated.')).toBeInTheDocument() // the flag shows
      expect(screen.getByText(/Latest: Knot Tying · Honors · Recreation · RM 4\.00 · Active · 13 in stock/)).toBeInTheDocument() // the Latest line names the new stock
      expect(screen.getByRole('button', { name: /Save \(1 change/ })).toBeInTheDocument() // the edit is still pending
      expect(calls.filter(([url]) => url === '/api/items/changes')).toHaveLength(0) // nothing was saved
    })

    it('keeps the pending edits of other items, unflagged', async () => { // other items' edits stay as they were
      // catches: a reload that flags or drops edits on items the cancel did not touch
      stubStock() // answers set for this case
      render(<AdminApp />) // the shell
      await screen.findByText('Knot Tying') // the rows have loaded
      fireEvent.click(screen.getByRole('switch', { name: 'Active: Nature Walk' })) // a pending status edit on another item
      await cancelFirstOrder() // the cancel
      await goTo('#/items') // back to the Items tab
      expect(await screen.findByText('13 in stock')).toBeInTheDocument() // Knot Tying after the reload
      expect(screen.getByRole('switch', { name: 'Active: Nature Walk' })).toHaveAttribute('aria-checked', 'false') // the other item's edit stays
      expect(screen.getByRole('button', { name: /Save \(1 change/ })).toBeInTheDocument() // the edit is still pending
      expect(screen.queryByText('This item has been updated.')).not.toBeInTheDocument() // no flag on it
    })

    it('says "We couldn\'t load the items." with Try again when the reload fails, and keeps the edits', async () => { // a failed reload keeps the list and edits
      // catches: a failed reload that wipes the list or the pending edits
      stubStock({ after: () => Response.json({}, { status: 500 }) }) // answers set for this case
      render(<AdminApp />) // the shell
      await screen.findByText('Knot Tying') // the rows have loaded
      fireEvent.click(screen.getByRole('switch', { name: 'Active: Nature Walk' })) // a pending status edit on another item
      await cancelFirstOrder() // the cancel
      await goTo('#/items') // back to the Items tab
      expect(await screen.findByText("We couldn't load the items.")).toBeInTheDocument() // the load failure line
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument() // the retry button
      expect(screen.getByRole('button', { name: /Save \(1 change/ })).toBeInTheDocument() // the edit is still pending
    })

    it('shows the signed-out line with the edits kept when the reload answers 403', async () => { // a 403 reload keeps the edits
      // catches: a 403 on the reload that loses the edits or reads as a plain failure
      stubStock({ after: () => Response.json({}, { status: 403 }) }) // answers set for this case
      render(<AdminApp />) // the shell
      await screen.findByText('Knot Tying') // the rows have loaded
      fireEvent.click(screen.getByRole('switch', { name: 'Active: Nature Walk' })) // a pending status edit on another item
      await cancelFirstOrder() // the cancel
      await goTo('#/items') // back to the Items tab
      expect( // waits for the line
        await screen.findByText('Your sign-in has ended. Open this page in a new tab to sign in, then try again. Your changes are kept.'), // the signed-out line
      ).toBeInTheDocument() // it shows
      expect(screen.getByRole('button', { name: /Save \(1 change/ })).toBeInTheDocument() // the edit is still pending
    })

    it('shows the newer stock with no flag when the reload lands during a save, keeps an edit made meanwhile, and guards the next stock save with the newer number', async () => { // reload during a save
      // catches: a save's older stock written over the reloaded row, a false updated flag, a lost edit, or a later save sent with the old stock as `from`
      let release: (response: Response) => void = () => undefined // finishes the first save
      let first = true // the first save waits, later ones answer at once
      const calls = stubStock({ // the recorded requests
        changes: () => { // answers each save
          if (!first) return Response.json({ items: [] }) // a later save
          first = false // taken
          return new Promise<Response>((resolve) => (release = resolve)) // the first save waits for release
        },
      }) // the stub is set
      render(<AdminApp />) // the shell
      await screen.findByText('Knot Tying') // the rows have loaded
      fireEvent.click(screen.getByRole('switch', { name: 'Active: Knot Tying' })) // pending: Hidden
      fireEvent.click(screen.getByRole('button', { name: /Save \(1 change/ })) // starts the save
      await waitFor(() => expect(calls.some(([url]) => url === '/api/items/changes')).toBe(true)) // the save request went out
      fireEvent.click(screen.getByRole('switch', { name: 'Active: Nature Walk' })) // an edit made while the save runs
      await cancelFirstOrder() // the reload lands while the save waits
      await waitFor(() => expect(listUrls(calls).length).toBeGreaterThan(1)) // the reload went out
      await act(async () => undefined) // the page is folded in
      release(Response.json({ items: [{ ...rows[2], status: 'hidden', stock: 13, modifiedAt: '2026-11-07T01:00:00.000Z' }] })) // the save's answer, with the newer stock and the write's change time
      await goTo('#/items') // back to the Items tab
      expect(await screen.findByText('Saved 1 change.')).toBeInTheDocument() // the save finished
      const knotRow = screen.getByText('Knot Tying').closest('li') as HTMLElement // Knot Tying's row
      expect(within(knotRow).getByText('13 in stock')).toBeInTheDocument() // the row's own stock is the newer one
      expect(within(knotRow).getByRole('switch', { name: 'Active: Knot Tying' })).toHaveAttribute('aria-checked', 'false') // the saved status shows
      expect(screen.queryByText('This item has been updated.')).not.toBeInTheDocument() // no false flag
      expect(screen.getByRole('switch', { name: 'Active: Nature Walk' })).toHaveAttribute('aria-checked', 'false') // the edit made during the save is still pending
      expect(screen.getByRole('button', { name: /Save \(1 change/ })).toBeInTheDocument() // one change is left: the sent edit is gone
      editKnotStock() // a stock edit to 20 after the fold
      fireEvent.click(screen.getByRole('button', { name: /Save \(2 changes/ })) // the second save
      await waitFor(() => expect(calls.filter(([url]) => url === '/api/items/changes')).toHaveLength(2)) // it went out
      const body = JSON.parse(calls.filter(([url]) => url === '/api/items/changes')[1][2] as string) // its request body
      expect(body.changes.find((change: { id: string }) => change.id === 'knot-tying').stock).toEqual({ from: 13, to: 20 }) // guarded by the newer stock
    })

    it('keeps the reloaded row when the reload read D1 after the save wrote and the save answers last with the older stock', async () => { // reload newer than the save answer
      // catches: a save's older answer written over a reload that already holds the save and a newer stock
      let release: (response: Response) => void = () => undefined // finishes the save
      const wrote = '2026-11-07T01:00:00.000Z' // when the save wrote
      const calls = stubStock({ // the recorded requests
        changes: () => new Promise<Response>((resolve) => (release = resolve)), // the save waits for release
        after: () => Response.json({ items: rows.map((row) => (row.id === 'knot-tying' ? { ...row, status: 'hidden', stock: 13, modifiedAt: wrote } : row)), nextCursor: null }), // the reload read D1 after the write and the restock
      }) // the stub is set
      render(<AdminApp />) // the shell
      await screen.findByText('Knot Tying') // the rows have loaded
      fireEvent.click(screen.getByRole('switch', { name: 'Active: Knot Tying' })) // pending: Hidden
      fireEvent.click(screen.getByRole('button', { name: /Save \(1 change/ })) // starts the save
      await waitFor(() => expect(calls.some(([url]) => url === '/api/items/changes')).toBe(true)) // the save request went out
      await cancelFirstOrder() // the restock and the reload land while the save waits
      await waitFor(() => expect(listUrls(calls).length).toBeGreaterThan(1)) // the reload went out
      await act(async () => undefined) // the page is folded in
      release(Response.json({ items: [{ ...rows[2], status: 'hidden', stock: 12, modifiedAt: wrote }] })) // the save's answer: its own write, before the restock
      await goTo('#/items') // back to the Items tab
      expect(await screen.findByText('Saved 1 change.')).toBeInTheDocument() // the save finished
      const knotRow = screen.getByText('Knot Tying').closest('li') as HTMLElement // Knot Tying's row
      expect(within(knotRow).getByText('13 in stock')).toBeInTheDocument() // the row keeps the reloaded stock
      expect(within(knotRow).getByRole('switch', { name: 'Active: Knot Tying' })).toHaveAttribute('aria-checked', 'false') // the saved status shows
      expect(screen.queryByText('This item has been updated.')).not.toBeInTheDocument() // no flag
      expect(screen.queryByRole('button', { name: /Save \(/ })).not.toBeInTheDocument() // nothing pending
    })

    it('goes back to page one with the same search after Load more, and drops the extra rows', async () => { // a reload after Load more
      // catches: a reload that keeps the Load-more rows on top of page one, appends page one twice, or loses the cursor so Load more disappears
      const calls = stubStock({ // every list is answered here
        pages: (url, listed) => { // page one, the next page, then the reload
          if (url.includes('cursor=')) return Response.json({ items: [makeItem({ id: 'zebra', name: 'Zebra Lore' })], nextCursor: null }) // the next page
          const stock = listed >= 3 ? 13 : 12 // the reload (third list) reads the restock
          return Response.json({ items: rows.map((row) => (row.id === 'knot-tying' ? { ...row, stock } : row)), nextCursor: 'c1' }) // page one, with a next page
        },
      }) // the stub is set
      render(<AdminApp />) // the shell
      await screen.findByText('Knot Tying') // page one has loaded
      fireEvent.click(screen.getByRole('button', { name: 'Load more' })) // the next page
      await screen.findByText('Zebra Lore') // it is listed
      await cancelFirstOrder() // the restocking cancel
      await goTo('#/items') // back to Items
      await waitFor(() => expect(screen.getByText('13 in stock')).toBeInTheDocument()) // the reload landed
      expect(screen.queryByText('Zebra Lore')).not.toBeInTheDocument() // the Load-more row is gone
      expect(screen.getAllByText('Knot Tying')).toHaveLength(1) // page one is listed once
      expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument() // there is a next page again
      expect(listUrls(calls)[2]).toBe(listUrls(calls)[0]) // the reload asks for page one, no cursor
    })

    it('replaces a first load that is still running with the reload, so the rows come from the newer read', async () => { // a cancel while the first load runs
      // catches: a late first-load answer that lands after the reload and shows the old stock
      let releaseFirst: (response: Response) => void = () => undefined // finishes the first load
      stubStock({ // every list is answered here
        pages: (_url, listed) => { // the first list waits, the reload answers at once
          if (listed === 1) return new Promise<Response>((resolve) => (releaseFirst = resolve)) // the first load waits
          return Response.json({ items: rows.map((row) => (row.id === 'knot-tying' ? { ...row, stock: 13 } : row)), nextCursor: null }) // the reload reads the restock
        },
      }) // the stub is set
      render(<AdminApp />) // the shell, first load running
      await cancelFirstOrder() // the restocking cancel while Items is still loading
      await goTo('#/items') // back to Items
      await screen.findByText('13 in stock') // the reload's rows
      await act(async () => releaseFirst(Response.json({ items: rows, nextCursor: null }))) // the first load answers late, with the old stock
      expect(screen.getByText('13 in stock')).toBeInTheDocument() // the late answer was ignored
      expect(screen.queryByText('12 in stock')).not.toBeInTheDocument() // no old stock
    })

    it('keeps the rows and the pending edit when the network drops during the reload, and Try again loads the new stock', async () => { // a dropped reload
      // catches: a thrown fetch that empties the list or loses the pending edit
      let drop = true // the reload fails once
      stubStock({ // every list is answered here
        pages: (_url, listed) => { // the first list answers, the reload drops, then it recovers
          if (listed === 2 && drop) { drop = false; throw new TypeError('Failed to fetch') } // the network drops
          return Response.json({ items: rows.map((row) => (row.id === 'knot-tying' && listed > 1 ? { ...row, stock: 13 } : row)), nextCursor: null }) // the lists
        },
      }) // the stub is set
      render(<AdminApp />) // the shell
      await screen.findByText('Knot Tying') // the rows have loaded
      fireEvent.click(screen.getByRole('switch', { name: 'Active: Nature Walk' })) // a pending edit
      await cancelFirstOrder() // the restocking cancel
      await goTo('#/items') // back to Items
      expect(await screen.findByText("We couldn't load the items.")).toBeInTheDocument() // the failure line
      expect(screen.getByText('Knot Tying')).toBeInTheDocument() // the rows stay
      expect(screen.getByText('12 in stock')).toBeInTheDocument() // the old stock stays until a read succeeds
      expect(screen.getByRole('button', { name: /Save \(1 change/ })).toBeInTheDocument() // the edit stays
      fireEvent.click(screen.getByRole('button', { name: 'Try again' })) // retry
      expect(await screen.findByText('13 in stock')).toBeInTheDocument() // the new stock shows
      expect(screen.getByRole('button', { name: /Save \(1 change/ })).toBeInTheDocument() // still pending
    })

    it('keeps a pending category change across the reload, unflagged, and sends its pair and the cleared subcategory with the old values as `from`', async () => { // a category edit during a restock reload
      // catches: a reload rebase that drops a category or subcategory edit, flags it falsely, or sends the new stock as the guard for a field the admin did not edit
      const calls = stubStock() // the recorded requests
      render(<AdminApp />) // the shell
      await screen.findByText('Knot Tying') // the rows have loaded
      fireEvent.click(screen.getByRole('button', { name: 'Edit Knot Tying' })) // opens the sheet
      fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Category'), { target: { value: 'Shirts' } }) // Honors to Shirts in the sheet's own select
      fireEvent.click(screen.getByRole('button', { name: 'Done' })) // pending: category and the cleared subcategory
      expect(screen.getByRole('button', { name: /Save \(2 changes/ })).toBeInTheDocument() // two changes
      await cancelFirstOrder() // the restock reload lands
      await goTo('#/items') // back to Items
      await screen.findByText('13 in stock') // the reload's stock
      const knotRow = screen.getByText('Knot Tying').closest('li') as HTMLElement // Knot Tying's row
      expect(within(knotRow).getByText(/^Shirts · /)).toBeInTheDocument() // the pending category shows, with no subcategory part
      expect(screen.queryByText('This item has been updated.')).not.toBeInTheDocument() // no false flag
      expect(screen.getByRole('button', { name: /Save \(2 changes/ })).toBeInTheDocument() // both edits stay
      fireEvent.click(screen.getByRole('button', { name: /Save \(2 changes/ })) // saves
      await waitFor(() => expect(calls.some(([url]) => url === '/api/items/changes')).toBe(true)) // the request went out
      const body = JSON.parse(calls.find(([url]) => url === '/api/items/changes')![2] as string) // its body
      expect(body.changes).toEqual([{ id: 'knot-tying', category: { from: 'Honors', to: 'Shirts' }, subcategoryId: { from: 8, to: null } }]) // the pairs, with no stock pair
    })

    it('shows the saved category and no subcategory, unflagged, when the reload lands during a category save', async () => { // the subcategory merge with the reload fold
      // catches: a fold that keeps the reloaded Recreation name beside the saved Shirts category, or flags the row as updated
      let release: (response: Response) => void = () => undefined // finishes the save
      const wrote = '2026-11-07T01:00:00.000Z' // when the save wrote
      const calls = stubStock({ changes: () => new Promise<Response>((resolve) => (release = resolve)) }) // the save waits
      render(<AdminApp />) // the shell
      await screen.findByText('Knot Tying') // the rows have loaded
      fireEvent.click(screen.getByRole('button', { name: 'Edit Knot Tying' })) // opens the sheet
      fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Category'), { target: { value: 'Shirts' } }) // Honors to Shirts in the sheet's own select
      fireEvent.click(screen.getByRole('button', { name: 'Done' })) // pending
      fireEvent.click(screen.getByRole('button', { name: /Save \(2 changes/ })) // starts the save
      await waitFor(() => expect(calls.some(([url]) => url === '/api/items/changes')).toBe(true)) // sent
      await cancelFirstOrder() // the reload lands during the save
      await waitFor(() => expect(listUrls(calls).length).toBeGreaterThan(1)) // the reload went out
      await act(async () => undefined) // folded in
      release(Response.json({ items: [{ ...rows[2], category: 'Shirts', subcategoryId: null, subcategory: null, stock: 13, modifiedAt: wrote }] })) // the save's answer
      await goTo('#/items') // back to Items
      expect(await screen.findByText('Saved 2 changes.')).toBeInTheDocument() // the save finished
      const knotRow = screen.getByText('Knot Tying').closest('li') as HTMLElement // Knot Tying's row
      expect(within(knotRow).getByText(/^Shirts · /)).toBeInTheDocument() // the saved category, no subcategory part
      expect(within(knotRow).queryByText(/Recreation/)).not.toBeInTheDocument() // the old subcategory is gone
      expect(within(knotRow).getByText('13 in stock')).toBeInTheDocument() // the newer stock
      expect(screen.queryByText('This item has been updated.')).not.toBeInTheDocument() // no false flag
    })
  })
})
