// Tests for the shop page when a club the buyer picked has since been removed or renamed in the admin: a send cut off by a dropped connection comes back after a reload with the old club, and the shop must not send it.

import { act, fireEvent, render, screen } from '@testing-library/react' // render and query the page
import { afterEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import { CART_STORAGE_KEY } from '@/features/cart/cart-storage.ts' // the stored cart's key
import type { Club } from '@/shared/data/types.ts' // the club shape
import { honor, shopFetch } from '@/test/shop-fetch.ts' // the honor builder and the /shop fake
import { App } from './App.tsx' // code under test

// The real captcha loads Turnstile's script, which a test must not do; this stand-in ticks on demand.
vi.mock('@/features/order/Captcha.tsx', () => ({
  Captcha: ({ onToken }: { onToken: (token: string | null) => void }) => (
    <button type="button" onClick={() => onToken('token-1')}>
      Solve captcha
    </button>
  ),
}))

afterEach(() => {
  window.sessionStorage.clear() // no pending send left
  window.localStorage.clear() // no cart left
  vi.unstubAllGlobals() // restore fetch
  vi.restoreAllMocks() // spies off
  window.location.hash = '' // back to the catalogue address
})

const club = (name: string): Club => ({ name, area: null, language: null, location: null, churchName: null }) // a club with no details

/**
 * Serves /shop with the given clubs, and fails every order send like a dropped connection.
 * @param clubs the club list the admin has now
 * @param lookup what the order lookup answers; not found by default
 * @param post what the order send does; a dropped connection by default
 * @return the fetch stub, to read the order calls
 */
function serve(clubs: Club[], lookup: () => Response = () => Response.json({ found: false }), post: () => Response = () => { throw new TypeError('Failed to fetch') }) {
  const fetchFn = shopFetch([honor('knot-tying', 'Knot Tying')], clubs, (url) => {
    if (url.includes('/orders/status/')) return lookup() // the order lookup
    if (url.endsWith('/orders')) return post() // the send: dropped unless a test says otherwise
    return undefined
  })
  vi.stubGlobal('fetch', fetchFn)
  return fetchFn
}

/**
 * Counts the order requests a stub got.
 * @param fetchFn the fetch stub
 * @return the number of order sends
 */
const orderCalls = (fetchFn: ReturnType<typeof serve>) => fetchFn.mock.calls.filter(([url]) => String(url).endsWith('/orders')).length

/**
 * Picks a club, sends once into a dropped connection, and reloads the page against a new club list.
 * @param before the club list when the buyer picked
 * @param picked the club the buyer picked
 * @param after the club list after the admin's change
 * @param lookup what the order lookup answers after the reload
 * @param post what the order send does after the reload
 * @return the fetch stub of the reloaded page
 */
async function dropThenReload(before: Club[], picked: string, after: Club[], lookup?: () => Response, post?: () => Response) {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  serve(before)
  window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":1}}') // one line
  window.location.hash = '#/details'
  const first = render(<App />)
  await screen.findByRole('heading', { name: 'Your details' })
  fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Jo Tan' } }) // the form shows once the shop has loaded
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jc@mail.com' } })
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '0312345678' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Club' }), { target: { value: picked } })
  fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
  })
  expect(await screen.findByRole('alert')).toHaveTextContent('Your order was not sent') // the drop
  first.unmount() // the reload: memory goes, storage stays
  const reloaded = serve(after, lookup, post) // the shop now serves the admin's new list
  render(<App />)
  await screen.findByRole('heading', { name: 'Your details' })
  await screen.findByLabelText('Name') // the form shows once the shop has loaded
  return reloaded
}

describe('a picked club that left the list', () => {
  it.each([
    ['removed', [club('Phoenix Club'), club('Lions')], [club('Lions')]],
    ['renamed', [club('Pheonix Club'), club('Lions')], [club('Phoenix Club'), club('Lions')]],
  ])('after a reload with the club %s, blocks Send with "Choose your club." and sends nothing', async (_kind, before, after) => {
    // Catches a restored form that sends a club the shop no longer lists, or shows no reason why Send is blocked.
    const reloaded = await dropThenReload(before, before[0].name, after)
    expect(screen.getByLabelText('Name')).toHaveValue('Jo Tan') // the cut-off send's form came back, so the old club did too
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' })) // the token is new after a reload
    const send = screen.getByRole('button', { name: /^Send order/ })
    expect(send).toHaveAttribute('aria-disabled', 'true') // not ready
    await act(async () => {
      fireEvent.click(send)
    })
    expect(screen.getByText('Choose your club.')).toBeInTheDocument() // the reason
    expect(orderCalls(reloaded)).toBe(0) // nothing sent
  })

  it('looks the order up first when the buyer picks another club, and posts the new club under the same id when nothing was found', async () => {
    // Catches a changed resend that goes out under a new request id, or one that skips the lookup, although the cut-off send may have landed.
    const body = { number: 'PF-20261102-4K7Q', createdAt: '2026-11-01T17:00:00.000Z', currency: 'MYR', totalCents: 400, club: 'Lions', kept: 'this-send', lines: [{ honorId: 'knot-tying', name: 'Knot Tying', quantity: 1, priceCents: 400 }] } // the Worker's saved order
    const reloaded = await dropThenReload([club('Phoenix Club'), club('Lions')], 'Phoenix Club', [club('Lions')], undefined, () => Response.json(body, { status: 201 }))
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Club' }), { target: { value: 'Lions' } })
    expect(screen.queryByText('Choose your club.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Send order/ })).toHaveAttribute('aria-disabled', 'false')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    })
    const urls = reloaded.mock.calls.map(([url]) => String(url)).filter((url) => !url.endsWith('/shop')) // the order requests, in order
    expect(urls.map((url) => (url.includes('/orders/status/') ? 'lookup' : 'post'))).toEqual(['lookup', 'post']) // the lookup comes first
    expect(orderCalls(reloaded)).toBe(1) // one send, with the new club
    expect(JSON.parse(String(reloaded.mock.calls.find(([url]) => String(url).endsWith('/orders'))?.[1]?.body)).club).toEqual({ name: 'Lions', typed: false }) // the new club
  })

  it('shows the first club with the note, and posts nothing, when the lookup finds the order sent with the removed club', async () => {
    // Catches a confirmation naming the club the buyer picked after the drop for an order saved with the first one.
    const found = { found: true, order: { number: 'PF-20261102-4K7Q', createdAt: '2026-11-01T17:00:00.000Z', currency: 'MYR', totalCents: 400, club: 'Phoenix Club', lines: [{ honorId: 'knot-tying', name: 'Knot Tying', quantity: 1, priceCents: 400 }] } } // the first send had landed
    const reloaded = await dropThenReload([club('Phoenix Club'), club('Lions')], 'Phoenix Club', [club('Lions')], () => Response.json(found))
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Club' }), { target: { value: 'Lions' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    })
    expect(await screen.findByRole('heading', { name: 'Order sent' })).toBeInTheDocument()
    expect(screen.getByText('Phoenix Club')).toBeInTheDocument() // the first club
    expect(screen.queryByText('Lions')).not.toBeInTheDocument() // never the one it was not sent with
    expect(screen.getByText(/This order reached us before your changes/)).toBeInTheDocument() // the note
    expect(orderCalls(reloaded)).toBe(0) // nothing posted
  })

  it('shows the contact rows and no "changes were not sent" note for an unchanged resend of a version 1 pending send with padded fields', async () => {
    // Catches a version 1 contact kept padded, so the unchanged form (trimmed on send) reads as a different contact and the note and rows go wrong.
    const found = { found: true, order: { number: 'PF-20261102-4K7Q', createdAt: '2026-11-01T17:00:00.000Z', currency: 'MYR', totalCents: 400, club: 'Phoenix Club', lines: [{ honorId: 'knot-tying', name: 'Knot Tying', quantity: 1, priceCents: 400 }] } } // the first send had landed
    const values = { name: '  Jo Tan  ', email: '  jc@mail.com  ', phone: '  0312345678  ', club: 'Phoenix Club', otherClub: '' } // padded, as an older build stored them
    window.sessionStorage.setItem('pem-pf-store:pending-send', JSON.stringify({ version: 1, pending: { requestId: '3f0c1d5e-8a43-4c1e-9d0e-5b7a2f6c9e10', lines: [['knot-tying', 1]], values } }))
    window.localStorage.setItem(CART_STORAGE_KEY, '{"version":1,"quantities":{"knot-tying":1}}') // the same one line
    window.location.hash = '#/details'
    const reloaded = serve([club('Phoenix Club'), club('Lions')], () => Response.json(found))
    render(<App />)
    await screen.findByLabelText('Name') // the form shows once the shop has loaded
    fireEvent.click(screen.getByRole('button', { name: 'Solve captcha' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Send order/ }))
    })
    expect(await screen.findByRole('heading', { name: 'Order sent' })).toBeInTheDocument()
    expect(screen.getByText('Jo Tan')).toBeInTheDocument() // the contact rows show
    expect(screen.queryByText(/your changes were not sent/)).not.toBeInTheDocument() // nothing changed
    expect(orderCalls(reloaded)).toBe(0) // nothing posted
  })
})
