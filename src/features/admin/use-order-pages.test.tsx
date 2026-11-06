// Tests for the order-paging hook with fetch stubbed at the boundary: the filter, stale answers, Load more and its failures, and signed-out.

import { act, renderHook } from '@testing-library/react' // hook rendering
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API
import { orderAt } from '@/test/order-fixtures.ts' // order builder
import { useOrderPages } from './use-order-pages.ts' // the code under test

const page = (numbers: string[], nextCursor: string | null = null) =>
  Response.json({ orders: numbers.map((number) => orderAt(number, 'new')), nextCursor }) // a page answer

/**
 * Stubs fetch with a handler and returns the requested URLs.
 * @param handler answers one GET
 * @return the list that fills with each URL
 */
function stubOrders(handler: (url: string) => Response | Promise<Response>) {
  const urls: string[] = [] // every URL asked
  vi.stubGlobal('fetch', (url: unknown) => {
    urls.push(String(url)) // record
    return Promise.resolve().then(() => handler(String(url))) // answer
  })
  return urls
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true })) // time moves, and the tests can jump it
afterEach(() => {
  vi.useRealTimers() // the real clock
  vi.unstubAllGlobals() // no stub leaks on
})

describe('useOrderPages', () => {
  it('loads the first page with no cursor and no filter', async () => {
    // Catches a default filter or a cursor on the first page.
    const urls = stubOrders(() => page(['PF-20261105-AAAA'], 'next'))
    const { result } = renderHook(() => useOrderPages(null))
    await act(async () => undefined)
    expect(urls).toEqual(['/api/orders'])
    expect(result.current.rows.map((row) => row.number)).toEqual(['PF-20261105-AAAA'])
    expect(result.current.hasMore).toBe(true)
  })

  it('fetches again with no cursor when the step changes, and sends only the number for a lookup', async () => {
    // Catches a step change that continues the old cursor, or a number sent with a step (the Worker refuses both).
    const urls = stubOrders(() => page(['PF-20261105-AAAA'], 'next'))
    const { result } = renderHook(() => useOrderPages(null))
    await act(async () => undefined)
    act(() => result.current.setStep('paid'))
    await act(async () => undefined)
    act(() => result.current.setNumber('PF-20261105-AAAA'))
    await act(async () => undefined)
    expect(urls).toEqual(['/api/orders', '/api/orders?step=paid', '/api/orders?number=PF-20261105-AAAA'])
  })

  it('ignores a late answer to an old filter', async () => {
    // Catches a slow All answer overwriting the Paid list.
    let release: (response: Response) => void = () => undefined
    stubOrders((url) =>
      url === '/api/orders' ? new Promise<Response>((resolve) => (release = resolve)) : page(['PF-20261104-BBBB']),
    )
    const { result } = renderHook(() => useOrderPages(null))
    act(() => result.current.setStep('paid'))
    await act(async () => undefined)
    await act(async () => release(page(['PF-20261105-AAAA'])))
    expect(result.current.rows.map((row) => row.number)).toEqual(['PF-20261104-BBBB'])
  })

  it('appends the next page without repeats', async () => {
    // Catches an order that moved between pages being listed twice.
    stubOrders((url) =>
      url.includes('cursor=next') ? page(['PF-20261105-AAAA', 'PF-20261104-BBBB']) : page(['PF-20261105-AAAA'], 'next'),
    )
    const { result } = renderHook(() => useOrderPages(null))
    await act(async () => undefined)
    await act(async () => result.current.loadMore())
    expect(result.current.rows.map((row) => row.number)).toEqual(['PF-20261105-AAAA', 'PF-20261104-BBBB'])
    expect(result.current.hasMore).toBe(false)
  })

  it('keeps the rows when Load more fails, and tries again', async () => {
    // Catches a failed page wiping the list.
    let fail = true
    stubOrders((url) =>
      url.includes('cursor=next')
        ? fail
          ? Response.json({}, { status: 500 })
          : page(['PF-20261104-BBBB'])
        : page(['PF-20261105-AAAA'], 'next'),
    )
    const { result } = renderHook(() => useOrderPages(null))
    await act(async () => undefined)
    await act(async () => result.current.loadMore())
    expect(result.current.pageState).toBe('more-error')
    expect(result.current.rows).toHaveLength(1)
    fail = false
    await act(async () => result.current.loadMore())
    expect(result.current.rows).toHaveLength(2)
  })

  it('reports signed-out for a 403 and error for a 500', async () => {
    // Catches a 403 shown as a plain failure, or a 500 as signed-out.
    stubOrders(() => Response.json({}, { status: 403 }))
    const first = renderHook(() => useOrderPages(null))
    await act(async () => undefined)
    expect(first.result.current.pageState).toBe('signed-out')
    stubOrders(() => Response.json({}, { status: 500 }))
    const second = renderHook(() => useOrderPages(null))
    await act(async () => undefined)
    expect(second.result.current.pageState).toBe('error')
  })

  it('replaces one order in place', async () => {
    // Catches a changed step that leaves the old row or moves it.
    stubOrders(() => page(['PF-20261105-AAAA', 'PF-20261104-BBBB']))
    const { result } = renderHook(() => useOrderPages(null))
    await act(async () => undefined)
    act(() => result.current.replaceOrder(orderAt('PF-20261105-AAAA', 'paid')))
    expect(result.current.rows.map((row) => `${row.number}:${row.step}`)).toEqual([
      'PF-20261105-AAAA:paid',
      'PF-20261104-BBBB:new',
    ])
  })
})
