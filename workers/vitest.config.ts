// Vitest config for the Workers pool: two projects (api, admin) that run inside workerd with migrations applied.

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// Exported Vitest configuration.
export default defineConfig(async () => {
  // Read the SQL files so tests start with the real schema.
  const migrations = await readD1Migrations('./migrations')
  /**
   * Builds one Workers-pool project.
   * @param name Project name shown in the run output.
   * @param wrangler Path of the Worker's wrangler config (its bindings and vars).
   * @param setup The setup file that applies the migrations.
   * @param include Test file globs of this project.
   * @param main Entry file to use instead of the wrangler `main`; omitted keeps it.
   * @param extraD1 Extra D1 bindings (binding name to database id); omitted adds none.
   * @return The project config.
   */
  const project = (name: string, wrangler: string, setup: string, include: string[], main?: string, extraD1: Record<string, string> = {}) => ({
    plugins: [
      cloudflareTest({
        ...(main === undefined ? {} : { main }), // A stand-in entry when the real one needs a build.
        // Same bindings and vars as the deployed Worker.
        wrangler: { configPath: wrangler },
        // Hand the migrations to the setup file.
        miniflare: { bindings: { TEST_MIGRATIONS: migrations }, d1Databases: extraD1 }, // Extra databases stay empty until a test fills them.
      }),
    ],
    test: {
      name, // Shown in the output.
      // Applies migrations before each test file.
      setupFiles: [setup],
      // This Worker's tests only.
      include,
    },
  })
  return {
    test: {
      projects: [
        project('api', './api/wrangler.jsonc', './api/test/apply-migrations.ts', ['api/test/**/*.test.ts'], undefined, { MIGRATION_DB: 'migration-db' }), // MIGRATION_DB lets a test migrate seeded old-schema data.
        // The admin tests import handler.ts and run on a stub entry, so they never need the built ui-dist.
        project('admin', './admin/wrangler.jsonc', './admin/test/apply-migrations.ts', ['admin/test/**/*.test.ts'], './admin/test/entry.ts'),
      ],
    },
  }
})
