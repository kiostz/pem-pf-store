// Tests for the Clubs screen: the rows and their grey lines, the six states, Move up and Move down with focus kept, the notes, and the sheet and dialog it opens.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react' // rendering and events
import { afterEach, describe, expect, it, vi } from 'vitest' // test API
import type { AdminClub } from '../../../workers/admin/src/admin-types.ts' // the club shape
import { SIGNED_OUT_NOTE } from './admin-api.ts' // the 403 line
import { clubs, makeClub } from '@/test/club-fixtures.ts' // shared clubs
import { ClubsScreen } from './ClubsScreen.tsx' // the code under test

type Post = (path: string, body: Record<string, unknown>) => Response | Promise<Response> // answers one write

/**
 * Stubs fetch: GET /api/clubs reads `list`, a POST goes to `post`.
 * @param list what the read answers (or a status to fail with)
 * @param post answers a write
 * @return the spy
 */
function stubClubs(list: AdminClub[] | 403 | 500, post: Post = () => Response.json({}, { status: 500 })) {
  const spy = vi.fn((url: unknown, init?: RequestInit) =>
    Promise.resolve().then(() => {
      if (init?.method === 'POST') return post(String(url), JSON.parse(init.body as string))
      return typeof list === 'number' ? Response.json({}, { status: list }) : Response.json({ clubs: list })
    }),
  )
  vi.stubGlobal('fetch', spy) // the page's fetch
  return spy
}

/**
 * Lists the writes a spy has seen.
 * @param spy the fetch spy
 * @return each POST's path and parsed body
 */
const writes = (spy: ReturnType<typeof stubClubs>) =>
  spy.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([url, init]) => ({ path: String(url), body: JSON.parse((init as RequestInit).body as string) as Record<string, unknown> }))

afterEach(() => {
  vi.unstubAllGlobals() // no stub leaks on
  vi.useRealTimers() // no fake clock leaks on
})

describe('ClubsScreen', () => {
  it('lists the clubs in order with the grey line joined by dots, and none for a club with no details', async () => {
    // Catches a wrong order, a line with empty pieces, or an empty grey line under a plain club.
    stubClubs(clubs)
    render(<ClubsScreen />)
    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(10)
    expect(within(rows[0]!).getByRole('button', { name: 'Alpha Club' })).toBeInTheDocument()
    expect(within(rows[3]!).getByRole('button', { name: 'Phoenix Club' })).toBeInTheDocument()
    expect(within(rows[3]!).getByText('Petaling Jaya · English · Phoenix SDA Church')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('Klang')).toBeInTheDocument()
    expect(rows[0]!.querySelectorAll('p')).toHaveLength(0)
  })

  it('shows nothing before 300 ms and then a skeleton', async () => {
    // Catches a spinner flash on a quick load.
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<ClubsScreen />)
    await act(() => vi.advanceTimersByTimeAsync(299))
    expect(screen.queryAllByTestId('club-skeleton-row')).toHaveLength(0)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(screen.getAllByTestId('club-skeleton-row').length).toBeGreaterThan(0)
  })

  it('shows the empty state with Add club', async () => {
    // Catches a bare blank screen for a list with no clubs.
    stubClubs([])
    render(<ClubsScreen />)
    expect(await screen.findByText("No clubs yet. Buyers type their club's name when they order.")).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add club' })).toHaveLength(1)
  })

  it('shows the load error with Try again that fetches again, and the signed-out line for a 403', async () => {
    // Catches a failed load with no way out, or a 403 shown as a plain error.
    const spy = stubClubs(500)
    render(<ClubsScreen />)
    expect(await screen.findByText("We couldn't load the clubs.")).toBeInTheDocument()
    stubClubs(clubs)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Phoenix Club' })).toBeInTheDocument()
    expect(spy).toHaveBeenCalledTimes(1)
    stubClubs(403)
    render(<ClubsScreen />)
    expect(await screen.findByText(SIGNED_OUT_NOTE)).toBeInTheDocument()
  })

  it('moves Phoenix Club up by swapping two ids, keeps focus on the button and says where it went', async () => {
    // Catches a wrong swap, focus lost to the page when the row moves, or no word for a screen reader.
    const moved = [clubs[0]!, clubs[1]!, clubs[3]!, clubs[2]!, ...clubs.slice(4)]
    const spy = stubClubs(clubs, () => Response.json({ clubs: moved }))
    render(<ClubsScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Move Phoenix Club up' }))
    await screen.findByText('Phoenix Club moved to 3 of 10.')
    expect(writes(spy)).toEqual([
      { path: '/api/clubs/order', body: { from: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], to: [1, 2, 4, 3, 5, 6, 7, 8, 9, 10] } },
    ])
    expect(screen.getByRole('button', { name: 'Move Phoenix Club up' })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('Phoenix Club moved to 3 of 10.')
  })

  it('moves focus to the other move button when the pressed one disappears at an end', async () => {
    // Catches focus dropping to the page body after a move to the top.
    const moved = [clubs[1]!, clubs[0]!, ...clubs.slice(2)]
    stubClubs(clubs, () => Response.json({ clubs: moved }))
    render(<ClubsScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Move Beta Club up' }))
    await screen.findByText('Beta Club moved to 1 of 10.')
    expect(screen.queryByRole('button', { name: 'Move Beta Club up' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move Beta Club down' })).toHaveFocus()
  })

  it('has no Move up on the first row and no Move down on the last', async () => {
    // Catches buttons that offer a move the Worker would refuse.
    stubClubs(clubs)
    render(<ClubsScreen />)
    await screen.findByRole('button', { name: 'Alpha Club' })
    expect(screen.queryByRole('button', { name: 'Move Alpha Club up' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move Alpha Club down' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move Iota Club down' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move Iota Club up' })).toBeInTheDocument()
  })

  it('sends one request for a double click on a move', async () => {
    // Catches a double tap that moves a club two places.
    const spy = stubClubs(clubs, () => new Promise<Response>(() => {}))
    render(<ClubsScreen />)
    const button = await screen.findByRole('button', { name: 'Move Phoenix Club up' })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(writes(spy)).toHaveLength(1))
    fireEvent.click(button)
    expect(writes(spy)).toHaveLength(1)
  })

  it('leaves the order unchanged after a failed move and offers Try again that sends it again', async () => {
    // Catches a failed move that looks saved, or one with no retry.
    let fail = true
    const spy = stubClubs(clubs, () =>
      fail ? Response.json({}, { status: 500 }) : Response.json({ clubs: [clubs[1]!, clubs[0]!, ...clubs.slice(2)] }),
    )
    render(<ClubsScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Move Beta Club up' }))
    expect(await screen.findByText("The club wasn't saved.")).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Beta Club')
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('Beta Club moved to 1 of 10.')
    expect(writes(spy)).toHaveLength(2)
  })

  it('replaces the list on a conflict and says the list was changed in another tab', async () => {
    // Catches a stale list kept after another tab changed it.
    const latest = [clubs[2]!, ...clubs.slice(0, 2), ...clubs.slice(3)]
    stubClubs(clubs, () => Response.json({ error: 'conflict', clubs: latest }, { status: 409 }))
    render(<ClubsScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Move Beta Club up' }))
    expect(await screen.findByText('The club list was changed in another tab. It now shows the latest.')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Gamma Club')
  })

  it('adds a club through the sheet, closes it and says "Lions added."', async () => {
    // Catches an Add that leaves the sheet open or gives no word that it saved.
    const lions = makeClub({ id: 11, name: 'Lions', churchName: 'Klang SDA Church' })
    const spy = stubClubs(clubs, () => Response.json({ clubs: [...clubs, lions] }, { status: 201 }))
    render(<ClubsScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add club' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lions' } })
    fireEvent.change(screen.getByLabelText('Church name'), { target: { value: 'Klang SDA Church' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add club' }))
    expect(await screen.findByText('Lions added.')).toBeInTheDocument()
    expect(writes(spy)[0]).toEqual({
      path: '/api/clubs',
      body: { name: 'Lions', area: null, language: null, location: null, churchName: 'Klang SDA Church' },
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(11)
  })

  it('edits a club with the values it saw as from and says "Club saved."', async () => {
    // Catches an edit sent without the guard values, so another tab's change is overwritten.
    const renamed = clubs.map((club) => (club.id === 4 ? { ...club, name: 'Phoenix Club 2' } : club))
    const spy = stubClubs(clubs, () => Response.json({ clubs: renamed }))
    render(<ClubsScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Phoenix Club' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Phoenix Club 2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Club saved.')).toBeInTheDocument()
    const { path, body } = writes(spy)[0]!
    expect(path).toBe('/api/clubs/edit')
    expect(body).toEqual({
      id: 4,
      from: { name: 'Phoenix Club', area: 'Petaling Jaya', language: 'English', location: null, churchName: 'Phoenix SDA Church' },
      to: { name: 'Phoenix Club 2', area: 'Petaling Jaya', language: 'English', location: null, churchName: 'Phoenix SDA Church' },
    })
    expect(screen.getByRole('button', { name: 'Phoenix Club 2' })).toBeInTheDocument()
  })

  it('removes a club after the dialog, sending what it saw, and says "Phoenix Club removed."', async () => {
    // Catches a Remove that skips the question or sends no guard.
    const rest = clubs.filter((club) => club.id !== 4)
    const spy = stubClubs(clubs, () => Response.json({ clubs: rest }))
    render(<ClubsScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Phoenix Club' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove club' }))
    expect(screen.getByRole('heading', { name: 'Remove Phoenix Club?' })).toBeInTheDocument()
    expect(writes(spy)).toHaveLength(0)
    const dialogs = screen.getAllByRole('dialog')
    fireEvent.click(within(dialogs[dialogs.length - 1]!).getByRole('button', { name: 'Remove club' }))
    expect(await screen.findByText('Phoenix Club removed.')).toBeInTheDocument()
    expect(writes(spy)[0]!.path).toBe('/api/clubs/remove')
    expect(writes(spy)[0]!.body).toMatchObject({ id: 4, seen: { name: 'Phoenix Club' } })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(9)
    expect(screen.getByRole('button', { name: 'Add club' })).toHaveFocus() // the club's own button is gone, so focus must not fall to the page
  })

  it('keeps the sheet open after an edit conflict, and the second Save keeps the other tab\'s rename and the typed Area', async () => {
    // Catches a conflict that closes the sheet, drops the typing, or resends a stale field that undoes another tab's change.
    const latest = clubs.map((club) => (club.id === 4 ? { ...club, name: 'Phoenix Club B' } : club))
    let calls = 0
    const spy = stubClubs(clubs, () =>
      ++calls === 1 ? Response.json({ error: 'conflict', clubs: latest }, { status: 409 }) : Response.json({ clubs: latest }),
    )
    render(<ClubsScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Phoenix Club' }))
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'Subang' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(
      await screen.findByText('This club has been updated. Latest: Phoenix Club B · Petaling Jaya · English · Phoenix SDA Church.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Area')).toHaveValue('Subang')
    expect(screen.getByLabelText('Name')).toHaveValue('Phoenix Club B')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(writes(spy)).toHaveLength(2))
    expect(writes(spy)[1]!.body).toEqual({
      id: 4,
      from: { name: 'Phoenix Club B', area: 'Petaling Jaya', language: 'English', location: null, churchName: 'Phoenix SDA Church' },
      to: { name: 'Phoenix Club B', area: 'Subang', language: 'English', location: null, churchName: 'Phoenix SDA Church' },
    })
  })

  it('ends a club write that never answers in the failure line after 15 s, with the typing kept and the sheet closable', async () => {
    // Catches a stalled connection that leaves a modal sheet busy for ever, which no close path can leave.
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: unknown, init?: RequestInit) =>
          init?.method === 'POST'
            ? new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))) // held until aborted
            : Promise.resolve(Response.json({ clubs })),
      ),
    )
    render(<ClubsScreen />)
    await act(() => vi.advanceTimersByTimeAsync(0)) // the list loads
    fireEvent.click(screen.getByRole('button', { name: 'Phoenix Club' }))
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'Subang' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await act(() => vi.advanceTimersByTimeAsync(14_999))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument() // still waiting
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument() // busy: not closable yet
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(screen.getByText("The club wasn't saved.")).toBeInTheDocument()
    expect(screen.getByLabelText('Area')).toHaveValue('Subang')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // closable again
  })

  it('keeps the typing in the sheet after a failed save and after a 403', async () => {
    // Catches a failed or refused save that closes the sheet or wipes the fields.
    stubClubs(clubs, () => Response.json({}, { status: 500 }))
    render(<ClubsScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Phoenix Club' }))
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'Subang' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText("The club wasn't saved.")).toBeInTheDocument()
    expect(screen.getByLabelText('Area')).toHaveValue('Subang')
    vi.stubGlobal('fetch', vi.fn((_url: unknown, init?: RequestInit) => Promise.resolve(init?.method === 'POST' ? Response.json({}, { status: 403 }) : Response.json({ clubs }))))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(SIGNED_OUT_NOTE)).toBeInTheDocument()
    expect(screen.getByLabelText('Area')).toHaveValue('Subang')
  })

  it('puts focus on Add club when a move\'s conflict list no longer holds the moved club', async () => {
    // Catches focus falling to the page body after another tab removed the club.
    const rest = clubs.filter((club) => club.id !== 2)
    stubClubs(clubs, () => Response.json({ error: 'conflict', clubs: rest }, { status: 409 }))
    render(<ClubsScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Move Beta Club up' }))
    expect(await screen.findByText('The club list was changed in another tab. It now shows the latest.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Beta Club' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add club' })).toHaveFocus()
  })
})

/** Starts a save that stays out until `resolve` is called. */
function pending() {
  let resolve: (response: Response) => void = () => {} // set below
  const promise = new Promise<Response>((done) => (resolve = done)) // the held answer
  return { promise, resolve }
}

const LATEST = clubs.map((club) => (club.id === 4 ? { ...club, name: 'Phoenix Club B' } : club)) // another tab renamed Phoenix
const CONFLICT_LINE = 'This club has been updated. Latest: Phoenix Club B · Petaling Jaya · English · Phoenix SDA Church.' // what the sheet says
// What the Worker can answer a write with, and the line the admin must then read.
const OUTCOMES = {
  failure: { response: () => Response.json({}, { status: 500 }), line: "The club wasn't saved." },
  '403': { response: () => Response.json({}, { status: 403 }), line: SIGNED_OUT_NOTE },
  conflict: { response: () => Response.json({ error: 'conflict', clubs: LATEST }, { status: 409 }), line: CONFLICT_LINE },
  'name-taken': { response: () => Response.json({ error: 'name-taken' }, { status: 409 }), line: 'Another club is already called Lions.' },
}
// Every way to ask a dialog to close; each acts on the top dialog.
const CLOSERS: Record<string, (label: string) => void> = {
  Escape: () => {
    const dialog = screen.getAllByRole('dialog').at(-1)!
    fireEvent(dialog, new Event('cancel', { cancelable: true })) // the key
    fireEvent(dialog, new Event('close')) // what the browser does next
  },
  'the Close or Cancel button': (label) => fireEvent.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: label })),
  'a backdrop tap': () => fireEvent.click(screen.getAllByRole('dialog').at(-1)!),
}

describe('closing while a write runs', () => {
  const sheetCases = Object.keys(CLOSERS).flatMap((closer) => Object.keys(OUTCOMES).map((outcome) => [closer, outcome] as const))
  it.each(sheetCases)('the sheet ignores %s while a save runs, then shows the %s outcome with the typing kept', async (closer, outcome) => {
    // Catches a sheet closed mid-save, which drops a failure, a 403, a conflict or a taken name and the typing with it.
    const held = pending()
    stubClubs(clubs, () => held.promise)
    render(<ClubsScreen />)
    const adding = outcome === 'name-taken' // a taken name only comes from Add
    fireEvent.click(adding ? await screen.findByRole('button', { name: 'Add club' }) : await screen.findByRole('button', { name: 'Phoenix Club' }))
    const sheet = within(screen.getByRole('dialog'))
    fireEvent.change(sheet.getByLabelText(adding ? 'Name' : 'Area'), { target: { value: adding ? 'Lions' : 'Subang' } }) // typed first
    fireEvent.click(sheet.getByRole('button', { name: adding ? 'Add club' : 'Save' }))
    await waitFor(() => expect(sheet.getByRole('button', { name: adding ? 'Adding…' : 'Saving…' })).toBeInTheDocument())
    CLOSERS[closer]!(closer === 'the Close or Cancel button' ? 'Cancel' : '')
    expect(screen.getByRole('dialog')).toBeInTheDocument() // still open
    held.resolve(OUTCOMES[outcome as keyof typeof OUTCOMES].response())
    expect(await screen.findByText(OUTCOMES[outcome as keyof typeof OUTCOMES].line)).toBeInTheDocument()
    expect(screen.getByLabelText(adding ? 'Name' : 'Area')).toHaveValue(adding ? 'Lions' : 'Subang')
  })

  const removeCases = Object.keys(CLOSERS).flatMap((closer) => ['failure', '403', 'conflict'].map((outcome) => [closer, outcome] as const))
  it.each(removeCases)('the Remove dialog ignores %s while a remove runs, then shows the %s outcome', async (closer, outcome) => {
    // Catches a Remove dialog closed mid-remove, which drops the failure, the 403 or the conflict.
    const held = pending()
    stubClubs(clubs, () => held.promise)
    render(<ClubsScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Phoenix Club' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove club' }))
    fireEvent.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Remove club' }))
    await waitFor(() => expect(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Removing…' })).toBeInTheDocument())
    CLOSERS[closer]!('Keep club')
    expect(screen.getByRole('heading', { name: 'Remove Phoenix Club?' })).toBeInTheDocument() // still open
    held.resolve(OUTCOMES[outcome as keyof typeof OUTCOMES].response())
    const line = OUTCOMES[outcome as keyof typeof OUTCOMES].line
    expect(await within(screen.getAllByRole('dialog').at(-1)!).findByRole('alert')).toHaveTextContent(line)
  })
})
