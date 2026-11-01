// ESLint flat config: JS, TypeScript, React hooks and React Refresh recommended rules.

// Base recommended JS rules.
import js from '@eslint/js'
// Flat-config helpers for typed config arrays and top-level ignores.
import { defineConfig, globalIgnores } from 'eslint/config'
// Rules of Hooks and exhaustive-deps.
import reactHooks from 'eslint-plugin-react-hooks'
// Warns when a file's exports would break Fast Refresh.
import reactRefresh from 'eslint-plugin-react-refresh'
// Predefined global variable sets.
import globals from 'globals'
// TypeScript-aware linting.
import tseslint from 'typescript-eslint'

// Exported flat-config array.
export default defineConfig([
  // Never lint build output, local Wrangler state, generated Worker types or the built admin page.
  globalIgnores(['dist', '**/.wrangler', '**/worker-configuration.d.ts', 'workers/admin/ui-dist']),
  {
    // All TypeScript and TSX source files.
    files: ['**/*.{ts,tsx}'],
    // Recommended rules for JS, TS, React hooks and Vite's React Refresh.
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    // Source runs in a browser.
    languageOptions: { globals: globals.browser },
  },
  {
    // The Workers run in workerd, which has service-worker globals.
    files: ['workers/**/*.ts'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    // Config files and seed scripts run in Node, not the browser.
    files: [
      '*.config.{ts,js}',
      'workers/*.config.ts',
      'workers/import/write-import-sql.ts',
      'scripts/**/*.ts',
    ],
    languageOptions: { globals: globals.node },
  },
])
