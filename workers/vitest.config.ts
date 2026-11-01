// Vitest config for the Workers pool: runs tests inside workerd with migrations applied.

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// Exported Vitest configuration.
export default defineConfig(async () => {
  // Read the SQL files so tests start with the real schema.
  const migrations = await readD1Migrations('./migrations')
  return {
    plugins: [
      cloudflareTest({
        // Same bindings and vars as the deployed Worker.
        wrangler: { configPath: './api/wrangler.jsonc' },
        // Hand the migrations to the setup file.
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      }),
    ],
    test: {
      // Applies migrations before each test file.
      setupFiles: ['./api/test/apply-migrations.ts'],
      // Worker tests only.
      include: ['api/test/**/*.test.ts', 'import/**/*.test.ts'],
    },
  }
})
