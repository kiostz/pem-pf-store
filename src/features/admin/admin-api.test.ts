// Tests for the admin API module with fetch stubbed at the boundary: the request each call builds and how each answer maps to a result kind.

import { afterEach, describe, expect, it, vi } from 'vitest' // test API
import {
  addItem,
  deleteItem,
  loadItemPage,
  loadMeta,
  sendHonorChanges,
} from './admin-api.ts' // the code under test
import { makeItem, meta } from './item-fixtures.ts' // shared rows

const knot = makeItem({ id: 'knot-tying', name: 'Knot Tying' }) // a valid row

/**
 * Stubs fetch with one answer.
 * @param answer the response, or an error to reject with
 * @return the spy
 */
function stubFetch(answer: Response | Error) {
  const spy = vi.fn(() =>
    answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer),
  ) // answers once per call
  vi.stubGlobal('fetch', spy) // the page's fetch
  return spy
}

/**
 * Makes the response a browser gives for a blocked redirect.
 * @return a response whose type is opaqueredirect
 */
function opaqueRedirect(): Response {
  const response = new Response(null) // an empty response
  Object.defineProperty(response, 'type', { value: 'opaqueredirect' }) // what redirect: 'manual' yields
  return response
}

afterEach(() => vi.unstubAllGlobals()) // no stub leaks on

describe('loadItemPage', () => {
  it('asks for the sort, search, category and cursor in the query, without following redirects', async () => {
    // Catches a filter that never reaches D1, or a load that follows an Access redirect into a login page.
    const spy = stubFetch(Response.json({ honors: [knot], nextCursor: 'abc' }))
    const result = await loadItemPage({
      sort: 'newest',
      q: 'knot tying',
      category: 'Recreation',
      cursor: 'c1',
    })
    expect(result).toEqual({ kind: 'ok', honors: [knot], nextCursor: 'abc' })
    const calls = spy.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0][0]).toBe(
      '/api/items?sort=newest&q=knot+tying&category=Recreation&cursor=c1',
    )
    expect(calls[0][1]).toMatchObject({ redirect: 'manual' })
  })

  it('leaves out an empty search, category and cursor', async () => {
    // Catches "q=&category=" reaching the Worker, which would answer 400.
    const spy = stubFetch(Response.json({ honors: [], nextCursor: null }))
    await loadItemPage({ sort: 'changed', q: '', category: null, cursor: null })
    expect((spy.mock.calls as unknown as [string][])[0][0]).toBe(
      '/api/items?sort=changed',
    )
  })

  it('maps an opaque redirect and a 403 to signed-out, and a 400, a 500, a network error and a wrong shape to error', async () => {
    // Catches an expired session shown as a failure, or a malformed page trusted.
    const body = { honors: [knot], nextCursor: null }
    stubFetch(opaqueRedirect())
    expect(
      await loadItemPage({
        sort: 'changed',
        q: '',
        category: null,
        cursor: null,
      }),
    ).toEqual({ kind: 'signed-out' })
    stubFetch(Response.json({ error: 'forbidden' }, { status: 403 }))
    expect(
      await loadItemPage({
        sort: 'changed',
        q: '',
        category: null,
        cursor: null,
      }),
    ).toEqual({ kind: 'signed-out' })
    for (const answer of [
      Response.json({ error: 'invalid' }, { status: 400 }),
      Response.json({ error: 'server' }, { status: 500 }),
      Response.json({
        honors: [{ ...knot, priceCents: '4' }],
        nextCursor: null,
      }),
      Response.json({ ...body, nextCursor: 5 }),
      Response.json([knot]),
      new TypeError('Failed to fetch'),
    ]) {
      stubFetch(answer)
      expect(
        await loadItemPage({
          sort: 'changed',
          q: '',
          category: null,
          cursor: null,
        }),
      ).toEqual({ kind: 'error' })
    }
  })
})

describe('loadMeta', () => {
  it('reads the currency, default price and categories, and refuses a wrong shape', async () => {
    // Catches an Add sheet built from a malformed answer.
    stubFetch(Response.json(meta))
    expect(await loadMeta()).toEqual({ kind: 'ok', meta })
    stubFetch(
      Response.json({
        currency: 'MYR',
        defaultPriceCents: 4.5,
        categories: [],
      }),
    )
    expect(await loadMeta()).toEqual({ kind: 'error' })
    stubFetch(Response.json({}, { status: 403 }))
    expect(await loadMeta()).toEqual({ kind: 'signed-out' })
  })
})

describe('sendHonorChanges', () => {
  const changes = [{ id: 'knot-tying', stock: { from: 12, to: 5 } }] // one change

  it('posts the changes as JSON on the same origin without following redirects', async () => {
    // Catches a save without the JSON type the Worker demands, or one that follows a login redirect.
    const spy = stubFetch(Response.json({ honors: [knot] }))
    expect(await sendHonorChanges(changes)).toEqual({
      kind: 'saved',
      honors: [knot],
    })
    expect(spy).toHaveBeenCalledWith(
      '/api/items/changes',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes }),
      }),
    )
  })

  it('maps a 409 conflict to its rows and deleted ids, and a 409 name-taken to its ids', async () => {
    // Catches a refused save shown as saved, or the deleted ids lost.
    stubFetch(
      Response.json(
        { error: 'conflict', honors: [knot], deletedIds: ['gone'] },
        { status: 409 },
      ),
    )
    expect(await sendHonorChanges(changes)).toEqual({
      kind: 'conflict',
      honors: [knot],
      deletedIds: ['gone'],
    })
    stubFetch(
      Response.json(
        { error: 'name-taken', ids: ['knot-tying'] },
        { status: 409 },
      ),
    )
    expect(await sendHonorChanges(changes)).toEqual({
      kind: 'name-taken',
      ids: ['knot-tying'],
    })
  })

  it('maps signed-out, a 500, an unreadable answer and a network error', async () => {
    // Catches a failure that reads as success.
    stubFetch(Response.json({}, { status: 403 }))
    expect(await sendHonorChanges(changes)).toEqual({ kind: 'signed-out' })
    stubFetch(Response.json({ error: 'server' }, { status: 500 }))
    expect(await sendHonorChanges(changes)).toEqual({ kind: 'error' })
    stubFetch(new Response('<html>', { status: 200 }))
    expect(await sendHonorChanges(changes)).toEqual({ kind: 'error' })
    stubFetch(new TypeError('Failed to fetch'))
    expect(await sendHonorChanges(changes)).toEqual({ kind: 'error' })
  })
})

describe('addItem', () => {
  const input = { name: 'Camp Shirt', category: 'Shirt', priceCents: 2500 } // a new item

  it('posts the item and maps 201, name-taken, id-taken, signed-out and failures', async () => {
    // Catches an Add that cannot tell the two 409s apart, which need different words.
    const spy = stubFetch(Response.json({ honor: knot }, { status: 201 }))
    expect(await addItem(input)).toEqual({ kind: 'added', honor: knot })
    expect(spy).toHaveBeenCalledWith(
      '/api/items',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    )
    stubFetch(Response.json({ error: 'name-taken' }, { status: 409 }))
    expect(await addItem(input)).toEqual({ kind: 'name-taken' })
    stubFetch(Response.json({ error: 'id-taken' }, { status: 409 }))
    expect(await addItem(input)).toEqual({ kind: 'id-taken' })
    stubFetch(Response.json({}, { status: 403 }))
    expect(await addItem(input)).toEqual({ kind: 'signed-out' })
    stubFetch(Response.json({ error: 'invalid' }, { status: 400 }))
    expect(await addItem(input)).toEqual({ kind: 'error' })
    stubFetch(new TypeError('Failed to fetch'))
    expect(await addItem(input)).toEqual({ kind: 'error' })
  })
})

describe('deleteItem', () => {
  const request = {
    id: 'camp-shirt',
    seen: {
      name: 'Camp Shirt',
      category: 'Shirt',
      priceCents: 2500,
      status: 'hidden' as const,
      stock: 0,
      modifiedAt: '2026-11-03T02:00:00.000Z',
    },
  } // a delete request

  it('posts the request and maps deleted, conflict, built-in, signed-out and failures', async () => {
    // Catches a built-in refusal or a changed item read as deleted.
    const spy = stubFetch(Response.json({ deletedId: 'camp-shirt' }))
    expect(await deleteItem(request)).toEqual({
      kind: 'deleted',
      deletedId: 'camp-shirt',
    })
    expect(spy).toHaveBeenCalledWith(
      '/api/items/delete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(request),
      }),
    )
    stubFetch(
      Response.json({ error: 'conflict', honors: [knot] }, { status: 409 }),
    )
    expect(await deleteItem(request)).toEqual({
      kind: 'conflict',
      honors: [knot],
    })
    stubFetch(Response.json({ error: 'built-in' }, { status: 400 }))
    expect(await deleteItem(request)).toEqual({ kind: 'built-in' })
    stubFetch(Response.json({}, { status: 403 }))
    expect(await deleteItem(request)).toEqual({ kind: 'signed-out' })
    stubFetch(Response.json({ error: 'server' }, { status: 500 }))
    expect(await deleteItem(request)).toEqual({ kind: 'error' })
  })
})
