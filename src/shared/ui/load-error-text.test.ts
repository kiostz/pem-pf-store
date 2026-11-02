// Tests for loadErrorText: the words a failed or refused load shows, by reason.

import { describe, expect, it } from 'vitest' // test API
import { loadErrorText } from './load-error-text.ts' // code under test

describe('loadErrorText', () => {
  it('says the shop is busy and to wait a minute for a refused (429) load', () => {
    // catches: a rate-limited buyer told to check their connection, which waiting would fix
    expect(loadErrorText('busy')).toBe('The shop is busy right now. Try again in a minute.')
  })

  it('keeps the connection message for any other failure', () => {
    // catches: the busy words leaking onto a real network failure
    expect(loadErrorText('failed')).toBe("We couldn't load the shop. Check your connection and try again.")
  })
})
