// Tests for useCatalogueData: the one /shop load, loader delay, 30 s cap, retry and stale-attempt guard, with fetch mocked at the boundary.

import { StrictMode } from 'react' // StrictMode runs the load effect twice, leaving one stale attempt
import { act, render, renderHook, screen, waitFor } from '@testing-library/react' // run the hook
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import { item, shopBody } from '@/test/shop-fetch.ts' // an item and the /shop body
import { useCatalogueData } from './use-catalogue-data.ts' // code under test

const knot = item('knot-tying', 'Knot Tying') // the one item of the fake shop
const eagles = { name: 'Eagles', area: null, language: null, location: null, churchName: null } // a valid club

/**
 * Makes the global fetch answer with the given function.
 * @param answer builds the response for each request; it gets the request's options
 * @return the fetch mock, to count calls and read the signal
 */
function serve(answer: (init?: RequestInit) => Promise<Response>) {
  const fetchFn = vi.fn((_url: string, init?: RequestInit) => answer(init)) // every request goes to the answer
  vi.stubGlobal('fetch', fetchFn) // install it
  return fetchFn
}

/**
 * Builds an answer function that gives 200 with the shop body.
 * @param items the items to list
 * @return a function that returns the response
 */
const ok = (items = [knot]) => async () => new Response(JSON.stringify(shopBody(items, [eagles]))) // a 200 answer

/** An answer that never arrives, until the request is aborted. */
const hang = (init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) =>
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
  ) // rejects like fetch when the signal fires

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true }) // control the 300 ms loader delay, keep promises moving
  vi.spyOn(console, 'error').mockImplementation(() => {}) // the hook logs a failed load; keep test output clean
})

afterEach(() => {
  vi.useRealTimers() // restore the clock
  vi.unstubAllGlobals() // restore fetch
  vi.restoreAllMocks() // restore console
})

describe('useCatalogueData', () => {
  it('becomes ready with items, settings and clubs from one request', async () => { // the ready state holds items
    // catches: three requests again, or settings or clubs dropped from the ready state
    const fetchFn = serve(ok())
    const { result } = renderHook(() => useCatalogueData())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(result.current.state).toEqual({ status: 'ready', items: [knot], settings: { currency: 'MYR' }, clubs: [eagles] }) // the ready state with its items
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('is a failed error when the request fails', async () => {
    // catches: an outage showing an empty list instead of the error state
    serve(async () => new Response('', { status: 500 }))
    const { result } = renderHook(() => useCatalogueData())
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error', reason: 'failed' }))
  })

  it('passes busy through from a 429', async () => {
    // catches: the rate limit reaching the screens as a plain failure
    serve(async () => new Response('{"error":"rate-limited"}', { status: 429 }))
    const { result } = renderHook(() => useCatalogueData())
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error', reason: 'busy' }))
  })

  it('shows the skeleton only from 300 ms', () => {
    // catches: a skeleton flash on fast loads, or one that never appears
    serve(hang)
    const { result } = renderHook(() => useCatalogueData())
    expect(result.current.showSkeleton).toBe(false)
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current.showSkeleton).toBe(false)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.showSkeleton).toBe(true)
  })

  it('is loading at 29,999 ms and failed at 30,000 ms, with the request aborted', async () => {
    // catches: no cap (a slow Worker loads forever), a cap that fires early, or one that leaves the request running
    const fetchFn = serve(hang)
    const { result } = renderHook(() => useCatalogueData())
    act(() => {
      vi.advanceTimersByTime(29_999)
    })
    expect(result.current.state.status).toBe('loading')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error', reason: 'failed' }))
    expect(fetchFn.mock.calls[0][1]?.signal?.aborted).toBe(true)
  })

  it('ignores an answer that arrives after the cap', async () => {
    // catches: a late answer flipping the error screen back to the shop
    let answer: (response: Response) => void = () => {} // answers on demand
    serve(() => new Promise<Response>((resolve) => (answer = resolve))) // ignores the signal, like a request already past the network
    const { result } = renderHook(() => useCatalogueData())
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    await act(async () => answer(new Response(JSON.stringify(shopBody([knot])))))
    expect(result.current.state.status).toBe('error')
  })

  it('waits the loader delay and the 30 s again after retry, then loads', async () => {
    // catches: retry flashing the skeleton at once, the old cap ending the new attempt, or not loading again
    let calls = 0 // counts requests
    serve((init) => (++calls === 1 ? Promise.resolve(new Response('', { status: 500 })) : hang(init))) // first fails, retry hangs
    const { result } = renderHook(() => useCatalogueData())
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    act(() => result.current.retry()) // press Try again
    expect(result.current.state.status).toBe('loading')
    expect(result.current.showSkeleton).toBe(false)
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current.showSkeleton).toBe(false)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.showSkeleton).toBe(true)
    act(() => {
      vi.advanceTimersByTime(29_699)
    })
    expect(result.current.state.status).toBe('loading') // 29,999 ms after the retry
    act(() => {
      vi.advanceTimersByTime(1)
    })
    await waitFor(() => expect(result.current.state.status).toBe('error')) // 30,000 ms after the retry
    expect(calls).toBe(2)
  })

  it('ignores a late answer from a stale attempt', async () => {
    // catches: an older request overwriting the newer answer
    let answerFirst: (response: Response) => void = () => {} // answers the older attempt on demand
    let calls = 0 // counts requests
    serve(() =>
      ++calls === 1
        ? new Promise<Response>((resolve) => (answerFirst = resolve)) // older attempt, slow
        : ok()(), // newer attempt, fast
    )
    /**
     * Shows the hook's status and item count, so a plain render inside StrictMode can read them.
     * @return a line of text
     */
    function Probe() {
      const { state } = useCatalogueData() // the hook under test
      return <p>{state.status === 'ready' ? `ready ${state.items.length}` : state.status}</p> // status and count
    }
    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    ) // StrictMode runs the load effect twice: the first attempt is stale
    expect(await screen.findByText('ready 1')).toBeInTheDocument()
    expect(calls).toBe(2) // StrictMode really made a stale first attempt
    await act(async () => answerFirst(new Response(JSON.stringify(shopBody([])))) ) // the stale answer arrives last
    expect(screen.getByText('ready 1')).toBeInTheDocument()
  })

  it('updates nothing and aborts the request when it unmounts mid-load', async () => {
    // catches: a state update or a logged failure after unmount, or a request left running
    const fetchFn = serve(hang)
    let renders = 0 // draws of the hook's owner
    const { unmount } = renderHook(() => {
      renders += 1 // one more draw
      return useCatalogueData()
    })
    const drawnBeforeUnmount = renders // draws up to the unmount
    unmount()
    expect(fetchFn.mock.calls[0][1]?.signal?.aborted).toBe(true) // the request was stopped
    await act(async () => {
      vi.advanceTimersByTime(40_000) // past the 30 s cap
    })
    expect(renders).toBe(drawnBeforeUnmount) // nothing drew after unmount
    expect(console.error).not.toHaveBeenCalled() // neither the abort nor the cap is logged as a failed load
  })
  it('applyStock sets a listed item\'s stock and drops an item the Worker reported as not for sale', async () => { // applyStock updates stock and drops null ids
    // catches: a refusal that leaves the cart showing the old stock, or a Hidden item that stays orderable
    serve(ok([knot, item('ants', 'Ants')])) // the Worker answers with these items
    const { result } = renderHook(() => useCatalogueData())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    act(() => result.current.applyStock([{ itemId: 'knot-tying', stock: 1 }, { itemId: 'ants', stock: null }]))
    expect(result.current.state).toEqual({
      status: 'ready',
      items: [{ ...knot, stock: 1 }], // one item with its stock set
      settings: { currency: 'MYR' },
      clubs: [eagles],
    })
  })

  it('applyStock keeps every item it did not name, in the same order, and ignores an id the shop does not list', async () => { // applyStock leaves unnamed items and their order alone
    // catches: a patch that drops or reorders the items the refusal never mentioned, or one that adds an unknown id
    serve(ok([knot, item('ants', 'Ants'), item('birds', 'Birds')])) // the Worker answers with these items
    const { result } = renderHook(() => useCatalogueData())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    act(() => result.current.applyStock([{ itemId: 'ants', stock: 2 }, { itemId: 'no-such-item', stock: 5 }])) // an id the shop does not list
    expect(result.current.state).toMatchObject({
      status: 'ready',
      items: [knot, { ...item('ants', 'Ants'), stock: 2 }, item('birds', 'Birds')], // three items before the patch
    })
  })

  it('applyStock keeps an item whose stock is now 0 in the list, as Sold out, and only a null drops it', async () => { // applyStock keeps stock 0 items and drops only null
    // catches: a falsy check that treats 0 like null, so the last item sold to another buyer vanishes instead of showing Sold out
    serve(ok([knot, item('ants', 'Ants')])) // the Worker answers with these items
    const { result } = renderHook(() => useCatalogueData())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    act(() => result.current.applyStock([{ itemId: 'knot-tying', stock: 0 }]))
    expect(result.current.state).toMatchObject({ items: [{ ...knot, stock: 0 }, item('ants', 'Ants')] }) // stock patched, untouched items kept
  })

  it('applyStock adds up over two refusals, and an empty one changes nothing', async () => {
    // catches: the second refusal rebuilding from the first load and undoing the first patch, or an empty list wiping the data
    serve(ok([knot, item('ants', 'Ants')])) // the Worker answers with these items
    const { result } = renderHook(() => useCatalogueData())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    act(() => result.current.applyStock([{ itemId: 'knot-tying', stock: 1 }]))
    act(() => result.current.applyStock([{ itemId: 'ants', stock: null }]))
    act(() => result.current.applyStock([]))
    expect(result.current.state).toMatchObject({ items: [{ ...knot, stock: 1 }] }) // stock patched on the one item
  })

  it('applyStock leaves the data alone while loading and after an error', async () => {
    // catches: a stock refusal turning a loading or failed screen into a half-built ready one
    serve(hang)
    const loading = renderHook(() => useCatalogueData())
    act(() => loading.result.current.applyStock([{ itemId: 'knot-tying', stock: 0 }]))
    expect(loading.result.current.state).toEqual({ status: 'loading' })
    loading.unmount()
    serve(async () => new Response('', { status: 500 }))
    const failed = renderHook(() => useCatalogueData())
    await waitFor(() => expect(failed.result.current.state.status).toBe('error'))
    act(() => failed.result.current.applyStock([{ itemId: 'knot-tying', stock: 0 }]))
    expect(failed.result.current.state).toEqual({ status: 'error', reason: 'failed' })
  })
})
