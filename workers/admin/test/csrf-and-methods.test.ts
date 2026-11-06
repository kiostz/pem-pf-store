// Tests the save route's same-origin (CSRF) rules, method handling and gate ordering beyond the basic cases, so a loose Origin compare or a late gate cannot let a foreign page or a stranger save.

import { describe, expect, it } from 'vitest'
import { call, fullRowOf, postChanges, postTo, rowOf, seedItems } from './helpers'

// A valid save the admin page could send.
const body = { changes: [{ id: 'knot-tying', stock: { from: 12, to: 20 } }] }

/**
 * Seeds one item.
 * @return Nothing.
 */
const seed = () => seedItems([{ id: 'knot-tying', name: 'Knot Tying', status: 'active', stock: 12 }])

describe('same-origin check on the save', () => {
  it('refuses every Origin that is not exactly the Worker\'s own, writing nothing', async () => {
    // Catches a loose compare (startsWith, includes, host only) that lets a look-alike or another scheme or port save.
    await seed()
    for (const origin of ['http://admin.test', 'https://admin.test:8443', 'https://admin.test.evil.example', 'https://evil.admin.test', 'https://admin.test/', 'null', '']) {
      const res = await postChanges(body, { headers: { Origin: origin, 'Content-Type': 'application/json' } })
      expect(res.status, origin).toBe(403)
      expect(await res.json()).toEqual({ error: 'forbidden' })
    }
    expect((await rowOf('knot-tying')).stock).toBe(12) // Never written.
  })

  it('checks Origin before the content type, so a foreign text/plain form is a 403', async () => {
    // Catches the content-type check running first and telling a cross-site page which rule it tripped.
    await seed()
    const res = await postChanges(body, { headers: { Origin: 'https://evil.example', 'Content-Type': 'text/plain' } })
    expect(res.status).toBe(403)
  })

  it('accepts a JSON content type with a charset and capitals', async () => {
    // Catches an exact string compare that rejects the browser's own `application/json; charset=utf-8` and locks the admin out.
    await seed()
    const res = await postChanges(body, { headers: { Origin: 'https://admin.test', 'Content-Type': 'Application/JSON; charset=utf-8' } })
    expect(res.status).toBe(200)
    expect((await rowOf('knot-tying')).stock).toBe(20)
  })
})

describe('gate ahead of the save', () => {
  it('writes nothing for a valid save without Access, with a wrong aud or with another email', async () => {
    // Catches a gate that runs after the save, so the answer is 403 but the row has already changed.
    await seed()
    for (const options of [{ access: 'none' as const }, { access: { aud: 'other-app' } }, { access: { email: 'stranger@example.test' } }]) {
      expect((await postChanges(body, {}, options)).status).toBe(403)
    }
    expect((await rowOf('knot-tying')).stock).toBe(12)
  })

  it('answers 403 to any method on the save route without Access, and 405 with Allow when signed in', async () => {
    // Catches a method check before the gate (a 405 that tells a stranger the route exists), or a PUT or DELETE reaching the save.
    await seed()
    for (const method of ['PUT', 'DELETE', 'PATCH', 'OPTIONS', 'GET']) {
      expect((await call('/api/items/changes', { method }, { access: 'none' })).status, method).toBe(403)
      const signedIn = await call('/api/items/changes', { method })
      expect(signedIn.status, method).toBe(405)
      expect(signedIn.headers.get('Allow')).toBe('POST')
    }
    expect((await rowOf('knot-tying')).stock).toBe(12)
  })
})

describe('guarded save, one row with two fields', () => {
  it('writes neither field of a row whose stock is stale even when its status is current', async () => {
    // Catches a per-field save that applies the fresh status and drops only the stale stock, a half-written row.
    await seed()
    const res = await postChanges({
      changes: [{ id: 'knot-tying', stock: { from: 99, to: 5 }, status: { from: 'active', to: 'hidden' } }],
    })
    expect(res.status).toBe(409)
    expect(await rowOf('knot-tying')).toEqual({ stock: 12, status: 'active' })
  })
})

describe('the other write routes', () => {
  // Each write route with a body that would succeed.
  const writes: [string, unknown][] = [
    ['/api/items', { name: 'Camp Shirt', category: 'Shirts', priceCents: 400 }], // An Add with a current category name.
    ['/api/orders/step', { number: 'PF-20261105-ABCD', from: 'new', to: 'paid', restock: false }],
    ['/api/settings', { orderEmailOn: { from: true, to: false } }],
    ['/api/settings/prices', { currency: { from: 'MYR', to: 'SGD' } }],
    ['/api/clubs', { name: 'Lions', area: null, language: null, location: null, churchName: null }],
    ['/api/clubs/edit', { id: 1, from: { name: 'A', area: null, language: null, location: null, churchName: null }, to: { name: 'B', area: null, language: null, location: null, churchName: null } }],
    ['/api/clubs/remove', { id: 1, seen: { name: 'A', area: null, language: null, location: null, churchName: null } }],
    ['/api/clubs/order', { from: [1, 2], to: [2, 1] }],
    ['/api/items/delete', { id: 'club-shirt', seen: { name: 'Club Shirt', category: 'Shirts', priceCents: 400, status: 'hidden', stock: 0, modifiedAt: '2026-11-01T00:00:00.000Z' } }], // Matches the seeded Club-added row below.
  ]

  it('refuses a foreign Origin and a non-JSON type, before any write', async () => {
    // Catches a new write route that skipped the CSRF checks the save has.
    await seedItems([{ id: 'knot-tying', name: 'Knot Tying', status: 'active', stock: 12 }, { id: 'club-shirt', name: 'Club Shirt', category: 'Shirts', issuedBy: 'Club', status: 'hidden', stock: 0, priceCents: 400, modifiedAt: '2026-11-01T00:00:00.000Z', createdAt: '2026-11-01T00:00:00.000Z' }]) // A Club-added row the delete body matches.
    for (const [path, payload] of writes) {
      expect((await postTo(path, payload, { headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' } })).status, path).toBe(403)
      expect((await postTo(path, payload, { headers: { Origin: 'https://admin.test', 'Content-Type': 'text/plain' } })).status, path).toBe(415)
      expect((await postTo(path, payload, { headers: { 'Content-Type': 'application/json' } })).status, path).toBe(403) // No Origin.
    }
    expect(await fullRowOf('camp-shirt')).toBeNull()
    expect(await fullRowOf('knot-tying')).not.toBeNull()
    expect(await fullRowOf('club-shirt')).not.toBeNull() // The delete never ran.
  })

  it('refuses a body over 64 KB with 413 on the four club write routes', async () => {
    // Catches a club route that reads an unbounded body.
    for (const path of ['/api/clubs', '/api/clubs/edit', '/api/clubs/remove', '/api/clubs/order']) {
      const res = await postTo(path, { pad: 'x'.repeat(70 * 1024) })
      expect(res.status, path).toBe(413)
      expect(await res.json()).toEqual({ error: 'too-large' })
    }
  })

  it('answers 405 with Allow for the wrong method on every route', async () => {
    // Catches a route that answers 404 or runs for the wrong method.
    await seed()
    const cases: [string, string, string][] = [
      ['/api/items', 'PUT', 'GET, POST'],
      ['/api/items', 'DELETE', 'GET, POST'],
      ['/api/items/delete', 'GET', 'POST'],
      ['/api/items/picture', 'GET', 'POST'],
      ['/api/meta', 'POST', 'GET'],
      ['/api/orders', 'POST', 'GET'],
      ['/api/orders', 'DELETE', 'GET'],
      ['/api/orders/step', 'GET', 'POST'],
      ['/api/orders/step', 'PUT', 'POST'],
      ['/api/settings', 'PUT', 'GET, POST'],
      ['/api/settings', 'DELETE', 'GET, POST'],
      ['/api/settings/prices', 'GET', 'POST'],
      ['/api/clubs', 'PUT', 'GET, POST'],
      ['/api/clubs/edit', 'GET', 'POST'],
      ['/api/clubs/remove', 'GET', 'POST'],
      ['/api/clubs/order', 'DELETE', 'POST'],
    ]
    for (const [path, method, allow] of cases) {
      const res = await call(path, { method })
      expect(res.status, `${method} ${path}`).toBe(405)
      expect(res.headers.get('Allow')).toBe(allow)
    }
  })
})
