// Tests for the admin Items screen with fetch stubbed at the boundary: paging, search, sort, editing in rows and the sheet, saving, conflicts, Add, Delete, failures, leaving, Discard and Undo.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react' // rendering and events
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API
import type { AdminItem } from '../../../workers/admin/src/admin-types.ts' // the row shape
import { AdminApp } from './AdminApp.tsx' // the whole page, for the wording check
import { ItemsScreen } from './ItemsScreen.tsx' // the code under test
import { makeItem, meta, rows } from '@/test/item-fixtures.ts' // shared data
import type { ResizeDeps } from './resize-picture.ts' // the passed-in browser pieces

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response> // answers one request
type Routes = { pages?: Handler; meta?: Handler; changes?: Handler; add?: Handler; del?: Handler; picture?: Handler } // one handler per route

const pageOf = (items: AdminItem[], nextCursor: string | null = null) => Response.json({ items, nextCursor }) // a page answer

/**
 * Stubs fetch for every route of the Admin Worker the screen uses.
 * @param routes the handlers that differ from the defaults
 * @return the spy
 */
function stubApi(routes: Routes = {}) {
  const spy = vi.fn((url: unknown, init?: RequestInit) =>
    Promise.resolve().then(() => {
      const path = String(url).split('?')[0] // the route
      const post = init?.method === 'POST' // writes are POSTs
      if (path === '/api/meta') return (routes.meta ?? (() => Response.json(meta)))(String(url), init)
      if (path === '/api/items/changes')
        return (routes.changes ?? (() => Response.json({ items: [] })))(String(url), init)
      if (path === '/api/items/picture')
        return (routes.picture ?? (() => Response.json({}, { status: 500 })))(String(url), init)
      if (path === '/api/items/delete')
        return (routes.del ?? (() => Response.json({ deletedId: 'camp-shirt' })))(String(url), init)
      if (post) return (routes.add ?? (() => Response.json({}, { status: 500 })))(String(url), init)
      return (routes.pages ?? (() => pageOf(rows)))(String(url), init)
    }),
  ) // one answer per call
  vi.stubGlobal('fetch', spy) // the page's fetch
  return spy
}

/**
 * Lists the URLs of the page requests made so far.
 * @param spy the fetch spy
 * @return the GET /api/items URLs
 */
const pageUrls = (spy: ReturnType<typeof stubApi>) =>
  spy.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/api/items?'))

/**
 * Reads the bodies of every POST made so far to one route.
 * @param spy the fetch spy
 * @param path the route
 * @return the parsed bodies
 */
const postBodies = (spy: ReturnType<typeof stubApi>, path = '/api/items/changes') =>
  spy.mock.calls
    .filter(([url, init]) => url === path && (init as RequestInit | undefined)?.method === 'POST')
    .map(([, init]) => JSON.parse((init as RequestInit).body as string))

/**
 * Renders the screen and waits for the rows.
 * @param pictureDeps the fake decoder and canvas for a picture upload
 * @return the render result
 */
async function openScreen(pictureDeps?: ResizeDeps) {
  const view = render(<ItemsScreen pictureDeps={pictureDeps} />) // the screen
  await screen.findByText('Knot Tying') // the rows have loaded
  await act(async () => undefined) // the meta answer too
  return view
}

/** Edits Knot Tying's status to Hidden. */
const hideKnot = () => fireEvent.click(screen.getByRole('switch', { name: 'Active: Knot Tying' }))

/**
 * Opens a row's Item sheet with its Edit button.
 * @param name the item's name
 */
const openSheet = (name: string) => fireEvent.click(screen.getByRole('button', { name: `Edit ${name}` })) // the pencil is the only way in

/**
 * Sets an item's stock in its Item sheet and presses Done.
 * @param name the item's name
 * @param value the stock to commit
 */
function setStockInSheet(name: string, value: string) { // opens the sheet, sets the stepper, presses Done
  openSheet(name) // the sheet
  const input = screen.getByRole('textbox', { name: `Stock of ${name}` }) // the number field
  fireEvent.change(input, { target: { value } }) // type
  fireEvent.blur(input) // commit
  fireEvent.click(screen.getByRole('button', { name: 'Done' })) // into the pending list
}

/**
 * Types a stock for Knot Tying through its sheet.
 * @param value the stock to commit
 */
const typeKnotStock = (value: string) => setStockInSheet('Knot Tying', value) // Knot Tying is the usual item

/**
 * Types into the search box and lets the typing pause pass.
 * @param text the search
 */
async function search(text: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search items' }), { target: { value: text } })
  await act(async () => void vi.advanceTimersByTime(260))
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true }) // time moves, and the tests can jump it
  vi.setSystemTime(new Date('2026-11-03T04:00:00.000Z')) // 3 Nov 2026 in Malaysia
})
afterEach(() => {
  vi.useRealTimers() // back to the clock
  vi.unstubAllGlobals() // no fetch stub leaks on
})

describe('loading', () => {
  it('shows nothing before 300 ms, then eight skeleton rows', async () => {
    // Catches a skeleton that flashes on a quick load, or one that never appears on a slow one.
    stubApi({ pages: () => new Promise<Response>(() => undefined) })
    render(<ItemsScreen />)
    expect(screen.queryAllByTestId('admin-skeleton-row')).toHaveLength(0)
    await act(async () => void vi.advanceTimersByTime(300))
    expect(screen.getAllByTestId('admin-skeleton-row')).toHaveLength(8)
  })

  it('shows the load error with Try again, which loads the rows', async () => {
    // Catches a failed load that leaves a blank page with no way forward.
    let calls = 0
    stubApi({ pages: () => (++calls === 1 ? Response.json({ error: 'server' }, { status: 500 }) : pageOf(rows)) })
    render(<ItemsScreen />)
    expect(await screen.findByText("We couldn't load the items.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Knot Tying')).toBeInTheDocument()
  })

  it('says so when the shop has no items, and still offers Add item', async () => {
    // Catches an empty shop with no explanation and no way to add the first item.
    stubApi({ pages: () => pageOf([]) })
    render(<ItemsScreen />)
    expect(await screen.findByText('Nothing is in the shop yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument()
  })

  it('shows the sign-in line with a Sign in button when the load is signed out', async () => {
    // Catches an expired session shown as an empty list or a plain failure.
    stubApi({ pages: () => Response.json({ error: 'forbidden' }, { status: 403 }) })
    render(<ItemsScreen />)
    expect(await screen.findByText(/Your sign-in has ended/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('rows, search, category and sort', () => {
  it('reads each row as "Category · price · changed date", with no count text, and lists Hidden items', async () => {
    // Catches a count that comes back, a row without its date, or Hidden items missing.
    stubApi()
    await openScreen()
    expect(screen.getByText('Honors · Recreation · RM 4.00 · changed 3 Nov')).toBeInTheDocument() // the row line with its subcategory
    expect(screen.getByText('Shirts · RM 25.00 · changed 3 Nov')).toBeInTheDocument() // a Shirts row has no subcategory part
    expect(document.body.textContent).not.toMatch(/\d+ items?( match|es)?\b/)
    expect(
      within(screen.getByText('Africa Lore').closest('li')!).getByRole('switch', { name: 'Active: Africa Lore' }),
    ).not.toBeChecked()
  })

  it('has a sort control with three options, Recently changed first and selected', async () => {
    // Catches a default other than Recently changed, or a missing option.
    const spy = stubApi()
    await openScreen()
    const sort = screen.getByRole('combobox', { name: 'Sort' })
    expect(
      within(sort)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Recently changed', 'Newest', 'Name A–Z'])
    expect(sort).toHaveValue('changed')
    expect(pageUrls(spy)).toEqual(['/api/items?sort=changed'])
    fireEvent.change(sort, { target: { value: 'name' } })
    await act(async () => undefined)
    expect(pageUrls(spy).at(-1)).toBe('/api/items?sort=name')
  })

  it('lists the fixed categories from /api/meta and filters in D1', async () => {
    // Catches a filter built from the loaded rows, which would hide a category with no row on the page.
    const spy = stubApi()
    await openScreen()
    const category = screen.getByRole('combobox', { name: 'Category' })
    expect(
      within(category)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['All categories', ...meta.categories])
    fireEvent.change(category, { target: { value: 'Shirts' } }) // pick Shirts
    await act(async () => undefined)
    expect(pageUrls(spy).at(-1)).toBe('/api/items?sort=changed&category=Shirts') // the filter reaches D1
  })

  it('searches once after the typing pause', async () => {
    // Catches a request per keystroke.
    const spy = stubApi()
    await openScreen()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search items' }), { target: { value: 'kno' } })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search items' }), { target: { value: 'knot' } })
    expect(pageUrls(spy)).toHaveLength(1)
    await act(async () => void vi.advanceTimersByTime(260))
    expect(pageUrls(spy)).toEqual(['/api/items?sort=changed', '/api/items?sort=changed&q=knot'])
  })

  it('searches at once when Enter is pressed in the search box', async () => {
    // Catches Enter that waits for the pause.
    const spy = stubApi()
    await openScreen()
    const box = screen.getByRole('searchbox', { name: 'Search items' })
    fireEvent.change(box, { target: { value: 'knot' } })
    fireEvent.submit(box.closest('form')!)
    await act(async () => undefined)
    expect(pageUrls(spy).at(-1)).toBe('/api/items?sort=changed&q=knot')
  })

  it('dims the old rows while a new query loads', async () => {
    // Catches rows that vanish into a blank list, or old rows that look current during a search.
    stubApi({ pages: (url) => (url.includes('q=') ? new Promise<Response>(() => undefined) : pageOf(rows)) })
    await openScreen()
    await search('zoo')
    expect(screen.getByText('Knot Tying')).toBeInTheDocument()
    expect(screen.getByTestId('admin-list')).toHaveAttribute('aria-busy', 'true')
  })

  it('says what is empty: a search, a search in a category, and a category', async () => {
    // Catches one generic line for three different empties.
    stubApi({ pages: (url) => (url.includes('q=') || url.includes('category=') ? pageOf([]) : pageOf(rows)) })
    await openScreen()
    await search('zzz')
    expect(await screen.findByText('No items match "zzz".')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'Shirts' } }) // pick Shirts
    expect(await screen.findByText('No items match "zzz" in Shirts.')).toBeInTheDocument() // the empty line names the category
    await search('')
    expect(await screen.findByText('No items in Shirts yet.')).toBeInTheDocument() // the empty line names the category
  })
})

describe('Load more', () => {
  it('appends the next page with "Loading…" between, then says "End of the list."', async () => {
    // Catches a Load more with no feedback, or a list with no end.
    let release: (response: Response) => void = () => undefined
    const spy = stubApi({
      pages: (url) =>
        url.includes('cursor=c1')
          ? new Promise<Response>((resolve) => (release = resolve))
          : pageOf(rows.slice(0, 2), 'c1'),
    })
    await openScreen().catch(() => undefined)
    await screen.findByText('Africa Lore')
    expect(screen.queryByText('End of the list.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByRole('button', { name: 'Loading…' })).toBeInTheDocument()
    await act(async () => release(pageOf(rows.slice(1))))
    expect(await screen.findByText('Knot Tying')).toBeInTheDocument()
    expect(screen.getAllByText('Camp Shirt')).toHaveLength(1)
    expect(screen.getByText('End of the list.')).toBeInTheDocument()
    expect(pageUrls(spy).at(-1)).toBe('/api/items?sort=changed&cursor=c1')
  })

  it('keeps the rows and offers Try again when loading more fails', async () => {
    // Catches a Load more error that replaces the list.
    stubApi({
      pages: (url) => (url.includes('cursor=') ? Response.json({}, { status: 500 }) : pageOf(rows.slice(0, 2), 'c1')),
    })
    render(<ItemsScreen />)
    await screen.findByText('Africa Lore')
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText("We couldn't load more items.")).toBeInTheDocument()
    expect(screen.getByText('Africa Lore')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('failed and signed-out fetches after the first page', () => {
  it('shows the load error with Try again when a search fails while rows are listed, hides Load more, and recovers', async () => {
    // Catches a failed search that leaves stale rows under the new words with no message and a dead Load more.
    let failing = false
    stubApi({
      pages: (url) => (failing && url.includes('q=') ? Response.json({}, { status: 500 }) : pageOf(rows, 'c1')),
    })
    await openScreen()
    failing = true
    await search('knot')
    expect(await screen.findByText("We couldn't load the items.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    failing = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await act(async () => undefined)
    expect(screen.queryByText("We couldn't load the items.")).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument()
  })

  it('shows the load error when a category or sort change fails', async () => {
    // Catches the error line missing for the other two controls.
    let failing = false
    stubApi({ pages: () => (failing ? Response.json({}, { status: 500 }) : pageOf(rows)) })
    await openScreen()
    failing = true
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'Shirts' } }) // pick Shirts
    expect(await screen.findByText("We couldn't load the items.")).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: '' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), { target: { value: 'name' } })
    expect(await screen.findByText("We couldn't load the items.")).toBeInTheDocument()
  })

  it('keeps pending edits safe on a 403 after the first page: new-tab wording and no reload button', async () => {
    // Catches a Sign in button that reloads the page and throws the admin's edits away.
    stubApi({ pages: (url) => (url.includes('cursor=') ? Response.json({}, { status: 403 }) : pageOf(rows, 'c1')) })
    await openScreen()
    typeKnotStock('5')
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(
      await screen.findByText(/Open this page in a new tab to sign in, then try again\. Your changes are kept\./),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
  })
})

describe('the meta', () => {
  it('shows the new symbol and the Add sheet price from the `prices` prop laid over /api/meta', async () => {
    // Catches Items that keeps the old currency and default price after a Settings save.
    stubApi()
    render(<ItemsScreen prices={{ currency: 'SGD', defaultPriceCents: 500 }} />)
    await screen.findByText('Knot Tying')
    await act(async () => undefined) // the meta answer too
    expect(screen.getAllByText(/\$/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/RM/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    expect(screen.getByRole('textbox', { name: 'Price ($)' })).toHaveValue('5.00')
  })

  it('shows "We couldn\'t load the categories." with Reload categories near Add item when /api/meta fails, and recovers', async () => {
    // Catches Add item that stays dead with no word about why.
    let calls = 0
    stubApi({ meta: () => (++calls === 1 ? Response.json({}, { status: 500 }) : Response.json(meta)) })
    render(<ItemsScreen />)
    await screen.findByText('Knot Tying')
    expect(await screen.findByText("We couldn't load the categories.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add item' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Reload categories' }))
    await act(async () => undefined)
    expect(screen.queryByText("We couldn't load the categories.")).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add item' })).toBeEnabled()
  })
})

describe('editing in the sheet and saving', () => {
  it('counts a row edit and a sheet edit, shows the pending values, and sends each `from`', async () => {
    // Catches a sheet edit that never reaches the pending list, or a request without the row's `from`.
    const spy = stubApi({
      changes: () => Response.json({ items: [{ ...rows[2], name: 'Knots', priceCents: 550, stock: 5 }] }),
    })
    await openScreen()
    typeKnotStock('5')
    openSheet('Knot Tying')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Knots' } })
    fireEvent.change(screen.getByLabelText('Price (RM)'), { target: { value: '5.50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('button', { name: 'Save (3 changes)' })).toBeInTheDocument()
    expect(screen.getByText('Honors · Recreation · RM 5.50 · changed 3 Nov')).toBeInTheDocument() // the row line with its subcategory
    expect(within(screen.getByText('Knots').closest('li')!).getByText('Changed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save (3 changes)' }))
    expect(await screen.findByText('Saved 3 changes.')).toBeInTheDocument()
    expect(postBodies(spy)).toEqual([
      {
        changes: [
          {
            id: 'knot-tying',
            name: { from: 'Knot Tying', to: 'Knots' },
            priceCents: { from: 400, to: 550 },
            stock: { from: 12, to: 5 },
          },
        ],
      },
    ])
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument()
  })

  it('keeps the fields it did not save as the admin saw them, so a later rename of a name another admin changed still conflicts', async () => {
    // Catches a save answer that silently refreshes the name, which would let a stale rename overwrite another admin's.
    const spy = stubApi({
      changes: (_url, init) => {
        const change = JSON.parse(init!.body as string).changes[0]
        return change.name === undefined
          ? Response.json({
              items: [{ ...rows[2], name: 'Knot Alpha', priceCents: 550, modifiedAt: '2026-11-03T05:00:00.000Z' }],
            }) // the price saved; another admin renamed it meanwhile
          : Response.json(
              { error: 'conflict', items: [{ ...rows[2], name: 'Knot Alpha', priceCents: 550 }], deletedIds: [] },
              { status: 409 },
            )
      },
    })
    await openScreen()
    openSheet('Knot Tying')
    fireEvent.change(screen.getByLabelText('Price (RM)'), { target: { value: '5.50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    expect(await screen.findByText('Saved 1 change.')).toBeInTheDocument()
    expect(screen.getByText('Knot Tying')).toBeInTheDocument() // still the name the admin saw
    expect(screen.getByText('Honors · Recreation · RM 5.50 · changed 3 Nov')).toBeInTheDocument() // the saved price, the new change time
    expect(screen.getByText('This item has been updated.')).toBeInTheDocument() // the shown name is out of date, so the row says so
    expect(screen.getByText('Latest: Knot Alpha · Honors · Recreation · RM 5.50 · Active · 12 in stock')).toBeInTheDocument() // the Latest line names the subcategory
    openSheet('Nature Walk') // the latest name counts when checking duplicates
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'knot alpha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Another item is already called knot alpha.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    openSheet('Knot Tying')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Knot Beta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    expect(await screen.findByText('This item has been updated.')).toBeInTheDocument()
    expect(postBodies(spy)[1]).toEqual({
      changes: [{ id: 'knot-tying', name: { from: 'Knot Tying', to: 'Knot Beta' } }],
    })
    expect(screen.getByRole('button', { name: 'Save (1 change)' })).toBeInTheDocument() // the rename stays pending
  })

  describe("a flag raised by a save's reply", () => {
    /**
     * Saves Knot Tying's price while another admin has renamed it, so the row is flagged as out of date.
     * @param pagesAnswer answers the page requests
     * @return the fetch spy
     */
    async function openFlaggedKnot(pagesAnswer: Handler = () => pageOf(rows)) {
      const spy = stubApi({
        pages: pagesAnswer,
        changes: (_url, init) => {
          const change = JSON.parse(init!.body as string).changes[0]
          return change.id === 'knot-tying'
            ? Response.json({
                items: [{ ...rows[2], name: 'Knot Alpha', priceCents: 550, modifiedAt: '2026-11-03T05:00:00.000Z' }],
              })
            : Response.json({ items: [{ ...rows[3], stock: 9, modifiedAt: '2026-11-03T05:10:00.000Z' }] })
        },
      })
      await openScreen()
      openSheet('Knot Tying')
      fireEvent.change(screen.getByLabelText('Price (RM)'), { target: { value: '5.50' } })
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
      await screen.findByText('Saved 1 change.')
      expect(screen.getByText('This item has been updated.')).toBeInTheDocument()
      return spy
    }

    it('survives a later save of another row and a Discard', async () => {
      // Catches a flag wiped by an unrelated save or Discard while the row still shows the old name.
      await openFlaggedKnot()
      setStockInSheet('Nature Walk', '9') // leave an unsaved stock of 9 on Nature Walk
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
      expect(screen.getByText('This item has been updated.')).toBeInTheDocument()
      setStockInSheet('Nature Walk', '9') // leave an unsaved stock of 9 on Nature Walk
      fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
      await screen.findByText('Saved 1 change.')
      expect(screen.getByText('This item has been updated.')).toBeInTheDocument()
      expect(screen.getByText('Knot Tying')).toBeInTheDocument() // the Knot Tying row is still listed
    })

    it('is replaced by a later conflict on the row, so Discard never brings the older Latest line back', async () => {
      // Catches an older save-raised "Latest: Knot Alpha" reappearing over a row that a 409 already showed as Knot Gamma.
      const spy = stubApi({
        changes: (_url, init) => {
          const change = JSON.parse(init!.body as string).changes[0]
          return change.name === undefined
            ? Response.json({
                items: [{ ...rows[2], name: 'Knot Alpha', priceCents: 550, modifiedAt: '2026-11-03T05:00:00.000Z' }],
              })
            : Response.json(
                { error: 'conflict', items: [{ ...rows[2], name: 'Knot Gamma', priceCents: 550 }], deletedIds: [] },
                { status: 409 },
              )
        },
      })
      await openScreen()
      openSheet('Knot Tying')
      fireEvent.change(screen.getByLabelText('Price (RM)'), { target: { value: '5.50' } })
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
      await screen.findByText('Saved 1 change.')
      expect(screen.getByText(/^Latest: Knot Alpha/)).toBeInTheDocument()
      openSheet('Knot Tying')
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Knot Beta' } })
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
      expect(await screen.findByText(/^Latest: Knot Gamma/)).toBeInTheDocument()
      expect(screen.queryByText(/^Latest: Knot Alpha/)).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
      expect(screen.queryByText(/^Latest: Knot Alpha/)).not.toBeInTheDocument()
      expect(postBodies(spy)).toHaveLength(2)
    })

    it('clears when a fetch brings the latest values', async () => {
      // Catches a flag that lingers after a refetch already shows the new name.
      let renamed = false
      await openFlaggedKnot(() =>
        pageOf(renamed ? [{ ...rows[2], name: 'Knot Alpha', priceCents: 550 }, ...rows.slice(3)] : rows),
      )
      renamed = true
      await search('knot')
      expect(await screen.findByText('Knot Alpha')).toBeInTheDocument() // the new Knot Alpha row arrived
      expect(screen.queryByText('This item has been updated.')).not.toBeInTheDocument()
    })
  })

  it('lists only the pending rows under Show changes, with no request', async () => {
    // Catches a changes list that refetches, or loses a row that a search moved off the page.
    const spy = stubApi({ pages: (url) => (url.includes('q=') ? pageOf([rows[3]]) : pageOf(rows)) })
    await openScreen()
    typeKnotStock('5')
    await search('nature')
    await screen.findByText('Nature Walk')
    setStockInSheet('Nature Walk', '9') // leave an unsaved stock of 9 on Nature Walk
    const before = pageUrls(spy).length
    fireEvent.click(screen.getByRole('button', { name: 'Show changes (2)' }))
    expect(screen.getByText('Knot Tying')).toBeInTheDocument()
    expect(screen.getByText('Nature Walk')).toBeInTheDocument()
    expect(screen.queryByText('Africa Lore')).not.toBeInTheDocument()
    expect(pageUrls(spy)).toHaveLength(before)
  })

  it('sends one request for a double click on Save', async () => {
    // Catches a double click that sends the same save twice.
    let release: (response: Response) => void = () => undefined
    const spy = stubApi({ changes: () => new Promise<Response>((resolve) => (release = resolve)) })
    await openScreen()
    typeKnotStock('5')
    const save = screen.getByRole('button', { name: 'Save (1 change)' })
    fireEvent.click(save)
    fireEvent.click(save)
    expect(postBodies(spy)).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument()
    await act(async () => undefined) // lets the stub take the request
    await act(async () => release(Response.json({ items: [{ ...rows[2], stock: 5 }] })))
    expect(await screen.findByText('Saved 1 change.')).toBeInTheDocument()
  })

  it('keeps the edits when the save fails or the network drops, and the next Save sends the same change', async () => {
    // Catches a failed save that clears the work, or a retry that loses its `from`.
    let attempts = 0
    const spy = stubApi({
      changes: () => {
        if (++attempts === 1) throw new TypeError('Failed to fetch') // the connection drops
        return Response.json({ items: [{ ...rows[2], stock: 5 }] })
      },
    })
    await openScreen()
    typeKnotStock('5')
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    expect(await screen.findByText("We couldn't save. Your changes are kept. Try again.")).toBeInTheDocument()
    expect(screen.getByText('5 in stock')).toBeInTheDocument() // the row's stock text reads 5
    fireEvent.click(await screen.findByRole('button', { name: 'Save (1 change)' }))
    expect(await screen.findByText('Saved 1 change.')).toBeInTheDocument()
    expect(postBodies(spy)).toEqual([
      { changes: [{ id: 'knot-tying', stock: { from: 12, to: 5 } }] },
      { changes: [{ id: 'knot-tying', stock: { from: 12, to: 5 } }] },
    ])
  })

  it('shows the signed-out note and keeps the edits when the save is refused for a missing session', async () => {
    // Catches an expired session shown as a plain failure the admin retries forever.
    stubApi({ changes: () => Response.json({ error: 'forbidden' }, { status: 403 }) })
    await openScreen()
    typeKnotStock('5')
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    expect(
      await screen.findByText(
        'Your sign-in has ended. Open this page in a new tab to sign in, then save here. Your changes are kept.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save (1 change)' })).toBeInTheDocument()
  })

  it('refuses a name another item has with "Another item is already called …" and keeps the edit', async () => {
    // Catches a name-taken 409 shown as a generic failure, or an edit thrown away.
    stubApi({ changes: () => Response.json({ error: 'name-taken', ids: ['knot-tying'] }, { status: 409 }) })
    await openScreen()
    openSheet('Knot Tying')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Nature Walk 2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    expect(await screen.findByText('Another item is already called Nature Walk 2.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save (1 change)' })).toBeInTheDocument()
  })

  it('blocks a name that another listed item has before any request', async () => {
    // Catches a duplicate that only fails at the Worker.
    const spy = stubApi()
    await openScreen()
    openSheet('Knot Tying')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'nature walk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Another item is already called nature walk.')).toBeInTheDocument()
    expect(postBodies(spy)).toEqual([])
  })
})

describe('conflicts', () => {
  it('flags the row "This item has been updated." with its latest values, keeps the edit pending, and never re-sends it by itself', async () => {
    // Catches a save that overwrites a newer value, or a conflict that re-sends the stale `from` on its own.
    const spy = stubApi({
      changes: (_url, init) =>
        JSON.parse(init!.body as string).changes[0].stock.from === 12
          ? Response.json({ error: 'conflict', items: [{ ...rows[2], stock: 5 }], deletedIds: [] }, { status: 409 })
          : Response.json({ items: [{ ...rows[2], stock: 7 }] }),
    })
    await openScreen()
    typeKnotStock('7')
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    expect(
      await screen.findByText(
        "Some items changed since you opened this page. They're marked: check them and save again.",
      ),
    ).toBeInTheDocument()
    const row = screen.getByText('This item has been updated.').closest('li')!
    expect(within(row).getByText('Latest: Knot Tying · Honors · Recreation · RM 4.00 · Active · 5 in stock')).toBeInTheDocument() // the Latest line names the subcategory
    expect(within(row).getByText('Changed')).toBeInTheDocument()
    expect(screen.getByText('7 in stock')).toBeInTheDocument() // the row's stock text reads 7
    expect(postBodies(spy)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    expect(await screen.findByText('Saved 1 change.')).toBeInTheDocument()
    expect(postBodies(spy)[1]).toEqual({ changes: [{ id: 'knot-tying', stock: { from: 5, to: 7 } }] })
    expect(screen.queryByText('This item has been updated.')).not.toBeInTheDocument()
  })

  it('takes a deleted item off the list and says so', async () => {
    // Catches an edit left on a row another admin deleted, with no word about why.
    stubApi({
      changes: () => Response.json({ error: 'conflict', items: [], deletedIds: ['knot-tying'] }, { status: 409 }),
    })
    await openScreen()
    typeKnotStock('5')
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    expect(await screen.findByText('Items deleted by another admin were taken off the list.')).toBeInTheDocument()
    expect(screen.queryByText('Knot Tying')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument()
  })

  it('rebases and flags a pending row when a refetch shows its edited field moved', async () => {
    // Catches a stale `from` after the list is searched again.
    let moved = false
    const spy = stubApi({
      pages: () => pageOf(moved ? [{ ...rows[2], stock: 20 }] : rows),
      changes: () => Response.json({ items: [] }),
    })
    await openScreen()
    typeKnotStock('5')
    moved = true
    await search('knot')
    expect(await screen.findByText('This item has been updated.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    await act(async () => undefined)
    expect(postBodies(spy)[0]).toEqual({ changes: [{ id: 'knot-tying', stock: { from: 20, to: 5 } }] })
  })
})

describe('subcategories on rows and in the sheet', () => { // the picker, the row line, the save pair
  /**
   * Opens Knot Tying's sheet, changes the fields given and presses Done.
   * @param fields the Category and Subcategory values to pick, when set
   */
  function editKnot(fields: { category?: string; subcategory?: string }) { // opens the sheet, sets the pick, presses Done
    openSheet('Knot Tying') // the sheet
    const sheet = within(screen.getByRole('dialog')) // the toolbar has a Category too
    if (fields.category !== undefined) fireEvent.change(sheet.getByLabelText('Category'), { target: { value: fields.category } }) // the category
    if (fields.subcategory !== undefined) fireEvent.change(sheet.getByLabelText('Subcategory'), { target: { value: fields.subcategory } }) // the subcategory id
    fireEvent.click(sheet.getByRole('button', { name: 'Done' })) // into the pending list
  }

  it('gives Accessories and Shirts rows no subcategory part, and Honors rows theirs', async () => { // the row line
    // catches: a stray separator on rows without a subcategory, or a missing subcategory on Honors rows.
    stubApi({ pages: () => pageOf([rows[1], rows[3], makeItem({ id: 'test-scarf', name: 'Test Scarf', category: 'Accessories', subcategoryId: null, subcategory: null })]) }) // Shirts, Honors · Nature and Accessories
    render(<ItemsScreen />) // the screen
    await screen.findByText('Test Scarf') // the rows have loaded
    expect(screen.getByText('Shirts · RM 25.00 · changed 3 Nov')).toBeInTheDocument() // Shirts
    expect(screen.getByText('Accessories · RM 4.00 · changed 3 Nov')).toBeInTheDocument() // Accessories
    expect(screen.getByText('Honors · Nature · RM 4.00 · changed 3 Nov')).toBeInTheDocument() // Honors with its subcategory
  })

  it('shows a pending subcategory on the row before Save, and Save sends the pair and then shows the saved name with no stale flag', async () => { // the pick through Save
    // catches: a row that keeps the old subcategory name, a request without the pair, or a stale flag after a clean save.
    const spy = stubApi({ // the answers of the Worker
      changes: () => Response.json({ items: [{ ...rows[2], subcategoryId: 5, subcategory: 'Nature', modifiedAt: '2026-11-03T05:00:00.000Z' }] }), // the Worker saves the change
    }) // the Worker saves Nature
    await openScreen() // the rows have loaded
    editKnot({ subcategory: '5' }) // Recreation to Nature
    const knotRow = () => within(screen.getByText('Knot Tying').closest('li')!) // Nature Walk reads the same line, so look inside Knot Tying's row
    expect(knotRow().getByText('Honors · Nature · RM 4.00 · changed 3 Nov')).toBeInTheDocument() // before Save
    expect(knotRow().getByText('Changed')).toBeInTheDocument() // marked
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' })) // save
    expect(await screen.findByText('Saved 1 change.')).toBeInTheDocument() // done
    expect(postBodies(spy)).toEqual([{ changes: [{ id: 'knot-tying', subcategoryId: { from: 8, to: 5 } }] }]) // the pair
    expect(knotRow().getByText('Honors · Nature · RM 4.00 · changed 3 Nov')).toBeInTheDocument() // the saved name
    expect(screen.queryByText('This item has been updated.')).not.toBeInTheDocument() // no stale flag
  })

  it('counts a category change to Shirts as 2 changes, shows Shirts with no subcategory, and sends both pairs', async () => { // the explicit clear
    // catches: a category change that leaves the clear to the Worker, or one that shows the old subcategory.
    const spy = stubApi({ // the answers of the Worker
      changes: () => Response.json({ items: [{ ...rows[2], category: 'Shirts', subcategoryId: null, subcategory: null }] }), // the Worker saves the change
    }) // the Worker saves both
    await openScreen() // the rows have loaded
    editKnot({ category: 'Shirts' }) // Honors to Shirts
    expect(screen.getByRole('button', { name: 'Save (2 changes)' })).toBeInTheDocument() // category and subcategory
    expect(screen.getByText('Shirts · RM 4.00 · changed 3 Nov')).toBeInTheDocument() // no subcategory part
    fireEvent.click(screen.getByRole('button', { name: 'Save (2 changes)' })) // save
    expect(await screen.findByText('Saved 2 changes.')).toBeInTheDocument() // done
    expect(postBodies(spy)).toEqual([ // one request with both pairs
      { changes: [{ id: 'knot-tying', category: { from: 'Honors', to: 'Shirts' }, subcategoryId: { from: 8, to: null } }] }, // the category and subcategory pairs
    ]) // both pairs, the clear explicit
  })

  it('flags a 409 on the subcategory pair with the latest subcategory in the Latest line', async () => { // the guard on the subcategory
    // catches: a conflict flag that hides the subcategory another admin set.
    stubApi({ // the answers of the Worker
      changes: () => Response.json({ error: 'conflict', items: [{ ...rows[2], subcategoryId: 5, subcategory: 'Nature' }], deletedIds: [] }, { status: 409 }), // the Worker answers a conflict
    }) // another admin moved it to Nature
    await openScreen() // the rows have loaded
    editKnot({ subcategory: '2' }) // Recreation to Arts and Crafts
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' })) // save
    const row = (await screen.findByText('This item has been updated.')).closest('li')! // flagged
    expect(within(row).getByText('Latest: Knot Tying · Honors · Nature · RM 4.00 · Active · 12 in stock')).toBeInTheDocument() // the latest subcategory
    expect(within(row).getByText('Changed')).toBeInTheDocument() // the edit stays pending
  })

  it('shows no subcategory under a pending category it does not belong to, even when a refetch brings one', async () => { // never "Shirts · Nature"
    // catches: a row that reads "Shirts · Nature" after another admin's pick arrives under an unsaved category change.
    const bare = { ...rows[2], subcategoryId: null, subcategory: null } // Knot Tying with no subcategory
    stubApi({ pages: (url) => pageOf(url.includes('q=knot') ? [{ ...rows[2], subcategoryId: 5, subcategory: 'Nature' }] : [bare]) }) // a refetch brings Nature
    await openScreen() // the rows have loaded
    editKnot({ category: 'Shirts' }) // Honors to Shirts, no subcategory edit
    await search('knot') // the refetch
    const row = within((await screen.findByText('Knot Tying')).closest('li')!) // the row
    expect(row.getByText('Shirts · RM 4.00 · changed 3 Nov')).toBeInTheDocument() // no Nature part
  })

  it('adds an Honors item with its subcategory at once, and shows the Add failure for a refused misfit', async () => { // Add under the picker
    // catches: an Add that drops the subcategory, or a 400 that closes the sheet.
    const patch = { ...rows[3], id: 'test-patch-21', name: 'Test Patch 21', subcategoryId: 9, subcategory: 'Vocational', status: 'hidden' as const, stock: 0 } // the added row
    let refuse = true // the first Add is refused
    const spy = stubApi({ // the answers of the Worker
      add: () => (refuse ? Response.json({ error: 'invalid' }, { status: 400 }) : Response.json({ item: patch }, { status: 201 })), // the first Add is refused, the next works
      pages: (url) => (url.includes('q=Test+Patch+21') ? pageOf([patch]) : pageOf(rows)), // the search finds the new item
    })
    await openScreen() // the rows have loaded
    fireEvent.click(screen.getByRole('button', { name: 'Add item' })) // the Add sheet
    const sheet = within(screen.getByRole('dialog')) // the toolbar has a Category too
    fireEvent.change(sheet.getByLabelText('Name'), { target: { value: 'Test Patch 21' } }) // a name
    fireEvent.change(sheet.getByLabelText('Category'), { target: { value: 'Honors' } }) // Honors
    fireEvent.change(sheet.getByLabelText('Subcategory'), { target: { value: '9' } }) // Vocational
    await act(async () => void fireEvent.click(sheet.getByRole('button', { name: 'Add item' }))) // refused
    expect(await screen.findByText("We couldn't add the item. Try again.")).toBeInTheDocument() // the line
    expect(screen.getByRole('dialog')).toBeInTheDocument() // the sheet stays
    refuse = false // the next Add works
    await act(async () => void fireEvent.click(sheet.getByRole('button', { name: 'Add item' }))) // again
    expect(postBodies(spy, '/api/items').at(-1)).toEqual({ name: 'Test Patch 21', category: 'Honors', subcategoryId: 9, priceCents: 450 }) // the pick went out
    expect(await screen.findByText('Honors · Vocational · RM 4.00 · changed 3 Nov')).toBeInTheDocument() // the new row's line
  })
})

describe('Add item', () => {
  it('adds at once, moves the search to the new name, and says it starts Hidden', async () => {
    // Catches an added item the admin cannot find in the list, or one that waits for Save.
    const camp = { ...rows[1], id: 'camp-hat', name: 'Camp Hat', status: 'hidden' as const, stock: 0 }
    const spy = stubApi({
      add: () => Response.json({ item: camp }, { status: 201 }),
      pages: (url) => (url.includes('q=Camp+Hat') ? pageOf([camp]) : pageOf(rows)),
    })
    await openScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    const sheet = within(screen.getByRole('dialog')) // the toolbar has a Category too
    expect(sheet.getByLabelText('Price (RM)')).toHaveValue('4.50')
    fireEvent.change(sheet.getByLabelText('Name'), { target: { value: 'Camp Hat' } })
    fireEvent.change(sheet.getByLabelText('Category'), { target: { value: 'Shirts' } }) // pick Shirts
    await act(async () => void fireEvent.click(screen.getAllByRole('button', { name: 'Add item' }).at(-1)!)) // the sheet's button comes after the toolbar's
    expect(postBodies(spy, '/api/items')).toEqual([{ name: 'Camp Hat', category: 'Shirts', subcategoryId: null, priceCents: 450 }]) // the Club-added shirt's category
    expect(await screen.findByText("Added Camp Hat. It's Hidden until you switch it on.")).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search items' })).toHaveValue('Camp Hat')
    expect(pageUrls(spy).at(-1)).toBe('/api/items?sort=changed&q=Camp+Hat')
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument()
  })
})

describe('Delete item', () => {
  it('deletes a Club-added item after confirming, and drops its row and its edits', async () => {
    // Catches a deleted row that stays listed, or an edit that would later be sent for a gone item.
    const spy = stubApi()
    await openScreen()
    setStockInSheet('Camp Shirt', '9') // leave an unsaved stock of 9 on Camp Shirt
    openSheet('Camp Shirt')
    fireEvent.click(screen.getByRole('button', { name: 'Delete item' }))
    await act(async () => void fireEvent.click(screen.getAllByRole('button', { name: 'Delete item' }).at(-1)!))
    expect(postBodies(spy, '/api/items/delete')).toEqual([
      {
        id: 'camp-shirt',
        seen: {
          name: 'Camp Shirt',
          category: 'Shirts', // the Club-added shirt's category
          priceCents: 2500,
          status: 'active',
          stock: 4,
          modifiedAt: '2026-11-03T02:00:00.000Z',
        },
      },
    ])
    expect(screen.queryByText('Camp Shirt')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument()
  })

  it('keeps the dialog open with the reason when the delete gets a 409, flags the row, and a second Delete sends the latest values', async () => {
    // Catches a refused delete that closes everything in silence, or a second Delete that re-sends the stale row.
    const latest = { ...rows[1], stock: 9, modifiedAt: '2026-11-03T06:00:00.000Z' }
    let calls = 0
    const spy = stubApi({
      del: () =>
        ++calls === 1
          ? Response.json({ error: 'conflict', items: [latest] }, { status: 409 })
          : Response.json({ deletedId: 'camp-shirt' }),
    })
    await openScreen()
    openSheet('Camp Shirt')
    fireEvent.click(screen.getByRole('button', { name: 'Delete item' }))
    await act(async () => void fireEvent.click(screen.getAllByRole('button', { name: 'Delete item' }).at(-1)!))
    expect(
      screen.getByText('This item has been updated. Latest: Camp Shirt · Shirts · RM 25.00 · Active · 9 in stock.'), // the Latest line of the shirt
    ).toBeInTheDocument() // the dialog says what changed, so the admin need not close two layers to see it
    expect(screen.getByRole('heading', { name: 'Delete Camp Shirt?' })).toBeInTheDocument()
    expect(screen.getByText('Latest: Camp Shirt · Shirts · RM 25.00 · Active · 9 in stock')).toBeInTheDocument() // the Latest line of the shirt
    expect(postBodies(spy, '/api/items/delete')).toHaveLength(1)
    await act(async () => void fireEvent.click(screen.getAllByRole('button', { name: 'Delete item' }).at(-1)!))
    expect(postBodies(spy, '/api/items/delete')[1].seen).toEqual({
      name: 'Camp Shirt',
      category: 'Shirts', // the Club-added shirt's category
      priceCents: 2500,
      status: 'active',
      stock: 9,
      modifiedAt: '2026-11-03T06:00:00.000Z',
    })
    expect(screen.queryByText('Camp Shirt')).not.toBeInTheDocument()
  })

  it('offers no Delete in the sheet of a built-in item', async () => {
    // Catches a Delete on an item the Worker refuses to delete.
    stubApi()
    await openScreen()
    openSheet('Knot Tying')
    expect(screen.queryByRole('button', { name: 'Delete item' })).not.toBeInTheDocument()
  })
})

describe('leaving and wording', () => {
  it('prevents leaving only while changes are pending', async () => {
    // Catches a leave warning on a clean page, or none on a dirty one.
    stubApi()
    await openScreen()
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(leave()).toBe(false)
    typeKnotStock('5')
    expect(leave()).toBe(true)
    typeKnotStock('12')
    expect(leave()).toBe(false)
  })

  it('never writes the singular word honor on screen, in text or in labels, with a sheet open', async () => { // the word check allows the category Honors
    // Catches the avoided word "honor" (the glossary's Item means anything sold) leaking into screen text; the category name Honors is allowed.
    stubApi()
    render(<AdminApp />)
    await screen.findByText('Knot Tying')
    await act(async () => undefined)
    typeKnotStock('5')
    openSheet('Knot Tying')
    const labels = [...document.querySelectorAll('[aria-label]')].map((element) => element.getAttribute('aria-label'))
    expect(`${document.body.textContent} ${labels.join(' ')}`).not.toMatch(/honor(?!s)/i) // "Honors" passes, "honor" does not
  })
})

describe('Discard and Undo', () => {
  /**
   * Makes two edits and presses Discard.
   * @return the fetch spy
   */
  async function editTwiceAndDiscard() {
    const spy = stubApi()
    await openScreen()
    hideKnot()
    typeKnotStock('5')
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    return spy
  }

  it('clears the edits and the pill and shows the note with Undo', async () => {
    // Catches a Discard that leaves edits, or gives no way back.
    await editTwiceAndDiscard()
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Changed')).not.toBeInTheDocument()
    expect(screen.getByText('Changes discarded')).toBeInTheDocument()
    expect(screen.getByText('12 in stock')).toBeInTheDocument() // the row's stock text reads 12
  })

  it('brings back the same edits and conflict flags with Undo', async () => {
    // Catches an Undo that restores the count but not the flags.
    stubApi({
      changes: () =>
        Response.json({ error: 'conflict', items: [{ ...rows[2], stock: 5 }], deletedIds: [] }, { status: 409 }),
    })
    await openScreen()
    typeKnotStock('7')
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    await screen.findByText('This item has been updated.')
    hideKnot()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.queryByText('This item has been updated.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('button', { name: 'Save (2 changes)' })).toBeInTheDocument()
    expect(screen.getByText('This item has been updated.')).toBeInTheDocument()
  })

  it('removes the note and Undo after 5 s, leaving the stored values alone', async () => {
    // Catches an Undo that never expires, or an expiry that touches the data.
    const spy = await editTwiceAndDiscard()
    await act(async () => void vi.advanceTimersByTime(4900))
    expect(screen.getByText('Changes discarded')).toBeInTheDocument()
    await act(async () => void vi.advanceTimersByTime(200))
    expect(screen.queryByText('Changes discarded')).not.toBeInTheDocument()
    expect(postBodies(spy)).toEqual([])
  })

  it('keeps an edit made while a save is running, when the answer arrives', async () => {
    // Catches a save result that overwrites edits made after Save was pressed.
    let answer: (response: Response) => void = () => undefined // settles the one POST
    stubApi({ changes: () => new Promise<Response>((resolve) => (answer = resolve)) })
    await openScreen()
    typeKnotStock('5')
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    await act(async () => undefined) // the POST has started
    setStockInSheet('Nature Walk', '9') // leave an unsaved stock of 9 on Nature Walk
    await act(async () => answer(Response.json({ items: [{ ...rows[2], stock: 5 }] })))
    expect(await screen.findByText('Saved 1 change.')).toBeInTheDocument()
    expect(screen.getByText('9 in stock')).toBeInTheDocument() // the row's stock text reads 9
    expect(screen.getByRole('button', { name: 'Save (1 change)' })).toBeInTheDocument()
  })

  it('is dead while saving, and does not warn about leaving after Discard', async () => {
    // Catches a Discard during a save, or a leave warning for edits that were thrown away.
    stubApi({ changes: () => new Promise<Response>(() => undefined) })
    await openScreen()
    typeKnotStock('5')
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.getByText('5 in stock')).toBeInTheDocument() // the row's stock text reads 5
  })
})

describe('interruptions', () => {
  it('lets the admin load the next page again after a 403 on Load more, once signed in elsewhere', async () => {
    // Catches a Load more that stays on screen but does nothing after a 403, so the admin must reload and lose the edits.
    let signedIn = false // the other tab has signed in
    const spy = stubApi({
      pages: (url) =>
        url.includes('cursor=c1')
          ? signedIn
            ? pageOf(rows.slice(1))
            : Response.json({}, { status: 403 })
          : pageOf(rows.slice(0, 2), 'c1'),
    })
    render(<ItemsScreen />)
    await screen.findByText('Africa Lore')
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByText(/Your sign-in has ended/)
    signedIn = true // back from the new tab
    const again = screen.queryByRole('button', { name: /Load more|Try again/ }) // whatever the screen offers
    expect(again).not.toBeNull() // something to press
    await act(async () => void fireEvent.click(again!))
    expect(pageUrls(spy).filter((url) => url.includes('cursor=c1'))).toHaveLength(2) // it asked again
    expect(await screen.findByText('Knot Tying')).toBeInTheDocument() // the page arrived
  })

  it('offers no Load more under rows of an old query when a search gets a 403', async () => {
    // Catches a Load more that pairs the old query's cursor with the new search words after the session ends.
    const spy = stubApi({
      pages: (url) => (url.includes('q=') ? Response.json({}, { status: 403 }) : pageOf(rows, 'c1')),
    })
    await openScreen()
    await search('knot')
    await screen.findByText(/Your sign-in has ended/)
    fireEvent.click(screen.queryByRole('button', { name: 'Load more' }) ?? document.body)
    expect(pageUrls(spy).filter((url) => url.includes('cursor='))).toEqual([]) // no mixed request
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('offers Sign in and dims the old rows when a search gets a 403 with no edits pending', async () => {
    // Catches a Try again that only meets the same 403 again, and old rows that look current under new words.
    stubApi({ pages: (url) => (url.includes('q=') ? Response.json({}, { status: 403 }) : pageOf(rows, 'c1')) })
    await openScreen()
    await search('knot')
    await screen.findByText('Your sign-in has ended. Sign in again to see the items.')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-list').className).toContain('opacity-50')
  })

  it('keeps the new-tab wording and Try again, with no Sign in reload, when a search gets a 403 with edits pending', async () => {
    // Catches a reload offered while edits are pending.
    stubApi({ pages: (url) => (url.includes('q=') ? Response.json({}, { status: 403 }) : pageOf(rows, 'c1')) })
    await openScreen()
    typeKnotStock('5')
    await search('knot')
    await screen.findByText(/Open this page in a new tab to sign in, then try again\. Your changes are kept\./)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-list').className).toContain('opacity-50')
  })

  it('keeps pending edits and the Save pill when a search drops mid-page, and Save still sends them', async () => {
    // Catches a failed page fetch that clears or locks the pending edits.
    let failing = false
    const spy = stubApi({
      pages: () => {
        if (failing) throw new TypeError('Failed to fetch') // the connection drops
        return pageOf(rows)
      },
      changes: () => Response.json({ items: [{ ...rows[2], stock: 5 }] }),
    })
    await openScreen()
    typeKnotStock('5')
    failing = true
    await search('knot')
    expect(await screen.findByText("We couldn't load the items.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    expect(await screen.findByText('Saved 1 change.')).toBeInTheDocument()
    expect(postBodies(spy)).toEqual([{ changes: [{ id: 'knot-tying', stock: { from: 12, to: 5 } }] }])
  })

  it('applies a page that arrives during a save without losing or double-counting the edit', async () => {
    // Catches a page landing mid-save that rebases the sent edit into a ghost pending change after the save answers.
    let answer: (response: Response) => void = () => undefined // settles the save
    let page2: (response: Response) => void = () => undefined // settles Load more
    stubApi({
      pages: (url) =>
        url.includes('cursor=c1')
          ? new Promise<Response>((resolve) => (page2 = resolve))
          : pageOf(rows.slice(0, 3), 'c1'),
      changes: () => new Promise<Response>((resolve) => (answer = resolve)),
    })
    render(<ItemsScreen />)
    await screen.findByText('Knot Tying')
    await act(async () => undefined)
    typeKnotStock('5')
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    await act(async () => undefined)
    await act(async () => page2(pageOf([rows[2], rows[3]]))) // the page lists Knot Tying as it was
    await act(async () =>
      answer(Response.json({ items: [{ ...rows[2], stock: 5, modifiedAt: '2026-11-03T05:00:00.000Z' }] })),
    )
    expect(await screen.findByText('Saved 1 change.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Save \(/ })).not.toBeInTheDocument() // nothing left pending
    expect(screen.getByText('Nature Walk')).toBeInTheDocument()
    expect(screen.queryByText(/This item has been updated/)).not.toBeInTheDocument()
  })

  it('keeps the Delete dialog and the row when the network drops mid-delete, and a second Delete finishes it', async () => {
    // Catches a dropped delete that closes the dialog as if it worked, or drops the row early.
    let attempts = 0
    const spy = stubApi({
      del: () => {
        if (++attempts === 1) throw new TypeError('Failed to fetch') // the connection drops
        return Response.json({ deletedId: 'camp-shirt' })
      },
    })
    await openScreen()
    openSheet('Camp Shirt')
    fireEvent.click(screen.getByRole('button', { name: 'Delete item' }))
    await act(async () => void fireEvent.click(screen.getAllByRole('button', { name: 'Delete item' }).at(-1)!))
    expect(screen.getByRole('heading', { name: 'Delete Camp Shirt?' })).toBeInTheDocument() // still asking
    expect(screen.getByText('Camp Shirt', { selector: 'button, a, span, p, h3' })).toBeInTheDocument() // the row is still listed
    await act(async () => void fireEvent.click(screen.getAllByRole('button', { name: 'Delete item' }).at(-1)!))
    expect(postBodies(spy, '/api/items/delete')).toHaveLength(2) // one per press, no more
    expect(screen.queryByText('Camp Shirt')).not.toBeInTheDocument() // gone after the second
  })

  it('removes the leave warning when the screen goes away with changes pending', async () => {
    // Catches a beforeunload listener that outlives the screen and nags on every later page.
    stubApi()
    const view = await openScreen()
    typeKnotStock('5')
    const before = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(before)
    expect(before.defaultPrevented).toBe(true) // warns while pending
    view.unmount()
    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false) // silent once gone
  })

  it('starts a reload with no edits: the pending list does not survive a remount', async () => {
    // Catches edits that quietly come back from storage after a reload and are sent without the admin seeing them.
    const spy = stubApi()
    const view = await openScreen()
    typeKnotStock('5')
    view.unmount() // the reload
    await openScreen()
    expect(screen.queryByRole('button', { name: /^Save \(/ })).not.toBeInTheDocument()
    expect(screen.getByText('12 in stock')).toBeInTheDocument() // the row's stock text reads 12
    expect(postBodies(spy)).toEqual([])
  })
})

describe('picture upload', () => {
  const resized = new Blob(['small'], { type: 'image/webp' }) // what the fake resize hands back
  const deps: ResizeDeps = {
    decode: () => Promise.resolve({ width: 10, height: 10, close: () => undefined } as unknown as ImageBitmap),
    makeCanvas: () =>
      ({
        getContext: () => ({ drawImage: () => undefined }),
        toBlob: (done: (blob: Blob | null) => void) => done(resized),
      }) as unknown as HTMLCanvasElement,
  } // browser pieces jsdom lacks, passed in
  const knotWithPicture = { ...rows[2], image: 'items/knot-tying-1a2b3c4d.webp', modifiedAt: '2026-11-03T03:00:00.000Z' } // the row after the upload

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:preview') // jsdom has no object URLs
    URL.revokeObjectURL = vi.fn()
  })

  /**
   * Opens Knot Tying's sheet, chooses a file and presses Save picture.
   * @param name the name the row shows
   */
  async function uploadForKnot(name = 'Knot Tying') {
    openSheet(name)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement // the hidden input
    fireEvent.change(input, { target: { files: [new File(['x'], 'photo.png', { type: 'image/png' })] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Save picture' }))
  }

  it('replaces the row in place after a saved picture and keeps a pending name edit pending', async () => {
    // Catches a picture save that drops the admin's unsaved edits or reshuffles the list.
    const spy = stubApi({ picture: () => Response.json({ item: knotWithPicture }) })
    await openScreen(deps)
    openSheet('Knot Tying')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Knots' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await uploadForKnot('Knots') // the row shows the pending name
    expect(await screen.findByText('Picture saved.')).toBeInTheDocument()
    const call = spy.mock.calls.find(([url]) => String(url).startsWith('/api/items/picture'))! // the upload
    expect(String(call[0])).toBe('/api/items/picture?id=knot-tying&seen=') // the row had no picture
    expect((call[1] as RequestInit).body).toBe(resized) // the resized bytes
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('button', { name: 'Save (1 change)' })).toBeInTheDocument() // the rename is still pending
    const names = screen.getAllByRole('button', { name: /^Edit / }).map((b) => b.getAttribute('aria-label')) // every row, by its pencil label
    expect(names).toEqual(['Edit Africa Lore', 'Edit Camp Shirt', 'Edit Knots', 'Edit Nature Walk']) // each pencil sits in the row it sat in
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    await screen.findByText('Saved 1 change.')
    expect(postBodies(spy)[0]).toEqual({ changes: [{ id: 'knot-tying', name: { from: 'Knot Tying', to: 'Knots' } }] }) // the guard still names the old name
  })

  it('flags a field another admin changed when a picture is saved, with the latest values', async () => {
    // Catches a picture save that hides another admin's rename behind a fresh change time.
    stubApi({ picture: () => Response.json({ item: { ...knotWithPicture, name: 'Knot Alpha' } }) }) // renamed meanwhile
    await openScreen(deps)
    await uploadForKnot()
    expect(await screen.findByText('Picture saved.')).toBeInTheDocument()
    expect(screen.getAllByText('This item has been updated.').length).toBeGreaterThan(0) // the stale note shows
    expect(screen.getAllByText('Latest: Knot Alpha · Honors · Recreation · RM 4.00 · Active · 12 in stock').length).toBeGreaterThan(0) // with the other admin's values
  })

  /**
   * Saves Knot Tying's price while another admin has renamed it, so the row shows the "Latest: Knot Alpha" note.
   * @param picture answers the later picture upload
   */
  async function openFlaggedKnotForPicture(picture: Handler) {
    stubApi({
      picture,
      changes: () =>
        Response.json({ items: [{ ...rows[2], name: 'Knot Alpha', priceCents: 550, modifiedAt: '2026-11-03T05:00:00.000Z' }] }),
    })
    await openScreen(deps)
    openSheet('Knot Tying')
    fireEvent.change(screen.getByLabelText('Price (RM)'), { target: { value: '5.50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    await screen.findByText('Saved 1 change.')
    expect(screen.getByText('Latest: Knot Alpha · Honors · Recreation · RM 5.50 · Active · 12 in stock')).toBeInTheDocument() // the note is up
    await uploadForKnot()
  }

  it('clears an older save-raised note when a picture save shows nothing else out of date', async () => {
    // Catches a "This item has been updated" note that stays after a picture save whose answer matches what the row shows.
    await openFlaggedKnotForPicture(() =>
      Response.json({ item: { ...knotWithPicture, name: 'Knot Tying', priceCents: 550 } }),
    ) // the answer agrees with the shown values
    expect(await screen.findByText('Picture saved.')).toBeInTheDocument()
    expect(screen.queryByText(/^Latest: /)).not.toBeInTheDocument() // the old note is gone
  })

  it('drops an older save-raised note when a picture conflict brings the latest rows', async () => {
    // Catches an old "Latest: Knot Alpha" line left on a row that a picture conflict just refreshed.
    await openFlaggedKnotForPicture(() =>
      Response.json({ error: 'conflict', items: [{ ...knotWithPicture, name: 'Knot Gamma' }], deletedIds: [] }, { status: 409 }),
    )
    await waitFor(() => expect(screen.getAllByText('Knot Gamma').length).toBeGreaterThan(0)) // the list shows the newest values
    expect(screen.queryByText(/^Latest: /)).not.toBeInTheDocument() // the older note is gone
  })

  it('deletes with the picture save as the guard after an unsaved edit on the same item', async () => {
    // Catches a Delete that sends the old change time and gets a false conflict for the admin's own picture save.
    const campWithPicture = { ...rows[1], image: 'items/camp-shirt-1a2b3c4d.webp', modifiedAt: '2026-11-03T03:00:00.000Z' } // after the upload
    const spy = stubApi({ picture: () => Response.json({ item: campWithPicture }) })
    await openScreen(deps)
    setStockInSheet('Camp Shirt', '9') // leave an unsaved stock of 9 on Camp Shirt
    await uploadForKnot('Camp Shirt')
    expect(await screen.findByText('Picture saved.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete item' }))
    await act(async () => void fireEvent.click(screen.getAllByRole('button', { name: 'Delete item' }).at(-1)!))
    expect(postBodies(spy, '/api/items/delete')[0].seen.modifiedAt).toBe('2026-11-03T03:00:00.000Z') // the new change time
    expect(screen.queryByText('Camp Shirt')).not.toBeInTheDocument() // the row goes
  })

  it('shows the existing signed-out note when the session has ended', async () => {
    // Catches an expired session that reads as a plain failure.
    stubApi({ picture: () => Response.json({}, { status: 403 }) })
    await openScreen(deps)
    await uploadForKnot()
    expect(await screen.findByText(/^Your sign-in has ended\. Open this page in a new tab to sign in, then save here\./)).toBeInTheDocument()
  })

  it('takes the item off the list and closes the sheet when another admin deleted it', async () => {
    // Catches a deleted item left on the list, or a sheet that stays open on a row that is gone.
    stubApi({
      picture: () => Response.json({ error: 'conflict', items: [], deletedIds: ['knot-tying'] }, { status: 409 }),
    })
    await openScreen(deps)
    await uploadForKnot()
    await waitFor(() => expect(screen.queryByText('Knot Tying')).not.toBeInTheDocument()) // the row is gone
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('applies the current row on a conflict and says the item was updated', async () => {
    // Catches a refused upload that leaves the sheet showing the old picture.
    stubApi({
      picture: () => Response.json({ error: 'conflict', items: [knotWithPicture], deletedIds: [] }, { status: 409 }),
    })
    await openScreen(deps)
    await uploadForKnot()
    expect(await screen.findByText('This item has been updated.')).toBeInTheDocument()
    expect(document.querySelector('dialog img')).toHaveAttribute('src', '/pictures/items/knot-tying-1a2b3c4d.webp')
  })
})

describe('picture upload interruptions', () => {
  const resized = new Blob(['small'], { type: 'image/webp' }) // what the fake resize hands back
  const deps: ResizeDeps = {
    decode: () => Promise.resolve({ width: 10, height: 10, close: () => undefined } as unknown as ImageBitmap),
    makeCanvas: () =>
      ({
        getContext: () => ({ drawImage: () => undefined }),
        toBlob: (done: (blob: Blob | null) => void) => done(resized),
      }) as unknown as HTMLCanvasElement,
  } // browser pieces jsdom lacks, passed in
  const stored = { ...rows[2], image: 'items/knot-tying-1a2b3c4d.webp', modifiedAt: '2026-11-03T03:00:00.000Z' } // the row once the Worker has stored the picture

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:preview') // jsdom has no object URLs
    URL.revokeObjectURL = vi.fn()
  })

  /** Opens Knot Tying's sheet and chooses a file, leaving the preview up. */
  async function chooseForKnot() {
    openSheet('Knot Tying')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement // the hidden input
    fireEvent.change(input, { target: { files: [new File(['x'], 'photo.png', { type: 'image/png' })] } })
    await screen.findByRole('button', { name: 'Save picture' })
  }

  /**
   * Counts the uploads sent so far.
   * @param spy the fetch spy
   * @return the number of POSTs to the picture route
   */
  const uploads = (spy: ReturnType<typeof stubApi>) => spy.mock.calls.filter(([url]) => String(url).startsWith('/api/items/picture')).length

  it('keeps the list and the pending edit when the network drops mid-upload, and Try again saves the same picture', async () => {
    // Catches a dropped upload that loses the picture, shows it as saved, or clears the admin's unsaved edit.
    let online = false // the network is down first
    const spy = stubApi({
      picture: () => {
        if (!online) throw new TypeError('Failed to fetch') // the connection drops
        return Response.json({ item: stored })
      },
    })
    await openScreen(deps)
    hideKnot() // an unsaved edit on the same item
    await chooseForKnot()
    fireEvent.click(screen.getByRole('button', { name: 'Save picture' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("The picture wasn't saved.")
    expect(screen.queryByText('Picture saved.')).not.toBeInTheDocument()
    expect(screen.getByAltText('The new picture')).toBeInTheDocument() // the preview stays for Try again, and no stored picture appears
    expect(document.querySelector('dialog img[src^="/pictures/"]')).toBeNull() // the row did not change
    online = true // the connection is back
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Picture saved.')).toBeInTheDocument()
    expect(uploads(spy)).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('button', { name: 'Save (1 change)' })).toBeInTheDocument() // the hidden status is still pending
  })

  it('answers a lost reply with the safe conflict: Try again shows the item was updated and the stored picture', async () => {
    // Catches a retry after a lost reply that overwrites the stored picture or shows the admin a blank sheet.
    let sent = 0 // how many uploads reached the Worker
    const spy = stubApi({
      picture: () => {
        sent += 1
        if (sent === 1) throw new TypeError('Failed to fetch') // the Worker stored it, but the reply never came
        return Response.json({ error: 'conflict', items: [stored], deletedIds: [] }, { status: 409 }) // the second sees a new key
      },
    })
    await openScreen(deps)
    await chooseForKnot()
    fireEvent.click(screen.getByRole('button', { name: 'Save picture' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('This item has been updated.')).toBeInTheDocument()
    expect(document.querySelector('dialog img')).toHaveAttribute('src', '/pictures/items/knot-tying-1a2b3c4d.webp')
    expect(String((spy.mock.calls.filter(([url]) => String(url).startsWith('/api/items/picture')).at(-1) as unknown[])[0])).toBe('/api/items/picture?id=knot-tying&seen=') // the retry still names the key the admin saw
  })

  it('sends one upload for a double click on Save picture through the real hook', async () => {
    // Catches a double click that sends two uploads and leaves an orphan object.
    const spy = stubApi({ picture: () => Response.json({ item: stored }) })
    await openScreen(deps)
    await chooseForKnot()
    const save = screen.getByRole('button', { name: 'Save picture' })
    fireEvent.click(save)
    fireEvent.click(save)
    await screen.findByText('Picture saved.')
    expect(uploads(spy)).toBe(1)
  })

  it.fails('clears the sign-in note once Try again saves after an ended session (known gap: the note stays)', async () => {
    // Catches a stale "Your sign-in has ended ... save here. Your changes are kept." banner beside a saved picture, with no changes pending.
    let signedIn = false // the first request is refused
    stubApi({ picture: () => (signedIn ? Response.json({ item: stored }) : Response.json({}, { status: 403 })) })
    await openScreen(deps)
    await chooseForKnot()
    fireEvent.click(screen.getByRole('button', { name: 'Save picture' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your sign-in has ended.')
    signedIn = true // the admin signed in again in another tab
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Picture saved.')).toBeInTheDocument()
    expect(screen.queryByText(/Your sign-in has ended/)).not.toBeInTheDocument() // no stale sign-in line beside a saved picture
  })
})

describe('read-only rows and the Edit button', () => { // the rows and the sheet that edits stock
  it('has no Stock stepper on any row, an Edit button on each, and the name is not a button', async () => { // rows and the Edit button
    // catches: a stepper left on a row, or the name still being a second way into the sheet
    stubApi() // the default four items
    await openScreen() // the Items screen with its rows loaded
    expect(screen.queryAllByRole('group', { name: /^Stock of / })).toHaveLength(0) // no row carries a stepper
    expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(4) // one pencil per row
    expect(screen.queryByRole('button', { name: 'Knot Tying' })).toBeNull() // the name is text, not a control
    expect(screen.getByText('12 in stock')).toBeInTheDocument() // the stock reads as text
  })

  it('opens the Edit item sheet from the Edit button, and Close and Escape return focus to it', async () => { // rows and the Edit button
    // catches: focus lost to the page top after the sheet closes
    stubApi() // the default four items
    await openScreen() // the Items screen with its rows loaded
    const edit = screen.getByRole('button', { name: 'Edit Knot Tying' }) // Knot Tying's pencil
    edit.focus() // what a keyboard or tap does before pressing
    fireEvent.click(edit) // open the sheet
    expect(screen.getByRole('heading', { name: 'Edit item' })).toBeInTheDocument() // the sheet opened
    fireEvent.click(screen.getByRole('button', { name: 'Close' })) // close it with the button
    expect(edit).toHaveFocus() // Close returned focus to the pencil
    fireEvent.click(edit) // open the sheet again
    fireEvent(screen.getByRole('dialog'), new Event('close')) // what Escape does to a dialog
    expect(edit).toHaveFocus() // Escape returned focus to the pencil too
  })

  it('shows a sheet stock edit on the row as Changed and saves it as one stock pair', async () => { // rows and the Edit button
    // catches: a stock edit that does not reach the row or the request
    const spy = stubApi({ changes: () => Response.json({ items: [{ ...rows[2], stock: 5 }] }) }) // the Worker answers with the saved row
    await openScreen() // the Items screen with its rows loaded
    setStockInSheet('Knot Tying', '5') // Knot Tying 12 → 5 through the sheet
    expect(screen.getByText('5 in stock')).toBeInTheDocument() // the row shows the pending stock
    expect(screen.getByText('Changed')).toBeInTheDocument() // and is marked Changed
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' })) // save the one change
    expect(await screen.findByText('Saved 1 change.')).toBeInTheDocument() // the save finished
    expect(postBodies(spy)).toEqual([{ changes: [{ id: 'knot-tying', stock: { from: 12, to: 5 } }] }]) // the sent body
  })

  it('counts name, price and stock edited in one sheet as 3 changes sent in one save', async () => { // rows and the Edit button
    // catches: Done recording only some of the sheet's fields
    const spy = stubApi({ changes: () => Response.json({ items: [{ ...rows[2], name: 'Knots', priceCents: 550, stock: 5 }] }) }) // the Worker answers with the saved row
    await openScreen() // the Items screen with its rows loaded
    openSheet('Knot Tying') // open Knot Tying's sheet
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Knots' } }) // rename it
    fireEvent.change(screen.getByLabelText('Price (RM)'), { target: { value: '5.50' } }) // new price
    const field = screen.getByRole('textbox', { name: 'Stock of Knots' }) // the stock field, named for the new name
    fireEvent.change(field, { target: { value: '5' } }) // new stock
    fireEvent.blur(field) // commit by leaving the field
    fireEvent.click(screen.getByRole('button', { name: 'Done' })) // all three edits into the pending list
    fireEvent.click(screen.getByRole('button', { name: 'Save (3 changes)' })) // save the three changes
    expect(await screen.findByText('Saved 3 changes.')).toBeInTheDocument() // the save finished
    expect(postBodies(spy)).toHaveLength(1) // all three went in one request
    expect(postBodies(spy)[0].changes[0].stock).toEqual({ from: 12, to: 5 }) // the sent body
  })

  it('adds no change when the sheet stock is left at its old value', async () => { // rows and the Edit button
    // catches: Done recording an unchanged stock as a change
    stubApi() // the default four items
    await openScreen() // the Items screen with its rows loaded
    openSheet('Knot Tying') // open the sheet and change nothing
    fireEvent.click(screen.getByRole('button', { name: 'Done' })) // close it unchanged
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument() // no Save pill: no change was recorded
  })

  it('sizes the skeleton rows to the measured row heights', async () => { // rows and the Edit button
    // catches: skeleton rows that jump when the real rows land
    stubApi({ pages: () => new Promise<Response>(() => undefined) }) // a load that never answers
    render(<ItemsScreen />) // the screen, still loading
    await act(async () => void vi.advanceTimersByTime(300)) // past the 300 ms delay, so the skeleton shows
    expect(screen.getAllByTestId('admin-skeleton-row')[0]).toHaveClass('h-34.5', 'md:h-17.5') // the size classes
  })

  it('loads the first page again with the same filters when the restock count rises, and not on mount', async () => { // the restock reload
    // catches: a screen that ignores the shell's restock count, or reloads on its first render
    const spy = stubApi() // the default four items
    const view = render(<ItemsScreen restocks={0} />) // the screen at count 0
    await screen.findByText('Knot Tying') // the rows have loaded
    await act(async () => undefined) // the meta answer too
    expect(pageUrls(spy)).toHaveLength(1) // only the first load
    view.rerender(<ItemsScreen restocks={0} />) // the same count again
    await act(async () => undefined) // settle
    expect(pageUrls(spy)).toHaveLength(1) // an unchanged count loads nothing
    view.rerender(<ItemsScreen restocks={1} />) // a cancel restocked
    await waitFor(() => expect(pageUrls(spy)).toHaveLength(2)) // one more request
    expect(pageUrls(spy)[1]).toBe(pageUrls(spy)[0]) // the same search, category and sort
  })
})
