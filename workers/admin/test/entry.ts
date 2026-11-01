// Stand-in Worker entry for the admin test project, so tests run before the admin page is built (no ui-dist import).

export default {
  fetch: () => new Response('test entry', { status: 501 }), // Never called: tests call the handler directly.
} satisfies ExportedHandler // Typed as a Worker.
