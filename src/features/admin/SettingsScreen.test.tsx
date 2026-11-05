// Tests for the Settings screen: the order email switch that saves at once, its failure, conflict and signed-out states, and the club inbox line.

import { act, fireEvent, render, screen } from '@testing-library/react' // rendering and events
import { afterEach, describe, expect, it, vi } from 'vitest' // test API
import { SettingsScreen } from './SettingsScreen.tsx' // the code under test

type Post = (body: { orderEmailOn: { from: boolean; to: boolean } }) => Response | Promise<Response> // answers one save

/**
 * Stubs fetch for GET and POST /api/settings.
 * @param stored the switch as stored
 * @param post answers a save
 * @return the spy
 */
function stubSettings(stored: boolean | 'status-403' | 'status-500', post: Post = () => Response.json({}, { status: 500 })) {
  const spy = vi.fn((_url: unknown, init?: RequestInit) =>
    Promise.resolve().then(() => {
      if (init?.method === 'POST') return post(JSON.parse(init.body as string)) // a save
      if (stored === 'status-403') return Response.json({}, { status: 403 })
      if (stored === 'status-500') return Response.json({}, { status: 500 })
      return Response.json({ orderEmailOn: stored }) // the read
    }),
  )
  vi.stubGlobal('fetch', spy) // the page's fetch
  return spy
}

afterEach(() => vi.unstubAllGlobals()) // no stub leaks on

describe('SettingsScreen', () => {
  it('shows the switch as a role="switch" with aria-checked and the inbox clean-up line', async () => {
    // Catches a switch a screen reader cannot read, or a missing yearly clean-up reminder.
    stubSettings(true)
    render(<SettingsScreen />)
    const toggle = await screen.findByRole('switch', { name: 'Email each new order to the club inbox' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('heading', { name: 'Order email' })).toBeInTheDocument()
    expect(
      screen.getByText(
        "The club inbox keeps each order email with the buyer's name, email and phone. Delete the ones older than 12 months there.",
      ),
    ).toBeInTheDocument()
  })

  it('saves at once with a real flip from the stored value and says "Saved."', async () => {
    // Catches a from === to save (the Worker refuses it), or a switch that waits for a button.
    const spy = stubSettings(true, ({ orderEmailOn }) => Response.json({ orderEmailOn: orderEmailOn.to }))
    render(<SettingsScreen />)
    const toggle = await screen.findByRole('switch')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(JSON.parse(spy.mock.calls[1][1]?.body as string)).toEqual({ orderEmailOn: { from: true, to: false } })
  })

  it('flips back and says "The setting wasn\'t saved." when the save fails', async () => {
    // Catches a switch that shows a setting that was never stored.
    stubSettings(true)
    render(<SettingsScreen />)
    const toggle = await screen.findByRole('switch')
    fireEvent.click(toggle)
    expect(await screen.findByText("The setting wasn't saved.")).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('shows the stored value and a note after a 409', async () => {
    // Catches a switch that disagrees with the stored value after another tab changed it.
    stubSettings(true, () => Response.json({ error: 'conflict', orderEmailOn: false }, { status: 409 }))
    render(<SettingsScreen />)
    const toggle = await screen.findByRole('switch')
    fireEvent.click(toggle)
    expect(await screen.findByText('This setting was changed in another tab. It is now Off.')).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('sends once for a double click', async () => {
    // Catches two saves from one double click.
    let release: (response: Response) => void = () => undefined
    const spy = stubSettings(true, () => new Promise<Response>((resolve) => (release = resolve)))
    render(<SettingsScreen />)
    const toggle = await screen.findByRole('switch')
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    expect(spy.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    await act(async () => undefined) // the request has reached the stub
    release(Response.json({ orderEmailOn: false }))
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
  })

  it('shows the signed-out line for a 403 on the read', async () => {
    // Catches a 403 shown as a plain failure.
    stubSettings('status-403')
    render(<SettingsScreen />)
    expect(
      await screen.findByText('Your sign-in has ended. Open this page in a new tab to sign in, then try again.'),
    ).toBeInTheDocument()
  })

  it('shows a failure line with Try again when the read fails', async () => {
    // Catches a switch shown with a guessed value.
    stubSettings('status-500')
    render(<SettingsScreen />)
    expect(await screen.findByText("We couldn't load the settings.")).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('shows the signed-out line and flips back for a 403 on the save', async () => {
    // Catches a 403 on a save shown as a plain failure.
    stubSettings(true, () => Response.json({}, { status: 403 }))
    render(<SettingsScreen />)
    const toggle = await screen.findByRole('switch')
    fireEvent.click(toggle)
    expect(
      await screen.findByText('Your sign-in has ended. Open this page in a new tab to sign in, then try again.'),
    ).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })
})
