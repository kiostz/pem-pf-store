// Types for the Vite client and for the site's own environment variables, so a missing or misspelt key fails the type check.

/// <reference types="vite/client" />

// The variables the site reads, set in .env and .env.development.
interface ImportMetaEnv {
  // Turnstile sitekey: the live widget's in .env, Cloudflare's always-passing test key in .env.development.
  readonly VITE_TURNSTILE_SITEKEY: string // set in .env and .env.development
  // The API Worker's address, no trailing slash: the live Worker in .env, '/api' (the Vite proxy) in .env.development.
  readonly VITE_API_URL: string // set in .env and .env.development
  // Where pictures load from, no trailing slash: the R2 custom domain in .env, '/pictures' (the Vite proxy to the local Admin Worker) in .env.development.
  readonly VITE_PICTURE_URL: string // set in .env and .env.development
}
