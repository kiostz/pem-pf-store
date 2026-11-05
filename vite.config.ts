// Vite dev/build config: the GitHub Pages base path, React, Tailwind and the `@` alias.

// Tailwind v4's Vite plugin.
import tailwindcss from '@tailwindcss/vite'
// React plugin: JSX/TSX compilation and Fast Refresh.
import react from '@vitejs/plugin-react'
// Turns a `file://` URL into a filesystem path for the alias.
import { fileURLToPath } from 'node:url'
// Vite's typed config helper.
import { defineConfig, loadEnv } from 'vite'
// Fails a production build that has no real Turnstile sitekey.
import { requireSitekey } from './scripts/build/require-sitekey.ts'

// Exported Vite configuration used by `vite` and `vite build`.
export default defineConfig(({ command, mode }) => {
  requireSitekey(command, mode, loadEnv(mode, process.cwd(), 'VITE_')) // a placeholder sitekey stops the build, so the old site stays live; preview only serves
  return {
    // The site lives under the repository name on GitHub Pages.
    base: '/pem-pf-store/',
    // React first, then Tailwind's CSS plugin.
    plugins: [react(), tailwindcss()],
    // Keep `/*! */` licence comments (Tabler's MIT notice) in the built JS.
    build: { rolldownOptions: { output: { comments: { legal: true } } } },
    // Dev only: `/api/...` goes to the local API Worker (`npm run dev` in workers/, port 8787), so the shop is same-origin and the Worker's CORS stays untouched; `/pictures/...` goes to the local Admin Worker (port 8788).
    server: {
      watch: { ignored: ['**/.wrangler/**'] }, // guard: keeps local wrangler writes under .wrangler/ from ever reaching the dev watcher
      proxy: {
        '/pictures': {
          target: 'http://localhost:8788', // the local Admin Worker (`npm run dev:admin` in workers/), which serves the local R2
        },
        '/api': {
          target: 'http://localhost:8787', // the local API Worker
          rewrite: (path) => path.replace(/^\/api/, ''), // the Worker has no /api prefix
        },
      },
    },
    // `@` resolves to src, mirroring the tsconfig path.
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  }
})
