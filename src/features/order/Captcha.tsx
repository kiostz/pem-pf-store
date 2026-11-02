// The Cloudflare Turnstile widget behind one small interface, so the form depends on a token and a reset and tests can stand in for the widget.

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile' // the community React widget Cloudflare lists
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react' // the reset handle and the theme follow
import { useTheme } from '@/shared/theme/use-theme.ts' // the theme the page shows, a pick or the system's

// What the form can ask of the widget.
export type CaptchaHandle = { reset: () => void }

/**
 * Draws the captcha in the site's light or dark theme. A theme change redraws the widget unsolved, so the token is cleared with it.
 * @param onToken called with the token when solved, and with null when it expires or fails
 * @param ref gives the form `reset()`, which clears the widget so it can be solved again
 * @return the widget
 */
export function Captcha({ onToken, ref }: { onToken: (token: string | null) => void; ref?: Ref<CaptchaHandle> }) {
  const widget = useRef<TurnstileInstance>(null) // the package's own handle
  const { resolved } = useTheme() // the pick, or the system scheme while it is System
  const shown = useRef(resolved) // the theme the widget was last drawn in
  useImperativeHandle(ref, () => ({ reset: () => widget.current?.reset() }), []) // the one thing the form needs

  // The package redraws the widget on a theme change without calling onExpire, so the form is told its token is gone.
  useEffect(() => {
    if (shown.current === resolved) return // the same theme: the widget and its token stand
    shown.current = resolved // remembered for the next change
    onToken(null) // the redrawn widget is unsolved
  }, [resolved, onToken])
  return (
    <Turnstile
      ref={widget} // for reset
      siteKey={import.meta.env.VITE_TURNSTILE_SITEKEY} // set per mode in the env files
      options={{ theme: resolved }} // matches the page
      onSuccess={(token) => onToken(token)} // solved
      onExpire={() => onToken(null)} // the token ran out, so Send is incomplete again
      onError={() => onToken(null)} // the widget failed, so there is no token
    />
  )
}
