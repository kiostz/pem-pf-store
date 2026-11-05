// Tests the item id rule: the shop's slug, kept inside the 100-character id limit.

import { describe, expect, it } from 'vitest'
import { honorId } from '../src/honor-id'

describe('honorId', () => {
  it('makes the same slug as the shop for names with accents, apostrophes and symbols', () => {
    // Catches an id rule that differs from the ids the existing items carry, so Club-added and built-in ids would follow two rules.
    expect(honorId('Papier-Mâché & Co.')).toBe('papier-mache-co')
    expect(honorId("Scout's Honor")).toBe('scouts-honor')
  })

  it('falls back to a word when the name has no letters or digits', () => {
    // Catches an empty id, which no route could address.
    expect(honorId('!!!')).toBe('item')
  })

  it('stays within 90 characters, with no trailing dash', () => {
    // Catches an id over the 100-character limit the save route accepts, after NFKD expands "ﬃ" to three letters.
    const id = honorId(`${'ﬃ'.repeat(60)} end`)
    expect(id.length).toBeLessThanOrEqual(90)
    expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })
})
