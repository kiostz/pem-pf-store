// Tests the page routes: the page and its two files, their headers, and the route and method errors.

import { describe, expect, it } from 'vitest'
import { call, pages } from './helpers'

describe('page routes', () => {
  it('serves the page with the security headers', async () => {
    // Catches a page without the CSP, nosniff, referrer or no-store headers.
    const res = await call('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(pages.html) // The page text.
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('Content-Security-Policy')).toBe(
      "default-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    )
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('serves the script and styles with their own types and no-store', async () => {
    // Catches a script served as text/plain, which the browser refuses under nosniff.
    const js = await call('/admin.js')
    expect(js.headers.get('Content-Type')).toBe('text/javascript; charset=utf-8')
    expect(await js.text()).toBe(pages.js)
    expect(js.headers.get('Cache-Control')).toBe('no-store')
    expect(js.headers.get('X-Content-Type-Options')).toBe('nosniff')
    const css = await call('/admin.css')
    expect(css.headers.get('Content-Type')).toBe('text/css; charset=utf-8')
    expect(await css.text()).toBe(pages.css)
    expect(css.headers.get('Cache-Control')).toBe('no-store')
  })

  it('answers 405 with Allow for a POST to the page and a GET to the changes route', async () => {
    // Catches a page that accepts writes, or a route that ignores the method.
    const post = await call('/', { method: 'POST', headers: { Origin: 'https://admin.test' } })
    expect(post.status).toBe(405)
    expect(post.headers.get('Allow')).toBe('GET')
    expect(await post.json()).toEqual({ error: 'method-not-allowed' })
    const get = await call('/api/items/changes')
    expect(get.status).toBe(405)
    expect(get.headers.get('Allow')).toBe('POST')
  })

  it('answers 404 not-found for an unknown path when signed in', async () => {
    // Catches an unknown path falling through to the page.
    const res = await call('/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not-found' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
