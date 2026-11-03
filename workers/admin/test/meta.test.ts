// Tests GET /api/meta: the fixed category list, the currency and the default price the Add sheet starts from.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { call } from './helpers'

beforeEach(async () => {
  await env.DB.exec("DELETE FROM settings; INSERT INTO settings (id, currency, default_price_cents, order_email_on) VALUES (1, 'MYR', 400, 1)")
})

describe('GET /api/meta', () => {
  it('answers the currency, the default price and the 11 categories A-Z', async () => {
    // Catches a category list that drifts from the shop's marks, or a default price read in ringgit instead of cents.
    const res = await call('/api/meta')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({
      currency: 'MYR',
      defaultPriceCents: 400,
      categories: ['Accessories', 'ADRA', 'Arts and Crafts', 'Health and Science', 'Household Arts', 'Nature', 'Outdoor Industries', 'Outreach', 'Recreation', 'Shirt', 'Vocational'],
    })
  })

  it('answers 500 server when the settings row is missing', async () => {
    // Catches a meta answer with an undefined currency that the page would show as "undefined".
    await env.DB.exec('DELETE FROM settings')
    const res = await call('/api/meta')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'server' })
  })
})
