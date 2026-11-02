// Tests for the Captcha wrapper with the Turnstile package mocked at its boundary: what its callbacks hand the form, the reset handle and the theme.

import { act, render, renderHook } from '@testing-library/react' // render and flush updates
import { createRef, useImperativeHandle, type Ref } from 'react' // the stand-in widget and a handle to reset it
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import { useTheme } from '@/shared/theme/use-theme.ts' // the hook the Theme control uses
import { Captcha, type CaptchaHandle } from './Captcha.tsx' // code under test

type WidgetProps = {
  siteKey: string
  options: { theme: string }
  onSuccess: (token: string) => void
  onExpire: () => void
  onError: () => void
  ref?: Ref<{ reset: () => void }>
} // what the stand-in widget receives

const widget = vi.hoisted(() => ({ props: null as WidgetProps | null, reset: vi.fn() })) // the last props and the reset spy, shared with the mock

// The package's widget replaced by one that records its props and exposes reset through its ref.
vi.mock('@marsidev/react-turnstile', () => {
  /**
   * The stand-in widget: records its props and exposes reset through its ref.
   * @param props what the wrapper passes the package's widget
   * @return nothing to draw
   */
  function StandInWidget(props: WidgetProps) {
    widget.props = props // remember what the wrapper passed
    useImperativeHandle(props.ref, () => ({ reset: widget.reset }), []) // the package's own handle
    return null
  }
  return { Turnstile: StandInWidget }
})

let dark = false // what the stand-in system scheme reports
const schemeListeners = new Set<() => void>() // the wrapper's change listeners

beforeEach(() => {
  dark = false // light unless a test says otherwise
  schemeListeners.clear() // no listeners left from an earlier test
  widget.props = null // nothing rendered yet
  widget.reset.mockClear() // no earlier resets
  // jsdom has no matchMedia; this one answers with the current scheme and lets a test switch it.
  window.matchMedia = ((query: string) => ({
    matches: dark, // the current scheme
    media: query, // the asked query
    addEventListener: (_type: string, listener: () => void) => schemeListeners.add(listener), // the scheme switch
    removeEventListener: (_type: string, listener: () => void) => schemeListeners.delete(listener), // stop listening
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  vi.restoreAllMocks() // spies from the test are removed
  vi.unstubAllEnvs() // the sitekey stub goes
  document.documentElement.removeAttribute('data-theme') // the next test starts on System
  window.localStorage.clear() // no saved pick left
})

describe('Captcha', () => {
  it('passes the sitekey from the environment to the widget', () => {
    // catches: a widget drawn with no key or the wrong one, which Cloudflare refuses
    vi.stubEnv('VITE_TURNSTILE_SITEKEY', '1x00000000000000000000AA')
    render(<Captcha onToken={() => {}} />)
    expect(widget.props?.siteKey).toBe('1x00000000000000000000AA')
  })

  it('hands the token to onToken when the widget verifies', () => {
    // catches: onVerify not wired, or the token dropped
    const onToken = vi.fn()
    render(<Captcha onToken={onToken} />)
    act(() => widget.props?.onSuccess('abc123'))
    expect(onToken).toHaveBeenCalledWith('abc123')
  })

  it('hands null to onToken when the token expires', () => {
    // catches: an expired token still counted, so Send order looks ready with a dead token
    const onToken = vi.fn()
    render(<Captcha onToken={onToken} />)
    act(() => widget.props?.onExpire())
    expect(onToken).toHaveBeenCalledExactlyOnceWith(null)
  })

  it('hands null to onToken when the widget fails', () => {
    // catches: onError dropped, so a failed widget leaves the last token in place
    const onToken = vi.fn()
    render(<Captcha onToken={onToken} />)
    act(() => widget.props?.onError())
    expect(onToken).toHaveBeenCalledExactlyOnceWith(null)
  })

  it('reset() clears the widget through the package reset', () => {
    // catches: the handle not reaching the package, so a failed send leaves a used token
    const handle = createRef<CaptchaHandle>()
    render(<Captcha onToken={() => {}} ref={handle} />)
    handle.current?.reset()
    expect(widget.reset).toHaveBeenCalledTimes(1)
  })

  it('uses the light theme when the system is light', () => {
    // catches: a dark widget on a light page
    render(<Captcha onToken={() => {}} />)
    expect(widget.props?.options.theme).toBe('light')
  })

  it('uses the dark theme when the system is dark', () => {
    // catches: a light widget on a dark page
    dark = true
    render(<Captcha onToken={() => {}} />)
    expect(widget.props?.options.theme).toBe('dark')
  })

  it('follows the system when the scheme changes', () => {
    // catches: the theme read once, so a switch while the cart is open leaves the wrong widget
    render(<Captcha onToken={() => {}} />)
    dark = true // the system switches to dark
    act(() => schemeListeners.forEach((listener) => listener()))
    expect(widget.props?.options.theme).toBe('dark')
  })

  it('follows a picked Dark while the system is light', () => {
    // catches: a widget that reads only the system scheme, so a Dark pick leaves a light widget on a dark page
    document.documentElement.dataset.theme = 'dark' // the pick, as the theme control sets it
    render(<Captcha onToken={() => {}} />)
    expect(widget.props?.options.theme).toBe('dark')
  })

  it('follows a picked Light while the system is dark', () => {
    // catches: the system scheme beating the buyer's pick
    dark = true
    document.documentElement.dataset.theme = 'light'
    render(<Captcha onToken={() => {}} />)
    expect(widget.props?.options.theme).toBe('light')
  })

  it('does not report a token on mount', () => {
    // catches: the theme-change clear firing at mount and wiping a form's state
    const onToken = vi.fn()
    render(<Captcha onToken={onToken} />)
    expect(onToken).not.toHaveBeenCalled()
  })

  it('clears the token and re-themes the widget when the buyer picks another theme', () => {
    // catches: a stale token kept after the widget is redrawn, so the next send fails with a dead token
    const onToken = vi.fn()
    render(<Captcha onToken={onToken} />)
    const { result } = renderHook(() => useTheme()) // the theme control's hook
    act(() => result.current.setChoice('dark'))
    expect(widget.props?.options.theme).toBe('dark')
    expect(onToken).toHaveBeenCalledExactlyOnceWith(null)
  })

  it('clears the token when the system scheme flips while the choice is System', () => {
    // catches: only a picked theme clearing the token, while a system switch redraws the widget silently
    const onToken = vi.fn()
    render(<Captcha onToken={onToken} />)
    dark = true
    act(() => schemeListeners.forEach((listener) => listener()))
    expect(onToken).toHaveBeenCalledExactlyOnceWith(null)
  })

  it('keeps the token when a pick leaves the widget in the same theme', () => {
    // catches: a clear on every theme control press, so a ticked buyer must tick again for nothing
    dark = true // the system is dark
    const onToken = vi.fn()
    render(<Captcha onToken={onToken} />)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setChoice('dark')) // Dark on a dark system: the same theme
    expect(onToken).not.toHaveBeenCalled()
  })
})
