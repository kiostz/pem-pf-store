// Tests the not-allowed page: a gate refusal on a page request answers 403 HTML, never the email, never a script.

import { describe, expect, it } from 'vitest'
import { call, postChanges } from './helpers'

const SECRET_EMAIL = 'stranger@example.test' // The signed-in address the page must never show.

// Each way the gate refuses, as a label and call options.
const refusals: [string, Parameters<typeof call>[2]][] = [
  ['no Access context', { access: 'none' }],
  ['a wrong aud', { access: { aud: 'other-app', email: SECRET_EMAIL } }],
  ['a placeholder ACCESS_AUD', { access: { aud: 'set-after-access' }, env: { ACCESS_AUD: 'set-after-access' } }],
  ['an empty ACCESS_AUD', { access: { aud: '' }, env: { ACCESS_AUD: '' } }],
  ['no identity', { access: { email: null } }],
  ['a thrown identity lookup', { access: { throws: true } }],
  ['an email not on the list', { access: { email: SECRET_EMAIL } }],
  ['an empty ADMIN_EMAILS', { access: { email: SECRET_EMAIL }, env: { ADMIN_EMAILS: '' } }],
]

// Page paths the gate guards.
const pagePaths = ['/', '/some/other-page', '/admin.js']

describe('not-allowed page', () => {
  for (const [label, options] of refusals) {
    for (const path of pagePaths) {
      it(`answers 403 HTML on GET ${path} for ${label}`, async () => {
        // Catches a refused page request that still gets the JSON the admin page reads.
        const res = await call(path, {}, options)
        expect(res.status).toBe(403)
        expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
        const html = await res.text()
        expect(html).toContain("This account can't open the admin")
        expect(html).toContain('<title>Not allowed · PEM Pathfinder Store</title>')
        expect(html).not.toContain(SECRET_EMAIL) // No identity in the page.
      })
    }
  }

  it('shows the same body whichever check failed', async () => {
    // Catches a page that says which check refused, helping a probe.
    const bodies = await Promise.all(refusals.map(async ([, options]) => (await call('/', {}, options)).text()))
    expect(new Set(bodies).size).toBe(1)
  })

  it('holds the sign-out and shop links, and no script', async () => {
    // Catches a dead end for the wrong account, or a script that the CSP would not allow anyway.
    const html = await (await call('/', {}, { access: { email: SECRET_EMAIL } })).text()
    expect(html).toContain('href="/cdn-cgi/access/logout"')
    expect(html).toContain('Sign in with another account')
    expect(html).toContain('href="https://kiostz.github.io/pem-pf-store/"')
    expect(html).toContain('Browse more')
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/http-equiv="refresh"/i) // No redirect loop.
    expect(html).not.toMatch(/honor/i) // Screen text never names honors.
    expect(html).toContain('prefers-color-scheme: dark') // Dark theme.
  })

  it('keeps the security headers, no-store and a CSP the inline style fits', async () => {
    // Catches a refusal page that loses nosniff, no-store, or breaks under its own CSP.
    const res = await call('/', {}, { access: 'none' })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    const csp = res.headers.get('content-security-policy') ?? ''
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("form-action 'none'")
    expect(csp).not.toContain("'unsafe-inline'")
    const html = await res.text()
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? ''
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(style))
    const hash = btoa(String.fromCharCode(...new Uint8Array(digest)))
    expect(csp).toContain(`style-src 'sha256-${hash}'`) // The hash matches the inline style byte for byte.
  })

  it('answers HEAD with the headers and no body', async () => {
    // Catches a HEAD answer that carries a body.
    const res = await call('/', { method: 'HEAD' }, { access: 'none' })
    expect(res.status).toBe(403)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(await res.text()).toBe('')
  })

  it('keeps the JSON 403 on /api/ paths and other methods', async () => {
    // Catches the page leaking into the API the admin page reads, or onto a POST.
    for (const res of [
      await call('/api/items', {}, { access: 'none' }),
      await call('/api/items', { method: 'HEAD' }, { access: 'none' }),
      await postChanges({ changes: [] }, {}, { access: 'none' }),
      await call('/', { method: 'POST' }, { access: 'none' }),
      await call('/', { method: 'DELETE' }, { access: 'none' }),
    ]) {
      expect(res.status).toBe(403)
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8')
    }
    expect(await (await call('/api/items', {}, { access: 'none' })).json()).toEqual({ error: 'forbidden' })
  })

  it('does not log the email or identity', async () => {
    // Catches a refusal that logs who was refused.
    const logged: unknown[][] = []
    const original = console.error
    console.error = (...args: unknown[]) => void logged.push(args)
    try {
      await call('/', {}, { access: { email: SECRET_EMAIL } })
      await call('/', {}, { access: { email: null } })
    } finally {
      console.error = original
    }
    expect(JSON.stringify(logged)).not.toContain(SECRET_EMAIL)
  })
})
