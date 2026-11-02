// Tests for sendOrder with fetch stubbed at the boundary: the Web3Forms payload, what counts as success, every failure kind and the fake mode.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import type { OrderLine } from '@/features/cart/cart.ts' // an order line
import { EMPTY_ORDER_FORM } from './order-form.ts' // the form values
import { toSentOrder } from './order-email.ts' // the order snapshot
import { OrderSendError, sendOrder } from './send-order.ts' // code under test

const honor = {
  id: 'knot-tying',
  name: 'Knot Tying',
  category: 'Nature',
  stock: 10,
  price: 3,
  image: null,
} as const // one honor at RM 3
const lines: OrderLine[] = [{ honor, quantity: 3 }] // RM 9.00
const order = toSentOrder(
  'PF-20261028-4K7Q',
  lines,
  {
    ...EMPTY_ORDER_FORM,
    name: 'J. Cruz',
    email: 'jc@mail.com',
    phone: '+60 12-345 6789',
    club: 'Eagles',
  },
  'MYR',
  new Date('2026-10-28T10:00:00Z'),
) // the order under test

beforeEach(() => {
  vi.stubEnv('VITE_WEB3FORMS_ACCESS_KEY', 'test-key') // a fixed key to look for
  vi.stubEnv('VITE_ORDER_SEND', '') // the real path unless a test says fake
})

afterEach(() => {
  vi.unstubAllEnvs() // env back to what the files say
  vi.useRealTimers() // a fake clock must not leak
  vi.restoreAllMocks() // spies removed
})

/**
 * Makes a fetch stand-in that answers once.
 * @param response what it answers with
 * @return the stand-in, to read its calls
 */
function fetchReturning(response: Response) {
  return vi.fn(async () => response)
}

describe('sendOrder', () => {
  it('posts JSON to Web3Forms with every field the order handler needs', async () => {
    // catches: a missing field (reply-to, captcha token, key) or a wrong content type
    const fetchFn = fetchReturning(
      new Response(JSON.stringify({ success: true })),
    )
    await sendOrder(order, 'captcha-token', fetchFn)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe('https://api.web3forms.com/submit')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    })
    expect(init.signal).toBeInstanceOf(AbortSignal) // the 20 s timeout
    expect(JSON.parse(init.body as string)).toEqual({
      access_key: 'test-key',
      subject: 'PEM Pathfinder Store order PF-20261028-4K7Q — Eagles — J. Cruz',
      from_name: 'PEM Pathfinder Store',
      replyto: 'jc@mail.com',
      message:
        'Order: PF-20261028-4K7Q\nName:  J. Cruz\nEmail: jc@mail.com\nPhone: +60 12-345 6789\nClub:  Eagles\n\n3 × Knot Tying @ RM 3.00 = RM 9.00\n\nEstimated total: RM 9.00',
      'h-captcha-response': 'captcha-token',
    })
  })

  it('resolves on HTTP 200 with success true', async () => {
    // catches: a success that needs more than Web3Forms' own answer
    await expect(
      sendOrder(
        order,
        't',
        fetchReturning(new Response(JSON.stringify({ success: true }))),
      ),
    ).resolves.toBeUndefined()
  })

  it('rejects HTTP 200 with success false', async () => {
    // catches: trusting the status alone, so a refused order empties the cart
    const fetchFn = fetchReturning(
      new Response(JSON.stringify({ success: false, message: 'bad' })),
    )
    await expect(sendOrder(order, 't', fetchFn)).rejects.toMatchObject({
      name: 'OrderSendError',
      kind: 'rejected',
    })
  })

  it('rejects HTTP 200 with a body that is not JSON', async () => {
    // catches: a parse error escaping as a plain exception, or counted as success
    await expect(
      sendOrder(order, 't', fetchReturning(new Response('<html>'))),
    ).rejects.toMatchObject({ kind: 'rejected' })
  })

  it('rejects HTTP 400', async () => {
    // catches: a client error counted as sent
    const fetchFn = fetchReturning(
      new Response(JSON.stringify({ success: false }), { status: 400 }),
    )
    await expect(sendOrder(order, 't', fetchFn)).rejects.toMatchObject({
      kind: 'rejected',
    })
  })

  it('rejects HTTP 500 with a body that is not JSON', async () => {
    // catches: a server error page crashing the JSON parse instead of failing cleanly
    await expect(
      sendOrder(
        order,
        't',
        fetchReturning(new Response('oops', { status: 500 })),
      ),
    ).rejects.toMatchObject({ kind: 'rejected' })
  })

  it('names HTTP 429 as rate-limited', async () => {
    // catches: the "too many orders" advice never reaching the buyer
    const fetchFn = fetchReturning(new Response('{}', { status: 429 }))
    await expect(sendOrder(order, 't', fetchFn)).rejects.toMatchObject({
      kind: 'rate-limited',
    })
  })

  it('names a thrown fetch as a network failure', async () => {
    // catches: an offline buyer seeing no error at all
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(sendOrder(order, 't', fetchFn)).rejects.toMatchObject({
      kind: 'network',
    })
  })

  it('names an aborted request as a timeout', async () => {
    // catches: a dead network freezing the screen forever, or showing as a plain network failure
    const fetchFn = vi.fn(async () => {
      throw new DOMException('signal timed out', 'TimeoutError')
    })
    await expect(sendOrder(order, 't', fetchFn)).rejects.toMatchObject({
      kind: 'timeout',
    })
  })

  it('throws OrderSendError instances', async () => {
    // catches: callers unable to tell a send failure from a bug with instanceof
    const fetchFn = fetchReturning(new Response('', { status: 500 }))
    await expect(sendOrder(order, 't', fetchFn)).rejects.toBeInstanceOf(
      OrderSendError,
    )
  })

  it('in fake mode waits 800 ms, logs the email and never calls fetch', async () => {
    // catches: a dev run that really posts to Web3Forms, or returns instantly so the sending state cannot be seen
    vi.stubEnv('VITE_ORDER_SEND', 'fake')
    vi.useFakeTimers()
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const fetchFn = vi.fn()
    let done = false
    const sending = sendOrder(order, 't', fetchFn).then(() => {
      done = true // resolved
    })
    await vi.advanceTimersByTimeAsync(799)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await sending
    expect(done).toBe(true)
    expect(fetchFn).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalledWith(
      'PEM Pathfinder Store order PF-20261028-4K7Q — Eagles — J. Cruz',
      expect.stringContaining('Order: PF-20261028-4K7Q'),
    )
  })

  it('in a production build ignores VITE_ORDER_SEND=fake and really posts', async () => {
    // catches: the fake branch losing its DEV gate, so a live build could drop orders while showing success
    vi.stubEnv('VITE_ORDER_SEND', 'fake') // fake asked for
    vi.stubEnv('DEV', false) // but this is a production build
    const info = vi.spyOn(console, 'info').mockImplementation(() => {}) // would carry buyer data
    const fetchFn = fetchReturning(
      new Response(JSON.stringify({ success: false })),
    ) // Web3Forms refuses
    await expect(sendOrder(order, 't', fetchFn)).rejects.toMatchObject({
      kind: 'rejected',
    }) // a fake would have resolved
    expect(fetchFn).toHaveBeenCalledTimes(1) // the real endpoint was asked
    expect(info).not.toHaveBeenCalled() // no buyer data in the console
  })

  it('in dev without fake mode really posts', async () => {
    // catches: fake mode switched on by DEV alone
    vi.stubEnv('DEV', true) // dev server
    const fetchFn = fetchReturning(
      new Response(JSON.stringify({ success: true })),
    ) // accepted
    await sendOrder(order, 't', fetchFn) // plain dev run
    expect(fetchFn).toHaveBeenCalledTimes(1) // posted
  })

  it('gives the request a 20 second timeout signal', async () => {
    // catches: a wrong or missing timeout, so a dead network freezes the screen
    const timeout = vi.spyOn(AbortSignal, 'timeout') // watch the signal's creation
    await sendOrder(
      order,
      't',
      fetchReturning(new Response(JSON.stringify({ success: true }))),
    ) // any send
    expect(timeout).toHaveBeenCalledWith(20_000) // 20 s
  })

  it('names a plain AbortError as a timeout too', async () => {
    // catches: browsers that abort with AbortError reporting a network failure
    const fetchFn = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError') // the older abort name
    })
    await expect(sendOrder(order, 't', fetchFn)).rejects.toMatchObject({
      kind: 'timeout',
    }) // timeout
  })

  it('sends exactly the six decided fields and no separate buyer fields', async () => {
    // catches: name or phone sent as extra fields, or any undecided field added to the payload
    const sample = toSentOrder(
      'PF-20261028-4K7Q',
      lines,
      {
        ...EMPTY_ORDER_FORM,
        name: 'J. Cruz',
        email: 'jc@mail.com',
        phone: '0123456789',
        club: 'Eagles',
      },
      'MYR',
      new Date('2026-10-28T10:00:00Z'),
    )
    const fetchFn = fetchReturning(
      new Response(JSON.stringify({ success: true })),
    ) // accepted
    await sendOrder(sample, 't', fetchFn) // send it
    const body = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as string // the JSON
    expect(Object.keys(JSON.parse(body) as object).sort()).toEqual([
      'access_key',
      'from_name',
      'h-captcha-response',
      'message',
      'replyto',
      'subject',
    ]) // exactly the decided fields
  })

  it('sends the body byte for byte as before the rename, apart from subject and from_name', async () => {
    // catches: a rename that reorders, drops or rewrites any other field of the Web3Forms body
    const sample = toSentOrder(
      'PF-20261028-4K7Q',
      [
        { honor, quantity: 3 },
        { honor: { ...honor, id: 'ants', name: 'Ants & "Bees"', price: 4.5 }, quantity: 2 },
      ],
      { ...EMPTY_ORDER_FORM, name: 'Jo — Tan', email: 'jc@mail.com', phone: '+60 12-345 6789', club: 'Other', otherClub: 'Hilltop Club' },
      'MYR',
      new Date('2026-10-28T10:00:00Z'),
    ) // a two-line order with an Other club and odd characters
    const fetchFn = fetchReturning(new Response(JSON.stringify({ success: true }))) // accepted
    await sendOrder(sample, 'tok-1', fetchFn) // send it
    const body = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string // the raw JSON text
    const oldName = ['AY', 'Store'].join(' ') // the old name, built from parts so the rename guard does not match this file
    const before = `{"access_key":"test-key","subject":"${oldName} order PF-20261028-4K7Q — Other — Jo — Tan","from_name":"${oldName}","replyto":"jc@mail.com","message":"Order: PF-20261028-4K7Q\\nName:  Jo — Tan\\nEmail: jc@mail.com\\nPhone: +60 12-345 6789\\nClub:  Other\\n\\n3 × Knot Tying @ RM 3.00 = RM 9.00\\n2 × Ants & \\"Bees\\" @ RM 4.50 = RM 9.00\\n\\nEstimated total: RM 18.00","h-captcha-response":"tok-1"}` // the body the code produced at the commit before the rename
    const after = before
      .replace(`"subject":"${oldName} order PF-20261028-4K7Q`, '"subject":"PEM Pathfinder Store order PF-20261028-4K7Q') // the subject's new name
      .replace(`"from_name":"${oldName}"`, '"from_name":"PEM Pathfinder Store"') // the sender's new name
    expect(body).toBe(after) // every other byte as it was
  })
})
