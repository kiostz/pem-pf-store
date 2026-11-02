// Tests for the production-build guard: a build with no real Turnstile sitekey must fail, so Pages keeps the old site live.

import { describe, expect, it } from 'vitest' // test runner
import { requireSitekey } from './require-sitekey.ts' // the guard under test

describe('requireSitekey', () => {
  // Catches a production site shipped with the placeholder, whose captcha can never load.
  it('throws in production when the sitekey is still the placeholder', () => {
    expect(() =>
      requireSitekey('build', 'production', {
        VITE_TURNSTILE_SITEKEY: 'REPLACE_WITH_TURNSTILE_SITEKEY',
      }),
    ).toThrow('VITE_TURNSTILE_SITEKEY')
  })

  // Catches a production site shipped with no sitekey at all.
  it('throws in production when the sitekey is missing or empty', () => {
    expect(() => requireSitekey('build', 'production', {})).toThrow(
      'VITE_TURNSTILE_SITEKEY',
    )
    expect(() =>
      requireSitekey('build', 'production', { VITE_TURNSTILE_SITEKEY: '' }),
    ).toThrow('VITE_TURNSTILE_SITEKEY')
  })

  // Catches the guard blocking a real build.
  it('passes in production with a real sitekey', () => {
    expect(() =>
      requireSitekey('build', 'production', {
        VITE_TURNSTILE_SITEKEY: '0x4AAAAAAAexample',
      }),
    ).not.toThrow()
  })

  // Catches the guard breaking `npm run dev` and the test runs, which use the test sitekey or none.
  it('does nothing in development and test modes', () => {
    expect(() =>
      requireSitekey('build', 'development', {
        VITE_TURNSTILE_SITEKEY: '1x00000000000000000000AA',
      }),
    ).not.toThrow()
    expect(() => requireSitekey('build', 'test', {})).not.toThrow()
  })

  // Catches `npm run preview` (command `serve`, mode production) failing on the placeholder, which stops a local look at the built site.
  it('does nothing when serving, even in production mode with the placeholder', () => {
    expect(() =>
      requireSitekey('serve', 'production', {
        VITE_TURNSTILE_SITEKEY: 'REPLACE_WITH_TURNSTILE_SITEKEY',
      }),
    ).not.toThrow()
  })
})
