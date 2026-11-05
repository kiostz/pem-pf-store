// Tests for the Settings screen: the Shop section (currency and default price, one Save button) and the order email switch that saves at once, with their failure, conflict and signed-out states, and the club inbox line.

import { act, fireEvent, render, screen } from '@testing-library/react' // rendering and events
import { afterEach, describe, expect, it, vi } from 'vitest' // test API
import { meta } from './item-fixtures.ts' // /api/meta's answer: MYR and 4.50
import { SettingsScreen } from './SettingsScreen.tsx' // the code under test

type Prices = { currency?: { from: string; to: string }; defaultPriceCents?: { from: number; to: number } } // a prices save's body
type Shop = { meta?: () => Response | Promise<Response>; prices?: (body: Prices) => Response | Promise<Response> } // the Shop section's answers

type Post = (body: { orderEmailOn: { from: boolean; to: boolean } }) => Response | Promise<Response> // answers one save

/**
 * Stubs fetch for GET and POST /api/settings.
 * @param stored the switch as stored
 * @param post answers a save
 * @return the spy
 */
function stubSettings(stored: boolean | 'status-403' | 'status-500', post: Post = () => Response.json({}, { status: 500 }), shop: Shop = {}) {
  const spy = vi.fn((url: unknown, init?: RequestInit) =>
    Promise.resolve().then(() => {
      if (url === '/api/meta') return (shop.meta ?? (() => Response.json(meta)))() // the Shop section's read
      if (url === '/api/settings/prices') return (shop.prices ?? (() => Response.json({}, { status: 500 })))(JSON.parse(init!.body as string)) // its save
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
    expect(JSON.parse(spy.mock.calls.find(([, init]) => init?.method === 'POST')![1]?.body as string)).toEqual({ orderEmailOn: { from: true, to: false } })
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

  describe('the Shop section', () => {
    /** Reads the POSTs to the prices route. */
    const priceBodies = (spy: ReturnType<typeof stubSettings>) =>
      spy.mock.calls.filter(([url]) => url === '/api/settings/prices').map(([, init]) => JSON.parse(init!.body as string))
    /** Renders and waits for the fields. */
    async function open(shop: Shop = {}, onPricesSaved?: (prices: { currency: string; defaultPriceCents: number }) => void) {
      const spy = stubSettings(true, () => Response.json({}, { status: 500 }), shop)
      render(<SettingsScreen onPricesSaved={onPricesSaved} />)
      const currency = await screen.findByRole('combobox', { name: 'Currency' })
      return { spy, currency, price: screen.getByRole('textbox', { name: /Default price/ }), save: screen.getByRole('button', { name: 'Save' }) }
    }

    it('shows the stored currency and price above Order email, with its hint, and a skeleton while loading', async () => {
      // Catches a section with guessed values, or one below the switch.
      stubSettings(true, undefined, { meta: () => new Promise<Response>(() => undefined) })
      const { unmount, container } = render(<SettingsScreen />)
      expect(await screen.findByRole('heading', { name: 'Shop' })).toBeInTheDocument()
      expect(container.querySelector('.animate-skeleton')).not.toBeNull() // the skeleton is there
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
      unmount()
      const { currency, price } = await open()
      expect(currency).toHaveValue('MYR')
      expect(price).toHaveValue('4.50')
      expect(screen.getByRole('textbox', { name: 'Default price (RM)' })).toBe(price)
      expect(screen.getByText("New items start at this price. Existing prices don't change.")).toBeInTheDocument()
      const shop = screen.getByRole('heading', { name: 'Shop' })
      const email = screen.getByRole('heading', { name: 'Order email' })
      expect(shop.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['MYR (RM)', 'SGD ($)', 'CNY (\u00a5)'])
    })

    it('shows the not-converted line only while the currency differs', async () => {
      // Catches a warning that never goes, or one that never shows.
      const { currency } = await open()
      expect(screen.queryByText(/aren't converted/)).not.toBeInTheDocument()
      fireEvent.change(currency, { target: { value: 'SGD' } })
      expect(screen.getByText("Prices aren't converted: RM 4.00 becomes $4.00.")).toBeInTheDocument()
      fireEvent.change(currency, { target: { value: 'CNY' } })
      expect(screen.getByText("Prices aren't converted: RM 4.00 becomes \u00a54.00.")).toBeInTheDocument()
      fireEvent.change(currency, { target: { value: 'MYR' } })
      expect(screen.queryByText(/aren't converted/)).not.toBeInTheDocument()
    })

    it('shows the price line and sends nothing for a bad price', async () => {
      // Catches a bad price reaching the Worker.
      const { spy, price, save } = await open()
      fireEvent.change(price, { target: { value: '4.555' } })
      fireEvent.click(save)
      expect(await screen.findByText('Enter a price like 4.50.')).toBeInTheDocument()
      expect(priceBodies(spy)).toHaveLength(0)
    })

    it('says "Nothing to save." and sends nothing when nothing changed', async () => {
      // Catches a no-op save the Worker would refuse as invalid.
      const { spy, save } = await open()
      fireEvent.click(save)
      expect(await screen.findByText('Nothing to save.')).toBeInTheDocument()
      expect(priceBodies(spy)).toHaveLength(0)
    })

    it('sends only the changed field, says "Saved." and calls onPricesSaved', async () => {
      // Catches a save of an unchanged field (a false conflict) and an Items screen that never hears of it.
      const saved = vi.fn()
      const { spy, price, save } = await open({ prices: () => Response.json({ currency: 'MYR', defaultPriceCents: 500 }) }, saved)
      fireEvent.change(price, { target: { value: '5' } })
      fireEvent.click(save)
      expect(await screen.findByText('Saved.')).toBeInTheDocument()
      expect(priceBodies(spy)).toEqual([{ defaultPriceCents: { from: 450, to: 500 } }])
      expect(price).toHaveValue('5.00')
      expect(saved).toHaveBeenCalledWith({ currency: 'MYR', defaultPriceCents: 500 })
    })

    it('clears the last outcome line when a field is edited again', async () => {
      // Catches a "Saved." that stays under a form that has changed since.
      const { price, save } = await open({ prices: () => Response.json({ currency: 'MYR', defaultPriceCents: 500 }) })
      fireEvent.change(price, { target: { value: '5' } })
      fireEvent.click(save)
      await screen.findByText('Saved.')
      fireEvent.change(price, { target: { value: '5.5' } })
      expect(screen.queryByText('Saved.')).not.toBeInTheDocument()
    })

    it('sends both fields when both changed', async () => {
      // Catches a currency change that drops the price, or the reverse.
      const { spy, currency, price, save } = await open({ prices: () => Response.json({ currency: 'SGD', defaultPriceCents: 600 }) })
      fireEvent.change(currency, { target: { value: 'SGD' } })
      fireEvent.change(price, { target: { value: '6.00' } })
      fireEvent.click(save)
      await screen.findByText('Saved.')
      expect(priceBodies(spy)).toEqual([{ currency: { from: 'MYR', to: 'SGD' }, defaultPriceCents: { from: 450, to: 600 } }])
      expect(screen.queryByText(/aren't converted/)).not.toBeInTheDocument()
    })

    it('resets the fields with the conflict line and calls onPricesSaved after a 409', async () => {
      // Catches a stale view kept after another tab saved, or an Items screen left on the old symbol.
      const saved = vi.fn()
      const { currency, price, save } = await open({ prices: () => Response.json({ error: 'conflict', currency: 'MYR', defaultPriceCents: 600 }, { status: 409 }) }, saved)
      fireEvent.change(price, { target: { value: '7' } })
      fireEvent.click(save)
      expect(await screen.findByText('These settings were changed in another tab. They are now MYR and RM 6.00.')).toBeInTheDocument()
      expect(price).toHaveValue('6.00')
      expect(currency).toHaveValue('MYR')
      expect(saved).toHaveBeenCalledWith({ currency: 'MYR', defaultPriceCents: 600 })
    })

    it('keeps the typing and says "The settings weren\'t saved." when the save fails', async () => {
      // Catches typing lost on a failed save.
      const saved = vi.fn()
      const { price, save } = await open({}, saved)
      fireEvent.change(price, { target: { value: '7' } })
      fireEvent.click(save)
      expect(await screen.findByText("The settings weren't saved.")).toBeInTheDocument()
      expect(price).toHaveValue('7')
      expect(saved).not.toHaveBeenCalled()
    })

    it('shows the signed-out line for a 403 and keeps the typing', async () => {
      // Catches a session end shown as a plain failure, or typing lost with it.
      const { price, save } = await open({ prices: () => Response.json({}, { status: 403 }) })
      fireEvent.change(price, { target: { value: '7' } })
      fireEvent.click(save)
      expect(await screen.findByText('Your sign-in has ended. Open this page in a new tab to sign in, then try again.')).toBeInTheDocument()
      expect(price).toHaveValue('7')
    })

    it('sends once for a double click on Save', async () => {
      // Catches two saves from one double click.
      let release: (response: Response) => void = () => undefined
      const { spy, price, save } = await open({ prices: () => new Promise<Response>((resolve) => (release = resolve)) })
      fireEvent.change(price, { target: { value: '7' } })
      fireEvent.click(save)
      fireEvent.click(save)
      await act(async () => undefined)
      release(Response.json({ currency: 'MYR', defaultPriceCents: 700 }))
      expect(await screen.findByText('Saved.')).toBeInTheDocument()
      expect(priceBodies(spy)).toHaveLength(1)
    })

    it('shows a failure line with Try again when /api/meta fails, and the switch still works', async () => {
      // Catches a failed shop read that blanks the whole screen.
      let reads = 0 // /api/meta reads so far
      const spy = stubSettings(true, undefined, { meta: () => (++reads === 1 ? Response.json({}, { status: 500 }) : Response.json(meta)) }) // fails once, then answers
      render(<SettingsScreen />)
      expect(await screen.findByText("We couldn't load the shop settings.")).toBeInTheDocument()
      expect(screen.getByRole('switch')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Try again' })) // reads again
      expect(await screen.findByRole('combobox', { name: 'Currency' })).toHaveValue('MYR') // the form appears
      expect(screen.queryByText("We couldn't load the shop settings.")).not.toBeInTheDocument()
      expect(spy.mock.calls.filter(([url]) => url === '/api/meta')).toHaveLength(2)
    })

    it('locks the fields while a save runs, so the answer cannot overwrite typing', async () => {
      // Catches a 200 that silently puts the stored value over text typed during the wait.
      let release: (response: Response) => void = () => undefined
      const { currency, price, save } = await open({ prices: () => new Promise<Response>((resolve) => (release = resolve)) })
      fireEvent.change(price, { target: { value: '5' } })
      fireEvent.click(save)
      await act(async () => undefined)
      expect(price).toHaveAttribute('readonly')
      expect(currency).toBeDisabled()
      release(Response.json({ currency: 'MYR', defaultPriceCents: 500 }))
      expect(await screen.findByText('Saved.')).toBeInTheDocument()
      expect(price).not.toHaveAttribute('readonly')
      expect(currency).toBeEnabled()
    })

    it('keeps the switch saving on its own', async () => {
      // Catches the Shop Save button swallowing the switch's save.
      const spy = stubSettings(true, ({ orderEmailOn }) => Response.json({ orderEmailOn: orderEmailOn.to }))
      render(<SettingsScreen />)
      fireEvent.click(await screen.findByRole('switch'))
      expect(await screen.findByText('Saved.')).toBeInTheDocument()
      expect(spy.mock.calls.filter(([url]) => url === '/api/settings/prices')).toHaveLength(0)
    })
  })
})
