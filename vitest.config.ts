// Vitest config for unit and component tests, in src and in the build and package-script checks.

// React plugin so component tests can render TSX.
import react from '@vitejs/plugin-react'
// Turns a `file://` URL into a filesystem path for the alias.
import { fileURLToPath } from 'node:url'
// Vitest's typed config helper.
import { defineConfig } from 'vitest/config'

// Exported Vitest configuration.
export default defineConfig({
  // Enable the React plugin for TSX tests.
  plugins: [react()],
  // Same `@` alias as vite.config.ts.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // Simulated browser DOM for component tests.
    environment: 'jsdom',
    // Runs before each test file (jest-dom matchers, RTL cleanup).
    setupFiles: ['./src/test/setup.ts'],
    // Test files in src and in the build and package-script checks.
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
})
