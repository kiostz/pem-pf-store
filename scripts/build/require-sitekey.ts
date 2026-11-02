// Production-build guard: stops `vite build` when the Turnstile sitekey is missing or still the placeholder, so a failed Pages build keeps the old site live instead of shipping a captcha that cannot load.

const PLACEHOLDER = 'REPLACE_WITH_TURNSTILE_SITEKEY' // what `.env` holds until the owner pastes the live sitekey

/**
 * Throws when a production build would ship without a real Turnstile sitekey.
 * @param command Vite's command; only `build` is checked, so `vite preview` (command `serve`) works with the placeholder
 * @param mode Vite's mode; only `production` is checked, so dev and test keep the test sitekey
 * @param env the env values Vite loaded for that mode
 * @return nothing; it throws a clear error instead of returning a failure
 */
export function requireSitekey(
  command: string,
  mode: string,
  env: Record<string, string>,
): void {
  if (command !== 'build') return // `vite preview` and `vite` only serve, so the placeholder is harmless there
  if (mode !== 'production') return // dev and test modes use the published test sitekey
  const sitekey = env.VITE_TURNSTILE_SITEKEY // what the browser would get
  if (!sitekey || sitekey === PLACEHOLDER)
    throw new Error(
      'VITE_TURNSTILE_SITEKEY is missing or still the placeholder; paste the live Turnstile sitekey into .env before building.',
    ) // names the fix
}
