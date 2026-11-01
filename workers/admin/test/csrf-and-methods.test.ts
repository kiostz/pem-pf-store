// Tests the save route's same-origin (CSRF) rules, method handling and gate ordering beyond the basic cases, so a loose Origin compare or a late gate cannot let a foreign page or a stranger save.

import { describe, expect, it } from 'vitest'
import { call, postChanges, rowOf, seedHonors } from './helpers'

// A valid save the admin page could send.
const body = { changes: [{ id: 'knot-tying', stock: { from: 12, to: 20 } }] }

/**
 * Seeds one honor.
 * @return Nothing.
 */
const seed = () => seedHonors([{ id: 'knot-tying', name: 'Knot Tying', status: 'active', stock: 12 }])

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
