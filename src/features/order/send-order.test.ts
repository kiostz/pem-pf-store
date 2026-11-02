// Tests for sendOrder with fetch stubbed at the boundary: the request to the API Worker, what counts as saved, every failure kind and the stock refusal.

import { afterEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import type { OrderLine } from '@/features/cart/cart.ts' // an order line
import { EMPTY_ORDER_FORM } from './order-form.ts' // the form values
import { OrderSendError, OrderStockError, sendOrder, toOrderRequest, type OrderRequest } from './send-order.ts' // code under test

const request: OrderRequest = {
  requestId: '3f0c1d5e-8a43-4c1e-9d0e-5b7a2f6c9e10',
  turnstileToken: 'captcha-token',
  name: 'J. Cruz',
  email: 'jc@mail.com',
  phone: '+60 12-345 6789',
  club: { name: 'Eagles', typed: false },
  lines: [{ honorId: 'knot-tying', quantity: 3 }],
} // the order under test

const saved = {
  number: 'PF-20261102-4K7Q',
  createdAt: '2026-11-01T17:00:00.000Z',
  currency: 'MYR',
  totalCents: 900,
  lines: [{ honorId: 'knot-tying', name: 'Knot Tying', quantity: 3, priceCents: 300 }],
} // what the Worker answers for it

afterEach(() => {
  vi.unstubAllEnvs() // env back to what the files say
  vi.restoreAllMocks() // spies removed
})

/**
 * Makes a fetch stand-in that answers once.
 * @param status the HTTP status
 * @param body the JSON body, or a raw string
 * @return the stand-in, to read its calls
 */
function fetchAnswering(status: number, body: unknown) {
  return vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))
}

describe('sendOrder', () => {
  it('posts the ids, quantities and club object as JSON to the API Worker', async () => {
    // catches: a wrong address, prices sent from the browser, or a missing field the Worker needs
    vi.stubEnv('VITE_API_URL', '/api')
    const fetchFn = fetchAnswering(201, saved)
    await sendOrder(request, fetchFn)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/orders')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Accept: 'application/json' })
    expect(init.signal).toBeInstanceOf(AbortSignal) // the 20 s timeout
    expect(JSON.parse(init.body as string)).toEqual(request)
  })

  it.each([201, 200])('returns the saved order for HTTP %i', async (status) => {
    // catches: a repeat send (200) treated as a failure, so a lost reply makes the buyer think the order is lost
    await expect(sendOrder(request, fetchAnswering(status, saved))).resolves.toEqual(saved)
  })

  it.each([
    ['no number', { ...saved, number: 5 }],
    ['a negative total', { ...saved, totalCents: -1 }],
    ['a fractional quantity', { ...saved, lines: [{ ...saved.lines[0], quantity: 1.5 }] }],
    ['lines that are not a list', { ...saved, lines: 'x' }],
    ['no body', null],
  ])('rejects a 201 whose body has %s', async (_label, body) => {
    // catches: a malformed answer written to the confirmation page as if it were an order
    await expect(sendOrder(request, fetchAnswering(201, body))).rejects.toMatchObject({
      name: 'OrderSendError',
      kind: 'rejected',
    })
  })

  it('throws OrderStockError with every short line for HTTP 409', async () => {
    // catches: a stock refusal shown as a generic failure, or the short lines dropped
    const lines = [
      { honorId: 'knot-tying', stock: 1 },
      { honorId: 'ants', stock: null },
    ]
    const error = await sendOrder(request, fetchAnswering(409, { error: 'stock', lines })).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(OrderStockError)
    expect((error as OrderStockError).lines).toEqual(lines)
  })

  it('rejects a 409 whose lines are malformed', async () => {
    // catches: garbage stock numbers patched into the loaded catalogue
    await expect(
      sendOrder(request, fetchAnswering(409, { error: 'stock', lines: [{ honorId: 'a', stock: -2 }] })),
    ).rejects.toMatchObject({ kind: 'rejected' })
  })

  it.each([
    ['another error name', { error: 'conflict', lines: [{ honorId: 'knot-tying', stock: 1 }] }],
    ['no lines list', { error: 'stock' }],
    ['a line without an id', { error: 'stock', lines: [{ stock: 1 }] }],
    ['a fractional stock', { error: 'stock', lines: [{ honorId: 'knot-tying', stock: 1.5 }] }],
    ['a stock written as text', { error: 'stock', lines: [{ honorId: 'knot-tying', stock: '1' }] }],
    ['a missing stock', { error: 'stock', lines: [{ honorId: 'knot-tying' }] }],
  ])('rejects a 409 with %s', async (_label, body) => {
    // catches: any 409 treated as a stock refusal, or a stock of text or undefined patched into the shop's data
    await expect(sendOrder(request, fetchAnswering(409, body))).rejects.toMatchObject({ name: 'OrderSendError', kind: 'rejected' })
  })

  it('rejects a 409 that is not JSON', async () => {
    // catches: a proxy's HTML 409 page crashing the parse instead of showing the failure note
    await expect(sendOrder(request, fetchAnswering(409, '<html>'))).rejects.toMatchObject({ kind: 'rejected' })
  })

  it('names HTTP 429 as rate-limited even when its body is not JSON', async () => {
    // catches: the body parsed before the status, so a 429 page from the edge reads as a rejected order and the wait advice is lost
    await expect(sendOrder(request, fetchAnswering(429, '<html>'))).rejects.toMatchObject({ kind: 'rate-limited' })
  })

  it('names a 409 with an empty lines list as a stock refusal that names nothing', async () => {
    // catches: an empty refusal turned into a send failure here, which would hide the form's own "nothing to fix" rule
    const error = await sendOrder(request, fetchAnswering(409, { error: 'stock', lines: [] })).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(OrderStockError)
    expect((error as OrderStockError).lines).toEqual([])
  })

  it('names a 403 captcha answer as captcha', async () => {
    // catches: a failed captcha worded as a lost connection
    await expect(sendOrder(request, fetchAnswering(403, { error: 'captcha' }))).rejects.toMatchObject({ kind: 'captcha' })
  })

  it('names a 403 for another reason as rejected', async () => {
    // catches: a wrong-origin refusal telling the buyer to solve the captcha again
    await expect(sendOrder(request, fetchAnswering(403, { error: 'forbidden-origin' }))).rejects.toMatchObject({
      kind: 'rejected',
    })
  })

  it('names HTTP 429 as rate-limited', async () => {
    // catches: the "too many orders" advice never reaching the buyer
    await expect(sendOrder(request, fetchAnswering(429, { error: 'rate-limited' }))).rejects.toMatchObject({
      kind: 'rate-limited',
    })
  })

  it.each([
    [400, { error: 'invalid' }],
    [500, { error: 'server' }],
    [503, { error: 'captcha-unavailable' }],
    [502, '<html>'],
    [200, '<html>'],
  ])('rejects HTTP %i with %j', async (status, body) => {
    // catches: a client or server error, or a page that is not JSON, counted as sent or crashing the parse
    await expect(sendOrder(request, fetchAnswering(status, body))).rejects.toMatchObject({ kind: 'rejected' })
  })

  it('names a thrown fetch as a network failure', async () => {
    // catches: an offline buyer seeing no error at all
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(sendOrder(request, fetchFn)).rejects.toMatchObject({ kind: 'network' })
  })

  it.each(['TimeoutError', 'AbortError'])('names a %s as a timeout', async (name) => {
    // catches: a dead network freezing the screen, or browsers that abort under the other name reporting a network failure
    const fetchFn = vi.fn(async () => {
      throw new DOMException('signal timed out', name)
    })
    await expect(sendOrder(request, fetchFn)).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('gives the request a 20 second timeout signal', async () => {
    // catches: a wrong or missing timeout, so a dead network freezes the screen
    const timeout = vi.spyOn(AbortSignal, 'timeout') // watch the signal's creation
    await sendOrder(request, fetchAnswering(201, saved))
    expect(timeout).toHaveBeenCalledWith(20_000)
  })

  it('throws OrderSendError instances', async () => {
    // catches: callers unable to tell a send failure from a bug with instanceof
    await expect(sendOrder(request, fetchAnswering(500, ''))).rejects.toBeInstanceOf(OrderSendError)
  })

  it('keeps the buyer out of every error message', async () => {
    // catches: a name, email or phone inside an error that reaches a log
    const error = (await sendOrder(request, fetchAnswering(500, '')).catch((caught: unknown) => caught)) as Error // the thrown error
    for (const secret of ['J. Cruz', 'jc@mail.com', '6789']) expect(error.message).not.toContain(secret)
  })
})

describe('toOrderRequest', () => {
  const honor = { id: 'knot-tying', name: 'Knot Tying', category: 'Nature', stock: 10, price: 3, image: null } as const // one item at RM 3
  const lines: OrderLine[] = [{ honor, quantity: 3 }] // three of them
  const values = { ...EMPTY_ORDER_FORM, name: ' J. Cruz ', email: 'jc@mail.com', phone: '+60\t12', club: 'Eagles' } // a listed club

  it('sends ids and quantities only, with the buyer on one line and a listed club as not typed', () => {
    // catches: prices sent from the browser, a control character kept in a field, or a listed club flagged as typed
    expect(toOrderRequest('id-1', 'tok', lines, values)).toEqual({
      requestId: 'id-1',
      turnstileToken: 'tok',
      name: 'J. Cruz',
      email: 'jc@mail.com',
      phone: '+60 12',
      club: { name: 'Eagles', typed: false },
      lines: [{ honorId: 'knot-tying', quantity: 3 }],
    })
  })

  it('sends a typed club by its typed name and flags it', () => {
    // catches: the word "other" sent as the club name
    const typed = toOrderRequest('id-1', 'tok', lines, { ...values, club: 'other', otherClub: 'River\nside' })
    expect(typed.club).toEqual({ name: 'River side', typed: true })
  })
})
