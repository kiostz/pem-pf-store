// Tests for the admin API module with fetch stubbed at the boundary: the request shape and how each answer maps to a result kind.

import { afterEach, describe, expect, it, vi } from 'vitest' // test API
import { loadAdminHonors, sendHonorChanges } from './admin-api.ts' // the code under test

const knot = {
  id: 'knot-tying',
  name: 'Knot Tying',
  category: 'Outdoor',
  status: 'active',
  stock: 12,
} // a valid row

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

describe('loadAdminHonors', () => {
  it('reads the rows with a same-origin GET that does not follow redirects', async () => {
    // Catches a load that follows an Access redirect into a login page it cannot read.
    const spy = stubFetch(Response.json([knot]))
    expect(await loadAdminHonors()).toEqual({ kind: 'ok', honors: [knot] })
    expect(spy).toHaveBeenCalledWith(
      '/api/items',
      expect.objectContaining({ redirect: 'manual' }),
    )
  })

  it('maps an opaque redirect and a 403 to signed-out, a 500 and a network error to error', async () => {
    // Catches an expired Access session shown as a plain failure, or a failure shown as signed out.
    stubFetch(opaqueRedirect())
    expect(await loadAdminHonors()).toEqual({ kind: 'signed-out' })
    stubFetch(Response.json({ error: 'forbidden' }, { status: 403 }))
    expect(await loadAdminHonors()).toEqual({ kind: 'signed-out' })
    stubFetch(Response.json({ error: 'server' }, { status: 500 }))
    expect(await loadAdminHonors()).toEqual({ kind: 'error' })
    stubFetch(new TypeError('network'))
    expect(await loadAdminHonors()).toEqual({ kind: 'error' })
  })

  it('treats a stock sent as text, or a missing field, as an error', async () => {
    // Catches a page that draws NaN or blanks from a malformed answer.
    stubFetch(Response.json([{ ...knot, stock: '3' }]))
    expect(await loadAdminHonors()).toEqual({ kind: 'error' })
    const noName = {
      id: knot.id,
      category: knot.category,
      status: knot.status,
      stock: knot.stock,
    } // the row without its name
    stubFetch(Response.json([noName]))
    expect(await loadAdminHonors()).toEqual({ kind: 'error' })
    stubFetch(Response.json([{ ...knot, status: 'gone' }]))
    expect(await loadAdminHonors()).toEqual({ kind: 'error' })
  })
})

describe('sendHonorChanges', () => {
  const changes = [{ id: 'knot-tying', stock: { from: 12, to: 5 } }] // one change

  it('posts the changes as same-origin JSON without following redirects', async () => {
    // Catches a save sent as a form or text/plain, which the Worker refuses with 415.
    const spy = stubFetch(Response.json({ honors: [{ ...knot, stock: 5 }] }))
    expect(await sendHonorChanges(changes)).toEqual({
      kind: 'saved',
      honors: [{ ...knot, stock: 5 }],
    })
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/items/changes')
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('manual')
    expect(new Headers(init.headers).get('Content-Type')).toBe(
      'application/json',
    )
    expect(JSON.parse(init.body as string)).toEqual({ changes })
  })

  it('maps 409 to a conflict with the current rows, and 403, an opaque redirect, a 500 and a network error to their kinds', async () => {
    // Catches a refused save that looks saved, or a conflict that loses the current rows.
    stubFetch(
      Response.json({ error: 'conflict', honors: [knot] }, { status: 409 }),
    )
    expect(await sendHonorChanges(changes)).toEqual({
      kind: 'conflict',
      honors: [knot],
    })
    stubFetch(Response.json({ error: 'forbidden' }, { status: 403 }))
    expect(await sendHonorChanges(changes)).toEqual({ kind: 'signed-out' })
    stubFetch(opaqueRedirect())
    expect(await sendHonorChanges(changes)).toEqual({ kind: 'signed-out' })
    stubFetch(Response.json({ error: 'server' }, { status: 500 }))
    expect(await sendHonorChanges(changes)).toEqual({ kind: 'error' })
    stubFetch(new TypeError('network'))
    expect(await sendHonorChanges(changes)).toEqual({ kind: 'error' })
  })

  it('treats a saved answer with a stock as text as an error', async () => {
    // Catches a "saved" screen built on rows it cannot trust.
    stubFetch(Response.json({ honors: [{ ...knot, stock: '5' }] }))
    expect(await sendHonorChanges(changes)).toEqual({ kind: 'error' })
  })
})
