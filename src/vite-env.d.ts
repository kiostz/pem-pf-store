// Types for the Vite client and for the site's own environment variables, so a missing or misspelt key fails the type check.

/// <reference types="vite/client" />

// The variables the site reads, set in .env and .env.development.
interface ImportMetaEnv {
  // Web3Forms access key; public by design, it only emails the order handler.
  readonly VITE_WEB3FORMS_ACCESS_KEY: string // set in .env
  // hCaptcha sitekey: Web3Forms' shared key in .env, the always-passing test key in .env.development.
  readonly VITE_HCAPTCHA_SITEKEY: string // set in .env and .env.development
  // The API Worker's address, no trailing slash: the live Worker in .env, '/api' (the Vite proxy) in .env.development and .env.fake-send.
  readonly VITE_API_URL: string // set in .env and both dev env files
  // 'fake' only in dev's fake-send mode (.env.fake-send): the order is logged instead of sent.
  readonly VITE_ORDER_SEND?: string // unset everywhere else
}
