// Browser entry point of the admin page: applies the saved theme, loads the styles and mounts the admin app into admin.html's #root.

import { StrictMode } from 'react' // dev-time checks
import { createRoot } from 'react-dom/client' // React 19 mount
import { AdminApp } from './features/admin/AdminApp.tsx' // the admin page
import { readThemeChoice } from './shared/theme/theme-storage.ts' // the saved pick
import './styles/index.css' // Tailwind and tokens

// The page's CSP forbids an inline theme script, so the saved pick is applied here, before the first render.
const choice = readThemeChoice() // light, dark or system
if (choice !== 'system') document.documentElement.dataset.theme = choice // same attribute as use-theme.ts

const rootElement = document.getElementById('root') // the mount point
if (!rootElement) throw new Error('admin.html has no #root element') // fail loudly, not a blank page

// Render the app.
createRoot(rootElement).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
)
