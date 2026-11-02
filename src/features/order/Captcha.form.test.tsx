// Test for the Captcha inside a token-holding parent, as the order form uses it: a theme change must bring back the line under Send order that asks for the tick.

import { act, render, renderHook, screen } from '@testing-library/react' // render and query
import { useState } from 'react' // the form's token
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import { useTheme } from '@/shared/theme/use-theme.ts' // the hook the Theme control uses
import { Captcha } from './Captcha.tsx' // code under test
import { missingText } from './order-form.ts' // the form's line under Send order

const widget = vi.hoisted(() => ({ verify: null as ((token: string) => void) | null })) // the stand-in widget's verify callback, shared with the mock

// The package's widget replaced by one that only keeps the verify callback, so a test can tick it.
vi.mock('@marsidev/react-turnstile', () => ({
  /**
   * The stand-in widget: keeps the verify callback so a test can tick it.
   * @param props the wrapper's callbacks
   * @return nothing to draw
   */
  Turnstile: ({ onSuccess }: { onSuccess: (token: string) => void }) => {
    widget.verify = onSuccess // remember it for the test
    return null // nothing to draw
  },
}))

beforeEach(() => {
  // jsdom has no matchMedia; a light, silent one is enough here.
  window.matchMedia = ((query: string) => ({
    matches: false, // the system is light
    media: query, // the asked query
    addEventListener: () => {}, // no system switch in this test
    removeEventListener: () => {}, // nothing to stop
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  document.documentElement.removeAttribute('data-theme') // the next test starts on System
  window.localStorage.clear() // no saved pick left
})

/**
 * Stands in for the form: holds the token and shows the line under Send order that asks for the tick.
 * @return the captcha and that line
 */
function TokenHolder() {
  const [token, setToken] = useState<string | null>(null) // the form's token
  return (
    <>
      {/* The captcha reporting into the held token. */}
      <Captcha onToken={setToken} />
      {/* The line under Send order that asks for the tick. */}
      <p>{missingText({}, token !== null)}</p>
    </>
  )
}

describe('Captcha with a token-holding form', () => {
  it('makes Send order ask for the captcha again after a theme change', () => {
    // catches: a form that stays ready with a token the redrawn widget no longer holds
    render(<TokenHolder />)
    act(() => widget.verify?.('abc123')) // ticked
    expect(screen.queryByText('Complete the captcha to send.')).not.toBeInTheDocument()
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setChoice('dark'))
    expect(screen.getByText('Complete the captcha to send.')).toBeInTheDocument()
  })
})
