// Tests GET /api/orders: pages of 50 without repeats or gaps, step filter, number lookup, lines and buyer details.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { BUYER, call, insertItems, orderNumber, seedItems, seedOrders, type SeedOrder } from './helpers'

interface Page { orders: { number: string; step: string; itemCount: number; totalCents: number; buyer: unknown; lines: { itemId: string; name: string; quantity: number; priceCents: number; inShop: boolean }[] }[]; nextCursor: string | null }

/**
 * Reads one page.
 * @param query The query string without the question mark.
 * @return The status and parsed page.
 */
async function page(query = ''): Promise<{ status: number; body: Page }> {
  const res = await call(`/api/orders?${query}`) // One request.
  return { status: res.status, body: (await res.json()) as Page } // Parsed.
}

/**
 * Reads every page to the end.
 * @param query Extra query text.
 * @return The order numbers of each page, in order.
 */
async function allPages(query = ''): Promise<string[][]> {
  const pages: string[][] = [] // One list per page.
  let cursor: string | null = null // Where the next page starts.
  do { // At least one page.
    const { body } = await page(`${query}${cursor === null ? '' : `&cursor=${cursor}`}`) // The page.
    pages.push(body.orders.map((order) => order.number)) // Its numbers.
    cursor = body.nextCursor // On.
  } while (cursor !== null)
  return pages
}

beforeEach(async () => {
  await seedItems([])
  await seedOrders([])
})

describe('GET /api/orders pages', () => {
  it('gives 50, 50 and 20 for 120 orders, newest first, with no repeat or gap', async () => {
    // Catches an off-by-one in the 51st-row check or a cursor that skips or repeats a row.
    const orders: SeedOrder[] = []
    for (let n = 0; n < 120; n++) orders.push({ number: orderNumber(n), createdAt: new Date(Date.UTC(2026, 10, 1, 0, n)).toISOString() })
    await seedOrders(orders)
    const pages = await allPages()
    expect(pages.map((p) => p.length)).toEqual([50, 50, 20])
    expect(pages.flat()).toEqual(orders.map((o) => o.number).reverse()) // Newest first, every one once.
  })

  it('keeps going without repeat or gap when an order arrives between pages', async () => {
    // Catches offset paging, where a new order shifts every row and repeats one.
    const orders: SeedOrder[] = []
    for (let n = 0; n < 60; n++) orders.push({ number: orderNumber(n), createdAt: new Date(Date.UTC(2026, 10, 1, 0, n)).toISOString() })
    await seedOrders(orders)
    const first = await page()
    await env.DB.prepare("INSERT INTO orders (number, created_at, currency, total_cents, buyer_name, buyer_email, buyer_phone, club) VALUES (?, '2026-11-02T00:00:00.000Z', 'MYR', 0, 'x', 'x', 'x', 'Gilead')").bind(orderNumber(900)).run() // A newer order.
    const second = await page(`cursor=${first.body.nextCursor}`)
    expect([...first.body.orders, ...second.body.orders].map((o) => o.number)).toEqual(orders.map((o) => o.number).reverse()) // The newcomer is not in the walk, nothing repeats.
  })

  it('breaks equal created_at values by id, across a page edge', async () => {
    // Catches a cursor on time alone, which drops or repeats rows that share a time.
    const orders: SeedOrder[] = []
    for (let n = 0; n < 75; n++) orders.push({ id: n + 1, number: orderNumber(n), createdAt: '2026-11-05T01:00:00.000Z' })
    await seedOrders(orders)
    const pages = await allPages()
    expect(pages.flat()).toEqual(orders.map((o) => o.number).reverse()) // Highest id first.
  })

  it('filters by step and gives an empty list for a step with no orders', async () => {
    // Catches a filter applied after paging (short pages) or one that ignores the step.
    const orders: SeedOrder[] = []
    for (let n = 0; n < 130; n++) orders.push({ number: orderNumber(n), createdAt: new Date(Date.UTC(2026, 10, 1, 0, n)).toISOString(), step: n % 2 === 0 ? 'paid' : 'new' })
    await seedOrders(orders)
    const pages = await allPages('step=paid')
    expect(pages.map((p) => p.length)).toEqual([50, 15])
    const { body } = await page('step=cancelled')
    expect(body).toEqual({ orders: [], nextCursor: null })
  })

  it('looks one order up by number, lower case accepted, and gives an empty list for an unknown one', async () => {
    // Catches a lookup that returns a page or errors for a number nobody has.
    await seedOrders([{ number: 'PF-20261105-ABCD' }, { number: 'PF-20261105-ABCE' }])
    const found = await page('number=pf-20261105-abcd')
    expect(found.body.orders.map((o) => o.number)).toEqual(['PF-20261105-ABCD'])
    expect(found.body.nextCursor).toBeNull()
    expect((await page('number=PF-20261105-ZZZZ')).body).toEqual({ orders: [], nextCursor: null })
  })

  it('carries snapshot names and prices, sums quantities, and marks a deleted item as not in the shop', async () => {
    // Catches lines read from the live item (a renamed or repriced item rewriting history) and a count of lines instead of quantity.
    await insertItems([{ id: 'knot-tying', name: 'Knot Tying Renamed', priceCents: 999 }])
    await seedOrders([{ number: 'PF-20261105-ABCD', lines: [{ itemId: 'knot-tying', name: 'Knot Tying', quantity: 2, priceCents: 400 }, { itemId: 'gone', name: 'Gone Item', quantity: 3, priceCents: 250 }] }])
    const { body } = await page('number=PF-20261105-ABCD')
    const order = body.orders[0]
    expect(order.itemCount).toBe(5)
    expect(order.totalCents).toBe(1550)
    expect(order.lines).toEqual([
      { itemId: 'knot-tying', name: 'Knot Tying', quantity: 2, priceCents: 400, inShop: true },
      { itemId: 'gone', name: 'Gone Item', quantity: 3, priceCents: 250, inShop: false },
    ])
    expect(order.buyer).toEqual(BUYER)
  })

  it('serves every order with a buyer object and no personalDataRemovedAt key', async () => {
    // Catches the dropped removal field still being served, or a buyer that is not a full object.
    await seedOrders([{ number: 'PF-20261105-ABCD' }])
    const order = (await page()).body.orders[0]
    expect(Object.keys(order)).not.toContain('personalDataRemovedAt')
    expect(order.buyer).toEqual(BUYER)
  })

  it('answers 400 invalid for a bad query and sets no-store', async () => {
    // Catches a bad query reaching SQL, or an order list that a cache could keep.
    const res = await call('/api/orders?step=shipped')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid' })
    expect((await call('/api/orders')).headers.get('Cache-Control')).toBe('no-store')
  })
})
