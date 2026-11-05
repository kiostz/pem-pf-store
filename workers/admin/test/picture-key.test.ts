// Tests that the shop and the Admin Worker accept exactly the same picture keys, so a key one stores is one the other shows.

import { describe, expect, it } from 'vitest'
import loadSource from '../../../src/shared/data/load.ts?raw'
import { PICTURE_KEY } from '../src/pictures'

describe('picture key pattern', () => {
  it('is written the same in the shop and the Admin Worker', () => {
    // catches: one side's pattern edited without the other, so uploads the shop then hides
    const match = /const PICTURE_KEY = (\/.+\/)\r?\n/.exec(loadSource) // The shop's literal.
    expect(match).not.toBeNull()
    expect((match as RegExpExecArray)[1]).toBe(String(PICTURE_KEY)) // Same text, slashes included.
  })
})
