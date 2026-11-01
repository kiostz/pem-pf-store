// Setup file: applies every migration to the test D1 before each test file.

import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

// Runs at file start; storage is reset between files.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
