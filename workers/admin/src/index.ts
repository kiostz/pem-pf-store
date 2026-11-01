// Admin Worker entry: hands the built admin page files to the request handler.

import html from '../ui-dist/admin.html' // Page.
import js from '../ui-dist/admin.js' // Script.
import css from '../ui-dist/admin.css' // Styles.
import { createHandler } from './handler' // The request handler.

export default { // The Worker entry.
  fetch: createHandler({ html, js, css }), // The Worker's only entry point.
} satisfies ExportedHandler<Env> // Typed as a Worker.
