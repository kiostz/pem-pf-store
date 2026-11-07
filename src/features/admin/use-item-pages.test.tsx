// Tests for the page-loading hook with fetch stubbed at the boundary: the debounce, Enter, stale answers, sorting, Load more, and its failures.

import { act, renderHook } from '@testing-library/react' // hook rendering
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API
import { makeItem } from '@/test/item-fixtures.ts' // row builder
import { useItemPages } from './use-item-pages.ts' // the code under test

const page = (ids: string[], nextCursor: string | null = null) =>
  Response.json({ items: ids.map((id) => makeItem({ id })), nextCursor }) // a page answer

/**
 * Stubs fetch with a handler and returns the requested URLs.
 * @param handler answers one GET
 * @return the list that fills with each URL
 */
function stubPages(handler: (url: string) => Response | Promise<Response>) {
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

describe('useItemPages', () => {
  it('loads the first page sorted by Recently changed with no cursor', async () => {
    // Catches a default sort other than Recently changed.
    const urls = stubPages(() => page(['a', 'b'], 'next'))
    const { result } = renderHook(() => useItemPages())
    await act(async () => undefined)
    expect(urls).toEqual(['/api/items?sort=changed'])
    expect(result.current.rows.map((row) => row.id)).toEqual(['a', 'b'])
    expect(result.current.hasMore).toBe(true)
    expect(result.current.pageState).toBe('idle')
  })

  it('sends one request after the typing pause, not one per key', async () => {
    // Catches a request per keystroke.
    const urls = stubPages(() => page([]))
    const { result } = renderHook(() => useItemPages())
    await act(async () => undefined)
    act(() => result.current.setQuery('k'))
    act(() => result.current.setQuery('kn'))
    act(() => result.current.setQuery('kno'))
    await act(async () => void vi.advanceTimersByTime(249))
    expect(urls).toHaveLength(1)
    await act(async () => void vi.advanceTimersByTime(2))
    expect(urls).toEqual(['/api/items?sort=changed', '/api/items?sort=changed&q=kno'])
  })

  it('searches at once on Enter and does not search again when the pause ends', async () => {
    // Catches Enter that waits for the pause, or a duplicate request after it.
    const urls = stubPages(() => page([]))
    const { result } = renderHook(() => useItemPages())
    await act(async () => undefined)
    act(() => result.current.setQuery('knot'))
    act(() => result.current.submitQuery())
    await act(async () => void vi.advanceTimersByTime(1000))
    expect(urls).toEqual(['/api/items?sort=changed', '/api/items?sort=changed&q=knot'])
  })

  it('fetches again when Enter is pressed on a search that has not changed', async () => {
    // Catches Enter that does nothing on the same words, leaving an admin looking at a list that went stale.
    const urls = stubPages(() => page([]))
    const { result } = renderHook(() => useItemPages())
    await act(async () => undefined)
    act(() => result.current.setQuery('knot'))
    act(() => result.current.submitQuery())
    await act(async () => undefined)
    act(() => result.current.submitQuery())
    await act(async () => undefined)
    expect(urls).toEqual([
      '/api/items?sort=changed',
      '/api/items?sort=changed&q=knot',
      '/api/items?sort=changed&q=knot',
    ])
  })

  it('ignores a late answer to an old query', async () => {
    // Catches slow old results replacing the rows of the newer search.
    const answers: Record<string, (response: Response) => void> = {} // settles each request by URL
    stubPages((url) => new Promise<Response>((resolve) => (answers[url] = resolve)))
    const { result } = renderHook(() => useItemPages())
    await act(async () => undefined)
    act(() => result.current.setCategory('Honors')) // the Honors category filter
    await act(async () => undefined)
    await act(async () => answers['/api/items?sort=changed&category=Honors'](page(['new']))) // the Honors category filter
    await act(async () => answers['/api/items?sort=changed'](page(['old'])))
    expect(result.current.rows.map((row) => row.id)).toEqual(['new'])
  })

  it('fetches again with no cursor when the sort changes', async () => {
    // Catches a sort change that continues from the old sort's cursor.
    const urls = stubPages(() => page(['a'], 'cursor-1'))
    const { result } = renderHook(() => useItemPages())
    await act(async () => undefined)
    act(() => result.current.setSort('name'))
    await act(async () => undefined)
    expect(urls[1]).toBe('/api/items?sort=name')
  })

  it('appends the next page, skips ids already listed, and ends when the cursor is null', async () => {
    // Catches a repeated row when the list changed between pages.
    stubPages((url) => (url.includes('cursor=c1') ? page(['b', 'c']) : page(['a', 'b'], 'c1')))
    const { result } = renderHook(() => useItemPages())
    await act(async () => undefined)
    await act(async () => result.current.loadMore())
    expect(result.current.rows.map((row) => row.id)).toEqual(['a', 'b', 'c'])
    expect(result.current.hasMore).toBe(false)
  })

  it('shows more while loading more, and keeps the rows when it fails, then retries', async () => {
    // Catches a Load more error that wipes the list.
    let fail = true
    stubPages((url) =>
      url.includes('cursor=c1') ? (fail ? Response.json({}, { status: 500 }) : page(['c'])) : page(['a'], 'c1'),
    )
    const { result } = renderHook(() => useItemPages())
    await act(async () => undefined)
    await act(async () => result.current.loadMore())
    expect(result.current.pageState).toBe('more-error')
    expect(result.current.rows.map((row) => row.id)).toEqual(['a'])
    fail = false
    await act(async () => result.current.loadMore())
    expect(result.current.rows.map((row) => row.id)).toEqual(['a', 'c'])
    expect(result.current.pageState).toBe('idle')
  })

  it('gives error on a failed first page, and Try again loads it', async () => {
    // Catches a failed first page with no way forward.
    let calls = 0
    stubPages(() => (++calls === 1 ? Response.json({}, { status: 500 }) : page(['a'])))
    const { result } = renderHook(() => useItemPages())
    await act(async () => undefined)
    expect(result.current.pageState).toBe('error')
    act(() => result.current.retry())
    await act(async () => undefined)
    expect(result.current.rows).toHaveLength(1)
  })

  it('gives more-signed-out on a 403 on Load more, keeps the rows, and loads again once signed in', async () => {
    // Catches an expired session that empties the list, or a Load more that stays dead after the admin signs in elsewhere.
    let signedIn = false
    stubPages((url) =>
      url.includes('cursor=') ? (signedIn ? page(['b']) : Response.json({}, { status: 403 })) : page(['a'], 'c1'),
    )
    const { result } = renderHook(() => useItemPages())
    await act(async () => undefined)
    await act(async () => result.current.loadMore())
    expect(result.current.pageState).toBe('more-signed-out')
    expect(result.current.rows).toHaveLength(1)
    signedIn = true
    await act(async () => result.current.loadMore())
    expect(result.current.rows.map((row) => row.id)).toEqual(['a', 'b'])
    expect(result.current.pageState).toBe('idle')
  })

  it('collapses the search to five words', async () => {
    // Catches a six-word search the Worker would refuse with 400.
    const urls = stubPages(() => page([]))
    const { result } = renderHook(() => useItemPages())
    await act(async () => undefined)
    act(() => result.current.search('a  b c d e f'))
    await act(async () => undefined)
    expect(urls[1]).toBe('/api/items?sort=changed&q=a+b+c+d+e')
  })
})
