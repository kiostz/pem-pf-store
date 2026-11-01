// Tests the Access gate: every path and method answers 403 unless Access signed in an allowed admin.

import { describe, expect, it } from 'vitest'
import { call, postChanges, seedHonors } from './helpers'

// Each request the gate must guard, as a label and a sender.
const guarded: [string, (options?: Parameters<typeof call>[2]) => Promise<Response>][] = [
  ['GET /api/items', (o) => call('/api/items', {}, o)],
  ['POST /api/items/changes', (o) => postChanges({ changes: [] }, {}, o)],
  ['GET /api/nope', (o) => call('/api/nope', {}, o)],
]

/**
 * Asserts a 403 `forbidden` with nothing but the code in the body.
 * @param res The response to check.
 * @return Nothing; throws through `expect` on a mismatch.
 */
async function expectForbidden(res: Response): Promise<void> {
  expect(res.status).toBe(403) // Refused.
  expect(await res.json()).toEqual({ error: 'forbidden' }) // No page and no data.
}

describe('Access gate', () => {
  for (const [label, send] of guarded) {
    describe(label, () => {
      it('refuses a request Access did not sign in', async () => {
        // Catches a route reachable when ctx.access is missing (the Static Assets case).
        await expectForbidden(await send({ access: 'none' }))
      })

      it('refuses a wrong aud', async () => {
        // Catches a gate that checks only that ctx.access exists, so another Access app's login passes.
        await expectForbidden(await send({ access: { aud: 'other-app' } }))
      })

      it('refuses everything while ACCESS_AUD is empty or still the placeholder', async () => {
        // Catches a deploy before Access is set up that matches an empty or placeholder aud.
        await expectForbidden(await send({ access: { aud: '' }, env: { ACCESS_AUD: '' } }))
        await expectForbidden(await send({ access: { aud: 'set-after-access' }, env: { ACCESS_AUD: 'set-after-access' } }))
      })

      it('refuses a signed-in session with no identity', async () => {
        // Catches an email check that treats a missing identity as allowed.
        await expectForbidden(await send({ access: { email: null } }))
      })

      it('refuses an email that is not on the list', async () => {
        // Catches a gate that trusts a too-wide Access policy.
        await expectForbidden(await send({ access: { email: 'stranger@example.test' } }))
      })
    })
  }

  it('lets an admin in whatever the email case', async () => {
    // Catches a case-sensitive email compare locking out an admin whose sign-in code arrived in other casing.
    await seedHonors([])
    expect((await call('/api/items', {}, { access: { email: 'ADMIN@Example.TEST' } })).status).toBe(200)
  })

  it('allows every listed address and tolerates spaces and mixed case in the list', async () => {
    // Catches a list parser that fails on ", " or on upper case entries.
    await seedHonors([])
    const listed = { ADMIN_EMAILS: ' Admin@example.test ,  SECOND@example.test,, ' }
    expect((await call('/api/items', {}, { access: { email: 'second@example.test' }, env: listed })).status).toBe(200) // Second admin.
    expect((await call('/api/items', {}, { access: { email: 'admin@example.test' }, env: listed })).status).toBe(200) // First admin.
    await expectForbidden(await call('/api/items', {}, { access: { email: 'third@example.test' }, env: listed })) // Unlisted.
  })

  it('refuses everyone when ADMIN_EMAILS is empty or missing', async () => {
    // Catches an empty entry from "".split(",") matching an empty email.
    await expectForbidden(await call('/api/items', {}, { env: { ADMIN_EMAILS: '' } }))
    await expectForbidden(await call('/api/items', {}, { env: { ADMIN_EMAILS: ' , ' } }))
    await expectForbidden(await call('/api/items', {}, { env: { ADMIN_EMAILS: undefined as unknown as string } }))
  })

  it('answers 403, not 404, for an unknown path without Access', async () => {
    // Catches routing before the gate, which would show which paths exist.
    expect((await call('/nope', {}, { access: 'none' })).status).toBe(403)
  })
})
