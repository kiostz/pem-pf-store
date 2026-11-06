// Tests GET /api/meta: the fixed category list, the currency and the default price the Add sheet starts from.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { call } from './helpers'

beforeEach(async () => {
  await env.DB.exec("DELETE FROM settings; INSERT INTO settings (id, currency, default_price_cents, order_email_on) VALUES (1, 'MYR', 400, 1)")
})

describe('GET /api/meta', () => {
  it('answers the currency, the default price and the three categories A-Z and the subcategories of each', async () => { // The /api/meta answer.
    // Catches a category list that drifts from the shop's marks, or a default price read in ringgit instead of cents.
    const res = await call('/api/meta')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({
      currency: 'MYR',
      defaultPriceCents: 400,
      categories: ['Accessories', 'Honors', 'Shirts'], // The three names.
      subcategories: { // Keyed by every category.
        Accessories: [], // None yet.
        Honors: [ // The nine honor areas, A-Z, with their ids.
          { id: 1, name: 'ADRA' }, { id: 2, name: 'Arts and Crafts' }, { id: 3, name: 'Health and Science' }, { id: 4, name: 'Household Arts' }, { id: 5, name: 'Nature' }, // First five.
          { id: 6, name: 'Outdoor Industries' }, { id: 7, name: 'Outreach' }, { id: 8, name: 'Recreation' }, { id: 9, name: 'Vocational' }, // Last four.
        ], // End of Honors.
        Shirts: [], // None yet.
      }, // End of subcategories.
    })
  })

  it('lists a subcategory seeded under Shirts, A-Z ignoring case, so the list is data-driven', async () => { // Data-driven list.
    // catches: a hard-coded subcategory list, or one sorted by id instead of name.
    await env.DB.exec("INSERT INTO subcategories (id, category, name) VALUES (30, 'Shirts', 'youth'), (31, 'Shirts', 'Adult')") // Two rows, out of order.
    const body = (await (await call('/api/meta')).json()) as { subcategories: Record<string, unknown> } // The answer.
    await env.DB.exec('DELETE FROM subcategories WHERE id >= 30') // Clean up.
    expect(body.subcategories.Shirts).toEqual([{ id: 31, name: 'Adult' }, { id: 30, name: 'youth' }]) // A-Z ignoring case.
  }) // End of it.

  it('answers 500 server when the settings row is missing', async () => {
    // Catches a meta answer with an undefined currency that the page would show as "undefined".
    await env.DB.exec('DELETE FROM settings')
    const res = await call('/api/meta')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'server' })
  })
})
