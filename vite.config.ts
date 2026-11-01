// Vite dev/build config: the GitHub Pages base path, React, Tailwind and the `@` alias.

// Tailwind v4's Vite plugin.
import tailwindcss from '@tailwindcss/vite'
// React plugin: JSX/TSX compilation and Fast Refresh.
import react from '@vitejs/plugin-react'
// Turns a `file://` URL into a filesystem path for the alias.
import { fileURLToPath } from 'node:url'
// Vite's typed config helper.
import { defineConfig } from 'vite'

// Exported Vite configuration used by `vite` and `vite build`.
export default defineConfig({
  // The site lives under the repository name on GitHub Pages.
  base: '/pem-pf-store/',
  // React first, then Tailwind's CSS plugin.
  plugins: [react(), tailwindcss()],
  // Keep `/*! */` licence comments (Tabler's MIT notice) in the built JS.
  build: { rolldownOptions: { output: { comments: { legal: true } } } },
  // `@` resolves to src, mirroring the tsconfig path.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
