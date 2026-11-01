// API Worker entry stub: answers every request with a 404 JSON error so `wrangler dev` starts.

/**
 * Handles one request; every path is unknown until the read endpoints exist.
 * @return A 404 JSON response with the short error code.
 */
export default {
  fetch(): Response {
    // Short code only, never details.
    return Response.json(
      { error: 'not-found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  },
} satisfies ExportedHandler<Env>
