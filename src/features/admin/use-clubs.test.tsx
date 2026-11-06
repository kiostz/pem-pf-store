// Tests for the clubs hook: the loader delay, the failure states, one write at a time, and the list each answer brings.

import { act, renderHook, waitFor } from '@testing-library/react' // hook rendering
import { afterEach, describe, expect, it, vi } from 'vitest' // test API
import { clubs } from '@/test/club-fixtures.ts' // shared clubs
import { useClubs } from './use-clubs.ts' // the code under test

const fields = { name: 'Lions', area: null, language: null, location: null, churchName: null } // a new club's fields

afterEach(() => {
  vi.unstubAllGlobals() // no stub leaks on
  vi.useRealTimers() // no fake clock leaks on
})

describe('useClubs', () => {
  it('shows the skeleton only after 300 ms and then the list', async () => {
    // Catches a skeleton that flashes on a quick load.
    vi.useFakeTimers()
    let answer: (response: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))))
    const { result } = renderHook(() => useClubs())
    await act(() => vi.advanceTimersByTimeAsync(299))
    expect(result.current.showSkeleton).toBe(false)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(result.current.showSkeleton).toBe(true)
    await act(async () => answer(Response.json({ clubs })))
    expect(result.current.load).toBe('ready')
    expect(result.current.showSkeleton).toBe(false)
    expect(result.current.clubs).toHaveLength(10)
  })

  it('reports error and signed-out, and Try again reads again', async () => {
    // Catches a failed read that cannot be retried.
    const spy = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 500 })).mockResolvedValue(Response.json({ clubs }))
    vi.stubGlobal('fetch', spy)
    const { result } = renderHook(() => useClubs())
    await waitFor(() => expect(result.current.load).toBe('error'))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.load).toBe('ready'))
    expect(spy).toHaveBeenCalledTimes(2)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, { status: 403 })))
    const second = renderHook(() => useClubs())
    await waitFor(() => expect(second.result.current.load).toBe('signed-out'))
  })

  it('sends one write for two quick calls and replaces the list with the answer', async () => {
    // Catches a double click that sends two moves.
    const spy = vi.fn((_url: unknown, init?: RequestInit) =>
      Promise.resolve(init?.method === 'POST' ? Response.json({ clubs: [...clubs].reverse() }) : Response.json({ clubs })),
    )
    vi.stubGlobal('fetch', spy)
    const { result } = renderHook(() => useClubs())
    await waitFor(() => expect(result.current.load).toBe('ready'))
    let first: unknown
    let second: unknown
    await act(async () => {
      const order = { from: clubs.map((club) => club.id), to: [...clubs].reverse().map((club) => club.id) }
      const one = result.current.move(1, order)
      const two = result.current.move(1, order)
      first = await one
      second = await two
    })
    expect(second).toEqual({ kind: 'busy' })
    expect(first).toMatchObject({ kind: 'ok' })
    expect(spy.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    expect(result.current.clubs[0]!.id).toBe(10)
    expect(result.current.busyId).toBeNull()
  })

  it('reads the list again when an Add finds its name taken', async () => {
    // Catches an Add retry that leaves the club it created invisible.
    const added = [...clubs, { ...clubs[0]!, id: 11, name: 'Lions' }]
    const spy = vi.fn((_url: unknown, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'POST'
          ? Response.json({ error: 'name-taken' }, { status: 409 })
          : spy.mock.calls.length === 1
            ? Response.json({ clubs })
            : Response.json({ clubs: added }),
      ),
    )
    vi.stubGlobal('fetch', spy)
    const { result } = renderHook(() => useClubs())
    await waitFor(() => expect(result.current.load).toBe('ready'))
    await act(async () => {
      expect(await result.current.add(fields)).toEqual({ kind: 'name-taken' })
    })
    expect(result.current.clubs).toHaveLength(11)
  })

  it('replaces the list with the one a conflict carries', async () => {
    // Catches a conflict that leaves the stale list on screen.
    const latest = clubs.slice(0, 3)
    vi.stubGlobal('fetch', vi.fn((_url: unknown, init?: RequestInit) =>
      Promise.resolve(init?.method === 'POST' ? Response.json({ error: 'conflict', clubs: latest }, { status: 409 }) : Response.json({ clubs })),
    ))
    const { result } = renderHook(() => useClubs())
    await waitFor(() => expect(result.current.load).toBe('ready'))
    await act(async () => {
      expect(await result.current.move(1, { from: clubs.map((club) => club.id), to: [...clubs].reverse().map((club) => club.id) })).toMatchObject({ kind: 'conflict' })
    })
    expect(result.current.clubs).toHaveLength(3)
  })
})
