// Types the migrations list that vitest.config.ts injects as the TEST_MIGRATIONS binding.

declare namespace Cloudflare {
  // Test-only addition to the Worker's bindings.
  interface Env {
    // Migrations read from workers/migrations, applied by apply-migrations.ts.
    TEST_MIGRATIONS: D1Migration[]
    // Second, empty database for tests that migrate seeded old-schema data.
    MIGRATION_DB: D1Database
  }
}
