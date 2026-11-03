// Tests the item list's query plans: every sort and filter combination reads an index in order, never a temporary sort.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { encodeCursor, parseItemQuery, type ItemQuery } from '../src/item-query'
import { pageSql } from '../src/honors'
import { insertHonors, seedHonors, type SeedHonor } from './helpers'

beforeEach(async () => {
  await seedHonors([])
  const rows: SeedHonor[] = []
  for (let n = 1; n <= 200; n++) rows.push({ id: `item-${n}`, name: `Item ${n}`, category: n % 3 === 0 ? 'Nature' : 'Outreach', modifiedAt: new Date(Date.UTC(2026, 10, 1, 0, n)).toISOString(), createdAt: new Date(Date.UTC(2026, 10, 1, 0, 300 - n)).toISOString() })
  await insertHonors(rows)
})

/**
 * Reads the plan of a query's page statement.
 * @param query The parsed query.
 * @return The plan's detail lines.
 */
async function planOf(query: ItemQuery): Promise<string[]> {
  const { sql, params } = pageSql(query)
  const { results } = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(...params).all<{ detail: string }>()
  return results.map((row) => row.detail)
}

describe('query plans', () => {
  for (const sort of ['changed', 'newest', 'name'] as const) {
    for (const category of [null, 'Nature']) {
      for (const withCursor of [false, true]) {
        for (const search of [false, true]) {
          const label = `sort=${sort} category=${category ?? 'all'} cursor=${withCursor} search=${search}`
          it(`reads an index in order with no temp B-tree: ${label}`, async () => {
            // Catches a missing or wrong index: SQLite would sort 422 rows for every page, and D1 bills rows read.
            const cursor = withCursor ? encodeCursor(sort, sort === 'name' ? { name: 'Item 50', id: 'item-50' } : { time: '2026-11-01T01:00:00.000Z', name: 'Item 50', id: 'item-50' }) : null
            const query = parseItemQuery(new URL(`https://admin.test/api/items?sort=${sort}${category === null ? '' : `&category=${category}`}${search ? '&q=item' : ''}${cursor === null ? '' : `&cursor=${cursor}`}`))
            expect(query).not.toBeNull()
            const plan = await planOf(query!)
            expect(plan.join('\n')).not.toMatch(/TEMP B-TREE/i)
            expect(plan.join('\n')).toMatch(/USING (COVERING )?INDEX/i) // An index, not a table scan.
          })
        }
      }
    }
  }
})
