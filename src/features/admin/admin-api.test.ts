// Tests for the admin API module with fetch stubbed at the boundary: the request each call builds and how each answer maps to a result kind.

import { afterEach, describe, expect, it, vi } from 'vitest' // test API
import {
  addClub,
  addItem,
  deleteItem,
  editClub,
  loadClubs,
  loadItemPage,
  loadMeta,
  moveClubs,
  removeClub,
  sendHonorChanges,
  uploadPicture,
} from './admin-api.ts' // the code under test
import { makeClub } from './club-fixtures.ts' // shared clubs
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

describe('uploadPicture', () => {
  const picture = new Blob(['webp-bytes'], { type: 'image/webp' }) // a resized picture
  const withPicture = { ...knot, image: 'items/knot-tying-1a2b3c4d.webp' } // the row after the upload

  it('posts the bytes with the picture type to the picture route, and leaves seen empty for null', async () => {
    // Catches a JSON body or the wrong type (the Worker refuses both), a wrongly encoded seen key, or a followed Access redirect.
    const spy = stubFetch(Response.json({ honor: withPicture }))
    await uploadPicture('knot-tying', 'items/knot-tying.webp', picture)
    expect(spy).toHaveBeenCalledWith(
      '/api/items/picture?id=knot-tying&seen=items%2Fknot-tying.webp',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'image/webp' },
        body: picture,
        redirect: 'manual',
        credentials: 'same-origin',
      }),
    )
    await uploadPicture('knot-tying', null, picture)
    expect(spy).toHaveBeenLastCalledWith('/api/items/picture?id=knot-tying&seen=', expect.anything())
  })

  it('maps 200 to saved with the checked row, and a row with a wrong image type to error', async () => {
    // Catches a row of the wrong shape entering the list.
    stubFetch(Response.json({ honor: withPicture }))
    expect(await uploadPicture('knot-tying', null, picture)).toEqual({ kind: 'saved', honor: withPicture })
    stubFetch(Response.json({ honor: { ...knot, image: 7 } }))
    expect(await uploadPicture('knot-tying', null, picture)).toEqual({ kind: 'error' })
  })

  it('maps 409 to conflict with the rows and deleted ids', async () => {
    // Catches a refused upload shown as saved, or a deleted item left in the list.
    stubFetch(Response.json({ error: 'conflict', honors: [withPicture], deletedIds: [] }, { status: 409 }))
    expect(await uploadPicture('knot-tying', null, picture)).toEqual({
      kind: 'conflict',
      honors: [withPicture],
      deletedIds: [],
    })
    stubFetch(Response.json({ error: 'conflict', honors: [], deletedIds: ['knot-tying'] }, { status: 409 }))
    expect(await uploadPicture('knot-tying', null, picture)).toEqual({
      kind: 'conflict',
      honors: [],
      deletedIds: ['knot-tying'],
    })
  })

  it('maps a 403 or a blocked redirect to signed-out, and a 500 or a network failure to error', async () => {
    // Catches an ended session or a dead network read as a save.
    stubFetch(Response.json({}, { status: 403 }))
    expect(await uploadPicture('knot-tying', null, picture)).toEqual({ kind: 'signed-out' })
    stubFetch(opaqueRedirect())
    expect(await uploadPicture('knot-tying', null, picture)).toEqual({ kind: 'signed-out' })
    stubFetch(Response.json({ error: 'server' }, { status: 500 }))
    expect(await uploadPicture('knot-tying', null, picture)).toEqual({ kind: 'error' })
    stubFetch(new TypeError('Failed to fetch'))
    expect(await uploadPicture('knot-tying', null, picture)).toEqual({ kind: 'error' })
  })

  it('maps an answer that is not the Worker\'s shape to error', async () => {
    // Catches a proxy page or a half-formed body (200 with no row, 409 with no list) taken for a saved picture or a conflict.
    stubFetch(new Response('<html>sign in</html>', { status: 200 }))
    expect(await uploadPicture('knot-tying', null, picture)).toEqual({ kind: 'error' })
    stubFetch(Response.json({}, { status: 200 }))
    expect(await uploadPicture('knot-tying', null, picture)).toEqual({ kind: 'error' })
    stubFetch(Response.json({ error: 'conflict', honors: [withPicture] }, { status: 409 }))
    expect(await uploadPicture('knot-tying', null, picture)).toEqual({ kind: 'error' })
    stubFetch(Response.json({ error: 'conflict', honors: [{ ...knot, image: 7 }], deletedIds: [] }, { status: 409 }))
    expect(await uploadPicture('knot-tying', null, picture)).toEqual({ kind: 'error' })
    stubFetch(Response.json({ honor: withPicture }, { status: 400 }))
    expect(await uploadPicture('knot-tying', null, picture)).toEqual({ kind: 'error' })
  })
})

describe('club calls', () => {
  const firstPath = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls[0]![0] // the path of the first request
  const list = [makeClub({ id: 1, name: 'Alpha Club' }), makeClub({ id: 2, name: 'Beta Club', area: 'Klang' })] // a valid list
  const fields = { name: 'Lions', area: null, language: null, location: null, churchName: null } // new club fields

  it('loadClubs reads the list from GET /api/clubs', async () => {
    // Catches a list read from the wrong route or a wrong-shape list that reaches the screen.
    const spy = stubFetch(Response.json({ clubs: list }))
    expect(await loadClubs()).toEqual({ kind: 'ok', clubs: list })
    expect(firstPath(spy)).toBe('/api/clubs')
    stubFetch(Response.json({ clubs: [{ id: '1', name: 'x' }] }))
    expect(await loadClubs()).toEqual({ kind: 'error' })
  })

  it('addClub posts the fields and maps 201, name-taken, 403, network and a bad shape', async () => {
    // Catches a taken name read as a failure, or a session end read as an error.
    const spy = stubFetch(Response.json({ clubs: list }, { status: 201 }))
    expect(await addClub(fields)).toEqual({ kind: 'ok', clubs: list })
    const [path, init] = spy.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/clubs')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(fields)
    stubFetch(Response.json({ error: 'name-taken' }, { status: 409 }))
    expect(await addClub(fields)).toEqual({ kind: 'name-taken' })
    stubFetch(Response.json({}, { status: 403 }))
    expect(await addClub(fields)).toEqual({ kind: 'signed-out' })
    stubFetch(opaqueRedirect())
    expect(await addClub(fields)).toEqual({ kind: 'signed-out' })
    stubFetch(new Error('offline'))
    expect(await addClub(fields)).toEqual({ kind: 'error' })
    stubFetch(Response.json({ clubs: 'no' }, { status: 201 }))
    expect(await addClub(fields)).toEqual({ kind: 'error' })
    stubFetch(Response.json({ error: 'invalid' }, { status: 400 }))
    expect(await addClub(fields)).toEqual({ kind: 'error' })
  })

  it('editClub, removeClub and moveClubs post to their routes and read a 409 with a list as a conflict', async () => {
    // Catches a conflict that is treated as a failure, so the admin never sees the latest list.
    const conflict = Response.json({ error: 'conflict', clubs: list }, { status: 409 })
    const spy = stubFetch(conflict)
    expect(await editClub({ id: 1, from: fields, to: { ...fields, name: 'Lions 2' } })).toEqual({ kind: 'conflict', clubs: list })
    expect(firstPath(spy)).toBe('/api/clubs/edit')
    stubFetch(Response.json({ clubs: list }))
    const remove = stubFetch(Response.json({ clubs: list }))
    expect(await removeClub({ id: 1, seen: fields })).toEqual({ kind: 'ok', clubs: list })
    expect(firstPath(remove)).toBe('/api/clubs/remove')
    const move = stubFetch(Response.json({ clubs: list }))
    expect(await moveClubs({ from: [1, 2], to: [2, 1] })).toEqual({ kind: 'ok', clubs: list })
    expect(firstPath(move)).toBe('/api/clubs/order')
    stubFetch(Response.json({ error: 'conflict' }, { status: 409 }))
    expect(await moveClubs({ from: [1, 2], to: [2, 1] })).toEqual({ kind: 'error' })
  })
})
