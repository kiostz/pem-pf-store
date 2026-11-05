// Tests that the Settings Shop section ends a prices save that never answers: after 15 s it shows the failure line, keeps the typing and unlocks the fields.

import { act, fireEvent, render, screen } from '@testing-library/react' // rendering and events
import { afterEach, describe, expect, it, vi } from 'vitest' // test API
import { meta } from './item-fixtures.ts' // /api/meta's answer
import { SettingsScreen } from './SettingsScreen.tsx' // the code under test

afterEach(() => {
  vi.useRealTimers() // real time back
  vi.unstubAllGlobals() // restore fetch
})

describe('SettingsScreen prices save that never answers', () => {
  it('shows "The settings weren\'t saved." after 15 s, keeps the typing, unlocks the fields and lets Save try again', async () => {
    // Catches fields locked for ever behind a stalled connection, or typing lost on the give-up.
    vi.useFakeTimers()
    let posts = 0 // prices saves sent
    vi.stubGlobal(
      'fetch',
      vi.fn((url: unknown, init?: RequestInit) => {
        if (url === '/api/settings/prices') {
          posts += 1 // one more try
          return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))) // held until the limit
        }
        return Promise.resolve(url === '/api/meta' ? Response.json(meta) : Response.json({ orderEmailOn: true }))
      }),
    )
    render(<SettingsScreen />)
    await act(() => vi.advanceTimersByTimeAsync(0)) // the reads land
    const price = screen.getByRole('textbox', { name: /Default price/ })
    fireEvent.change(price, { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await act(() => vi.advanceTimersByTimeAsync(14_999))
    expect(price).toHaveAttribute('readonly') // still locked while waiting
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(screen.getByText("The settings weren't saved.")).toBeInTheDocument()
    expect(price).toHaveValue('7') // the typing is kept
    expect(price).not.toHaveAttribute('readonly') // unlocked
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(posts).toBe(2) // Save works again
  })
})
