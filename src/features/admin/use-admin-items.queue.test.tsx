// Test for the Items hook's queue when a save throws: the one case the Workers' HTTP stub cannot reach, because the API layer turns every network failure into an error answer, so the save call itself is replaced here.

import { act, renderHook, waitFor } from '@testing-library/react' // hook rendering
import { afterEach, describe, expect, it, vi } from 'vitest' // test API
import { meta, rows } from '@/test/item-fixtures.ts' // shared items
import { sendItemChanges } from './admin-api.ts' // the save call, replaced below
import { useAdminItems } from './use-admin-items.ts' // the code under test

vi.mock('./admin-api.ts', async (importOriginal) => ({ // the API module with one call replaced
  ...(await importOriginal<typeof import('./admin-api.ts')>()), // every other call stays real, over the stubbed fetch
  sendItemChanges: vi.fn(), // only the save is replaced
})) // so a test can make the save throw

afterEach(() => vi.unstubAllGlobals()) // no stub leaks on

describe('useAdminItems queue', () => { // what waits for a save
  it('still runs a reload that waited when the save throws', async () => { // a throw must not hold the queue
    // catches: a queue that stays held after an unexpected throw in the save, so restocks never reload again
    const urls: string[] = [] // every URL asked
    vi.stubGlobal('fetch', (url: unknown) => { // the page's fetch
      urls.push(String(url)) // recorded
      return Promise.resolve(String(url).startsWith('/api/meta') ? Response.json(meta) : Response.json({ items: rows, nextCursor: null })) // meta or a page
    })
    let fail: (error: Error) => void = () => undefined // makes the save throw
    vi.mocked(sendItemChanges).mockReturnValue(new Promise((_resolve, reject) => (fail = reject))) // a save that waits, then throws
    const { result } = renderHook(() => useAdminItems()) // the hook
    await waitFor(() => expect(result.current.pages.rows).toHaveLength(4)) // the rows have loaded
    act(() => result.current.setStatus(result.current.pages.rows[2], 'hidden')) // pending: Hidden
    const lists = () => urls.filter((url) => url.startsWith('/api/items?')).length // the list requests so far
    let saving: Promise<void> = Promise.resolve() // the running save
    act(() => { saving = result.current.save() }) // starts the save
    act(() => result.current.reloadList()) // a restock during it: queued
    expect(lists()).toBe(1) // it waits
    await act(async () => { fail(new Error('boom')); await saving.catch(() => undefined) }) // the save throws
    await waitFor(() => expect(lists()).toBe(2)) // the queued reload still runs
  })
})
