// Tests for the admin Items screen with fetch stubbed at the boundary: loading, finding, editing, saving, conflicts, failures, leaving, Discard and Undo.

import { act, fireEvent, render, screen, within } from '@testing-library/react' // rendering and events
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API
import type { AdminHonor } from '../../../workers/admin/src/admin-types.ts' // the row shape
import { AdminApp } from './AdminApp.tsx' // the whole page, for the wording check
import { ItemsScreen } from './ItemsScreen.tsx' // the code under test

const rows: AdminHonor[] = [
  { id: 'africa-lore', name: 'Africa Lore', category: 'Mission', status: 'hidden', stock: 0 },
  { id: 'camp-knots', name: 'Camp Knots', category: 'Recreation', status: 'active', stock: 4 },
  { id: 'knot-tying', name: 'Knot Tying', category: 'Outdoor', status: 'active', stock: 12 },
  { id: 'nature-walk', name: 'Nature Walk', category: 'Nature', status: 'active', stock: 3 },
] // four rows, one Hidden

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response> // answers one request

/**
 * Stubs fetch with a handler; GET /api/items answers the rows unless the handler says otherwise.
 * @param post answers a POST to the changes route
 * @param get answers a GET of the rows
 * @return the spy
 */
function stubApi(post: Handler = () => Response.json({ honors: [] }), get: Handler = () => Response.json(rows)) {
  const spy = vi.fn((url: unknown, init?: RequestInit) =>
    Promise.resolve().then(() => (init?.method === 'POST' ? post(String(url), init) : get(String(url), init))),
  ) // one answer per call
  vi.stubGlobal('fetch', spy) // the page's fetch
  return spy
}

/**
 * Reads the bodies of every POST made so far.
 * @param spy the fetch spy
 * @return the parsed bodies
 */
const postBodies = (spy: ReturnType<typeof stubApi>) =>
  spy.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    .map(([, init]) => JSON.parse((init as RequestInit).body as string))

/**
 * Renders the screen and waits for the rows.
 * @return the render result
 */
async function openScreen() {
  const view = render(<ItemsScreen />) // the screen
  await screen.findByText('Knot Tying') // the rows have loaded
  return view
}

/**
 * Edits Knot Tying's status to Hidden.
 */
const hideKnot = () =>
  fireEvent.click(screen.getByRole('switch', { name: 'Active: Knot Tying' }))

/**
 * Types a stock for Knot Tying.
 * @param value the stock to commit
 */
function typeKnotStock(value: string) {
  const input = screen.getByRole('textbox', { name: 'Stock of Knot Tying' }) // the number field
  fireEvent.change(input, { target: { value } }) // type
  fireEvent.blur(input) // commit
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true })) // time moves, and the tests can jump it
afterEach(() => {
  vi.useRealTimers() // back to the clock
  vi.unstubAllGlobals() // no fetch stub leaks on
})

describe('loading', () => {
  it('shows nothing before 300 ms, then eight skeleton rows', async () => {
    // Catches a skeleton that flashes on a quick load, or one that never appears on a slow one.
    stubApi(undefined, () => new Promise<Response>(() => undefined))
    render(<ItemsScreen />)
    expect(screen.queryAllByTestId('admin-skeleton-row')).toHaveLength(0)
    await act(async () => void vi.advanceTimersByTime(300))
    expect(screen.getAllByTestId('admin-skeleton-row')).toHaveLength(8)
  })

  it('shows the load error with Try again, which loads the rows', async () => {
    // Catches a failed load that leaves a blank page with no way forward.
    let calls = 0
    stubApi(undefined, () =>
      ++calls === 1 ? Response.json({ error: 'server' }, { status: 500 }) : Response.json(rows),
    )
    render(<ItemsScreen />)
    expect(await screen.findByText("We couldn't load the items.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Knot Tying')).toBeInTheDocument()
  })

  it('says so when the shop has no items', async () => {
    // Catches a bare "0 items" with no explanation.
    stubApi(undefined, () => Response.json([]))
    render(<ItemsScreen />)
    expect(await screen.findByText('Nothing is in the shop yet.')).toBeInTheDocument()
  })

  it('shows the sign-in line with a Sign in button when the load is signed out', async () => {
    // Catches an expired session shown as an empty list or a plain failure.
    stubApi(undefined, () => Response.json({ error: 'forbidden' }, { status: 403 }))
    render(<ItemsScreen />)
    expect(await screen.findByText(/Your sign-in has ended/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('finding items', () => {
  it('counts the items, narrows by search and category, shows the no-match line, and lists Hidden items', async () => {
    // Catches a count that ignores the filters, or a list that hides the Hidden items the admin came to edit.
    stubApi()
    await openScreen()
    expect(screen.getByText('4 items')).toBeInTheDocument()
    expect(within(screen.getByText('Africa Lore').closest('li')!).getByRole('switch', { name: 'Active: Africa Lore' })).not.toBeChecked()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search items' }), { target: { value: 'knot' } })
    expect(screen.getByText('2 items match')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'Outdoor' } })
    expect(screen.getByText('1 item matches')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search items' }), { target: { value: 'zzz' } })
    expect(screen.getByText('No items match "zzz" in Outdoor.')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search items' }), { target: { value: '' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: '' } })
    expect(screen.getByText('4 items')).toBeInTheDocument()
  })
})

describe('editing and saving', () => {
  it('counts two edits, and removes the Save pill when both are undone', async () => {
    // Catches a pill that stays after every edit has been set back.
    stubApi()
    await openScreen()
    hideKnot()
    typeKnotStock('5')
    expect(screen.getByRole('button', { name: 'Save (2 changes)' })).toBeInTheDocument()
    expect(within(screen.getByText('Knot Tying').closest('li')!).getByText('Changed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Active: Knot Tying' })) // flipped back
    typeKnotStock('12')
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Changed')).not.toBeInTheDocument()
  })

  it('saves, shows "Saved 2 changes." and drops the pill', async () => {
    // Catches a save that leaves the edits pending, or says nothing.
    const spy = stubApi(() => Response.json({ honors: [{ ...rows[2], status: 'hidden', stock: 5 }] }))
    await openScreen()
    hideKnot()
    typeKnotStock('5')
    fireEvent.click(screen.getByRole('button', { name: 'Save (2 changes)' }))
    expect(await screen.findByText('Saved 2 changes.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument()
    expect(postBodies(spy)).toEqual([
      { changes: [{ id: 'knot-tying', status: { from: 'active', to: 'hidden' }, stock: { from: 12, to: 5 } }] },
    ])
  })

  it('sends one request for a double click on Save', async () => {
    // Catches a double click that sends the same save twice.
    let release: (response: Response) => void = () => undefined
    const spy = stubApi(() => new Promise<Response>((resolve) => (release = resolve)))
    await openScreen()
    typeKnotStock('5')
    const save = screen.getByRole('button', { name: 'Save (1 change)' })
    fireEvent.click(save)
    fireEvent.click(save)
    expect(postBodies(spy)).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument()
    await act(async () => undefined) // lets the stub take the request
    await act(async () => release(Response.json({ honors: [{ ...rows[2], stock: 5 }] })))
    expect(await screen.findByText('Saved 1 change.')).toBeInTheDocument()
  })

  it('keeps the edits and the pill when the save fails', async () => {
    // Catches a failed save that throws the admin's work away.
    stubApi(() => Response.json({ error: 'server' }, { status: 500 }))
    await openScreen()
    typeKnotStock('5')
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    expect(await screen.findByText("We couldn't save. Your changes are kept. Try again.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save (1 change)' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Stock of Knot Tying' })).toHaveValue('5')
  })

  it('shows the conflict note and flag, keeps the edit, and the next save sends the rebased `from`', async () => {
    // Catches a save that overwrites a newer value, or a retry that sends the stale `from` again.
    const spy = stubApi((_url, init) =>
      JSON.parse(init!.body as string).changes[0].stock.from === 12
        ? Response.json({ error: 'conflict', honors: [{ ...rows[2], stock: 5 }] }, { status: 409 })
        : Response.json({ honors: [{ ...rows[2], stock: 7 }] }),
    )
    await openScreen()
    typeKnotStock('7')
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    expect(
      await screen.findByText(
        "Some items changed since you opened this page. They're marked: check them and save again.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Changed since you opened this page: now Active, 5 in stock')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Stock of Knot Tying' })).toHaveValue('7')
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    expect(await screen.findByText('Saved 1 change.')).toBeInTheDocument()
    expect(postBodies(spy)[1]).toEqual({ changes: [{ id: 'knot-tying', stock: { from: 5, to: 7 } }] })
  })

  it('shows the signed-out note and keeps the edits when the save is refused for a missing session', async () => {
    // Catches an expired session shown as a plain failure the admin retries forever.
    stubApi(() => Response.json({ error: 'forbidden' }, { status: 403 }))
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

  it('never writes the word honor on screen, in text or in labels', async () => {
    // Catches the internal word leaking into screen text, which the UI-copy rule forbids.
    stubApi()
    render(<AdminApp />)
    await screen.findByText('Knot Tying')
    typeKnotStock('5')
    const labels = [...document.querySelectorAll('[aria-label]')].map((element) => element.getAttribute('aria-label'))
    expect(`${document.body.textContent} ${labels.join(' ')}`).not.toMatch(/honor/i)
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
    expect(screen.getByRole('textbox', { name: 'Stock of Knot Tying' })).toHaveValue('12')
  })

  it('brings back the same edits, labels and conflict flags with Undo', async () => {
    // Catches an Undo that restores the count but not the flags, or the labels.
    stubApi((_url, init) =>
      JSON.parse(init!.body as string).changes[0].stock.from === 12
        ? Response.json({ error: 'conflict', honors: [{ ...rows[2], stock: 5 }] }, { status: 409 })
        : Response.json({ honors: [] }),
    )
    await openScreen()
    typeKnotStock('7')
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    await screen.findByText('Changed since you opened this page: now Active, 5 in stock')
    hideKnot()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.queryByText(/Changed since you opened this page: now/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('button', { name: 'Save (2 changes)' })).toBeInTheDocument()
    expect(screen.getByText('Changed')).toBeInTheDocument()
    expect(screen.getByText('Changed since you opened this page: now Active, 5 in stock')).toBeInTheDocument()
    expect(screen.queryByText('Changes discarded')).not.toBeInTheDocument()
  })

  it('removes the note and Undo after 5 s, leaving the stored values alone', async () => {
    // Catches an Undo that never expires, or an expiry that touches the data.
    const spy = await editTwiceAndDiscard()
    await act(async () => void vi.advanceTimersByTime(4900))
    expect(screen.getByText('Changes discarded')).toBeInTheDocument()
    await act(async () => void vi.advanceTimersByTime(200))
    expect(screen.queryByText('Changes discarded')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    expect(postBodies(spy)).toEqual([])
  })

  it('closes the note on a new edit', async () => {
    // Catches an Undo that would wipe an edit made after the Discard.
    await editTwiceAndDiscard()
    typeKnotStock('9')
    expect(screen.queryByText('Changes discarded')).not.toBeInTheDocument()
  })

  it('closes the note on a save', async () => {
    // Catches an Undo that would bring back changes the admin already saved over.
    stubApi(() => Response.json({ honors: [{ ...rows[2], stock: 9 }] }))
    await openScreen()
    typeKnotStock('5')
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    typeKnotStock('9')
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    await screen.findByText('Saved 1 change.')
    expect(screen.queryByText('Changes discarded')).not.toBeInTheDocument()
  })

  it('keeps an edit made while a save is running, when the answer arrives', async () => {
    // Catches a save result that overwrites edits made after Save was pressed.
    let answer: (response: Response) => void = () => undefined // settles the one POST
    stubApi(() => new Promise<Response>((resolve) => (answer = resolve)))
    await openScreen()
    typeKnotStock('5')
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    await act(async () => undefined) // the POST has started
    const walk = screen.getByRole('textbox', { name: 'Stock of Nature Walk' }) // jsdom ignores inert, so this edit gets in
    fireEvent.change(walk, { target: { value: '9' } })
    fireEvent.blur(walk)
    await act(async () => {
      answer(Response.json({ honors: [{ ...rows[2], stock: 5 }] }))
    })
    expect(await screen.findByText('Saved 1 change.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Stock of Nature Walk' })).toHaveValue('9')
    expect(screen.getByRole('button', { name: 'Save (1 change)' })).toBeInTheDocument()
  })

  it('clears the failure note when every edit is set back', async () => {
    // Catches "Your changes are kept" staying on screen with nothing left to save.
    stubApi(() => Response.json({ error: 'server' }, { status: 500 }))
    await openScreen()
    typeKnotStock('5')
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    expect(await screen.findByText("We couldn't save. Your changes are kept. Try again.")).toBeInTheDocument()
    typeKnotStock('12')
    expect(screen.queryByText("We couldn't save. Your changes are kept. Try again.")).not.toBeInTheDocument()
  })

  it('is dead while saving', async () => {
    // Catches a Discard during a save that clears edits the Worker is writing.
    stubApi(() => new Promise<Response>(() => undefined))
    await openScreen()
    typeKnotStock('5')
    fireEvent.click(screen.getByRole('button', { name: 'Save (1 change)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.getByRole('textbox', { name: 'Stock of Knot Tying' })).toHaveValue('5')
    expect(screen.queryByText('Changes discarded')).not.toBeInTheDocument()
  })

  it('does not warn about leaving after Discard', async () => {
    // Catches a leave warning for edits that were thrown away.
    await editTwiceAndDiscard()
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})
