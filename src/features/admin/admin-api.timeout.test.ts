// Tests that every club write and the prices save give up after 15 s with the failure kind, and that an answer in time is not cut off, so no sheet or form waits for ever.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API
import { addClub, editClub, moveClubs, removeClub, savePrices } from './admin-api.ts' // the code under test

const NAME = { name: 'Lions', area: null, language: null, location: null, churchName: null } // club fields

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers() // real time back
  vi.unstubAllGlobals() // restore fetch
})

/** Stubs a fetch that stays open until its request is aborted, or answers when told. */
function stubHeld() {
  let answer: (response: Response) => void = () => undefined // answers the held request
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      answer = resolve // kept for the in-time test
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))) // the limit fires
    })),
  )
  return { answer: (response: Response) => answer(response) }
}

const writes: [string, () => Promise<{ kind: string }>][] = [
  ['addClub', () => addClub(NAME)],
  ['editClub', () => editClub({ id: 1, from: NAME, to: { ...NAME, name: 'Leos' } })],
  ['removeClub', () => removeClub({ id: 1, seen: NAME })],
  ['moveClubs', () => moveClubs({ from: [1, 2], to: [2, 1] })],
  ['savePrices', () => savePrices({ currency: { from: 'MYR', to: 'SGD' } })],
]

describe('write time limit', () => {
  it.each(writes)('%s answers error at 15 s and not before', async (_name, send) => {
    // Catches a write with no limit (a modal that stays busy), or a limit that fires early or on the wrong call.
    stubHeld()
    let result: { kind: string } | null = null // set when the call settles
    void send().then((value) => (result = value))
    await vi.advanceTimersByTimeAsync(14_999)
    expect(result).toBeNull() // still waiting
    await vi.advanceTimersByTimeAsync(1)
    expect(result).toEqual({ kind: 'error' }) // gave up
  })

  it.each(writes)('%s keeps an answer that arrives at 14.9 s and does not abort it later', async (_name, send) => {
    // Catches a timer left running after an answer, or one that cuts a slow but real answer.
    const held = stubHeld()
    const settled = send() // the call
    await vi.advanceTimersByTimeAsync(14_900)
    held.answer(Response.json({}, { status: 500 })) // a slow answer
    expect(await settled).toEqual({ kind: 'error' }) // a 500 is an error for the reason it is, not for the clock
    expect(vi.getTimerCount()).toBe(0) // the limit's timer is gone
  })
})
