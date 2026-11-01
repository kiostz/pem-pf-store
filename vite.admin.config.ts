// Vite build config of the admin page: base "/", no public folder, and fixed file names in workers/admin/ui-dist, which the Admin Worker imports as text.

// Tailwind v4's Vite plugin.
import tailwindcss from '@tailwindcss/vite'
// React plugin: JSX/TSX compilation.
import react from '@vitejs/plugin-react'
// Turns a `file://` URL into a filesystem path.
import { fileURLToPath } from 'node:url'
// Vite's typed config helper.
import { defineConfig } from 'vite'

// Exported Vite configuration used by `vite build --config vite.admin.config.ts`.
export default defineConfig({
  // The Admin Worker serves the page at its root.
  base: '/',
  // The shop's public folder (data, patch pictures) is not part of the admin page.
  publicDir: false,
  // React first, then Tailwind's CSS plugin.
  plugins: [react(), tailwindcss()],
  // `@` resolves to src, as in the shop's config.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    // The folder the Admin Worker imports its page from.
    outDir: 'workers/admin/ui-dist',
    // It lies outside the Vite root, so say it may be emptied.
    emptyOutDir: true,
    // One stylesheet, so its name can be fixed.
    cssCodeSplit: false,
    // The page is admin.html, not index.html.
    rolldownOptions: {
      input: fileURLToPath(new URL('./admin.html', import.meta.url)),
      // Fixed names: the Worker imports exactly these three files.
      output: { entryFileNames: 'admin.js', assetFileNames: 'admin[extname]' },
    },
  },
})
