// Tests GET /api/items as pages: three sorts, the cursor, search and the category filter, in a database of 120 rows.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { call, insertHonors, seedHonors, type SeedHonor } from './helpers'

// One page as the Worker answers it.
interface Page {
  honors: { id: string; name: string; modifiedAt: string; createdAt: string }[]
  nextCursor: string | null
}

/**
 * Builds a time `minutes` after 2026-11-01 00:00 UTC, as the stored ISO text.
 * @param minutes Minutes after the start.
 * @return The ISO text.
 */
const at = (minutes: number): string => new Date(Date.UTC(2026, 10, 1, 0, minutes)).toISOString()

/**
 * Pads a number to three digits.
 * @param n The number.
 * @return For example "007".
 */
const pad = (n: number): string => String(n).padStart(3, '0')

/**
 * Seeds `count` rows "Item 001".. with times in minute steps; row n is changed and created at minute n.
 * @param count How many rows.
 * @return Nothing.
 */
async function seedNumbered(count: number): Promise<void> {
  const rows: SeedHonor[] = []
  for (let n = 1; n <= count; n++) rows.push({ id: `item-${pad(n)}`, name: `Item ${pad(n)}`, createdAt: at(n), modifiedAt: at(n), category: n % 2 === 0 ? 'Nature' : 'Outreach' })
  await seedHonors(rows)
}

/**
 * Fetches one page.
 * @param query The query string after `?`.
 * @return The status and the parsed page.
 */
async function page(query: string): Promise<{ status: number; body: Page }> {
  const res = await call(`/api/items?${query}`)
  return { status: res.status, body: (await res.json()) as Page }
}

/**
 * Walks every page of a sort, calling a hook after the first page.
 * @param sort The sort name.
 * @param extra More query text, such as `&category=Nature`.
 * @param afterFirst Runs after page 1, to change rows mid-scroll.
 * @return The ids per page.
 */
async function walk(sort: string, extra = '', afterFirst: () => Promise<void> = async () => {}): Promise<string[][]> {
  const pages: string[][] = []
  let cursor: string | null = null
  do {
    const { status, body } = await page(`sort=${sort}${extra}${cursor === null ? '' : `&cursor=${cursor}`}`)
    expect(status).toBe(200)
    pages.push(body.honors.map((honor) => honor.id))
    cursor = body.nextCursor
    if (pages.length === 1) await afterFirst() // Rows change while the admin scrolls.
  } while (cursor !== null)
  return pages
}

// Ids 001..120 in the order each sort must list them.
const ascending = Array.from({ length: 120 }, (_, i) => `item-${pad(i + 1)}`)
const descending = [...ascending].reverse()

beforeEach(() => seedNumbered(120))

describe('pages of 50', () => {
  for (const [sort, expected] of [['changed', descending], ['newest', descending], ['name', ascending]] as const) {
    it(`gives 50, 50 and 20 rows for sort=${sort}, with no repeat and no gap`, async () => {
      // Catches an off-by-one in the cursor (a repeated or skipped row at a page edge) or a page size other than 50.
      const pages = await walk(sort)
      expect(pages.map((ids) => ids.length)).toEqual([50, 50, 20])
      expect(pages.flat()).toEqual(expected)
    })

    it(`keeps going without repeats when rows change mid-scroll under sort=${sort}`, async () => {
      // Catches offset paging: a row changed or removed after page 1 would shift every later row.
      const pages = await walk(sort, '', async () => {
        await env.DB.prepare('DELETE FROM honors WHERE id = ?').bind('item-070').run() // Removed before it was reached (it sits on page 2 or 3 in every sort).
        await env.DB.prepare('UPDATE honors SET modified_at = ?, created_at = ?, stock = 9 WHERE id = ?').bind(at(500), at(500), sort === 'name' ? 'item-010' : 'item-100').run() // A seen row moves to the top of the time sorts.
      })
      const seen = pages.flat()
      expect(new Set(seen).size).toBe(seen.length) // No repeat.
      expect(seen).toEqual(expected.filter((id) => id !== 'item-070')) // Nothing but the deleted row is missing.
    })
  }

  it('breaks equal times by name A-Z, ignoring case', async () => {
    // Catches ties left to the database's own order: the 422 backfilled rows share one time and must read A-Z.
    await seedHonors([
      { id: 'banana', name: 'banana' },
      { id: 'cherry', name: 'Cherry' },
      { id: 'apple', name: 'Apple' },
      { id: 'newer', name: 'Zed', modifiedAt: at(5), createdAt: at(5) },
    ])
    for (const sort of ['changed', 'newest']) {
      expect((await page(`sort=${sort}`)).body.honors.map((h) => h.id), sort).toEqual(['newer', 'apple', 'banana', 'cherry'])
    }
  })

  it('lists name order case-insensitively', async () => {
    // Catches binary collation, which puts "apple" after every capital.
    await seedHonors([{ id: 'b', name: 'Banana' }, { id: 'a', name: 'apple' }, { id: 'c', name: 'Cherry' }])
    expect((await page('sort=name')).body.honors.map((h) => h.id)).toEqual(['a', 'b', 'c'])
  })

  it('pages the same way when two rows tie on time across the page edge', async () => {
    // Catches a cursor that keeps only the time: rows tied with the 50th would be lost or repeated.
    const rows: SeedHonor[] = []
    for (let n = 1; n <= 120; n++) rows.push({ id: `tie-${pad(n)}`, name: `Tie ${pad(n)}` }) // All the same time.
    await seedHonors(rows)
    const pages = await walk('changed')
    expect(pages.map((ids) => ids.length)).toEqual([50, 50, 20])
    expect(pages.flat()).toEqual(rows.map((row) => row.id)) // A-Z.
  })
})

describe('filters', () => {
  for (const sort of ['changed', 'newest', 'name'] as const) {
    it(`filters by category under sort=${sort} and pages through it`, async () => {
      // Catches a category filter that is applied after the page is cut, giving short or missing pages.
      const pages = await walk(sort, '&category=Nature')
      expect(pages.map((ids) => ids.length)).toEqual([50, 10])
      expect(pages.flat().every((id) => Number(id.slice(5)) % 2 === 0)).toBe(true) // Only even rows are Nature.
    })

    it(`searches words in any order under sort=${sort}, together with a category`, async () => {
      // Catches a search that is a phrase match, or that ignores the category.
      await insertHonors([
        { id: 'rope-work', name: 'Rope Work', category: 'Outreach' },
        { id: 'work-rope', name: 'Work With Rope', category: 'Nature' },
        { id: 'knots', name: 'Knots', category: 'Nature' },
      ])
      expect((await page(`sort=${sort}&q=WORK%20rope`)).body.honors.map((h) => h.id).sort()).toEqual(['rope-work', 'work-rope'])
      expect((await page(`sort=${sort}&q=work%20rope&category=Nature`)).body.honors.map((h) => h.id)).toEqual(['work-rope'])
    })
  }

  it('takes % and _ literally in a search', async () => {
    // Catches a LIKE-based search where "%" matches everything and "_" any one character.
    await insertHonors([
      { id: 'pct', name: 'Fifty 50% Off' },
      { id: 'under', name: 'Snake_Charmer' },
      { id: 'plain', name: 'Snake Charmer' },
    ])
    expect((await page('q=%25')).body.honors.map((h) => h.id)).toEqual(['pct'])
    expect((await page('q=e_c')).body.honors.map((h) => h.id)).toEqual(['under'])
  })

  it('returns an empty page for a search with no match', async () => {
    // Catches a null cursor or an error where nothing matches.
    expect(await page('q=zzzzqqq')).toEqual({ status: 200, body: { honors: [], nextCursor: null } })
  })

  it('returns an empty page for an empty table', async () => {
    // Catches a crash on no rows.
    await seedHonors([])
    expect((await page('')).body).toEqual({ honors: [], nextCursor: null })
  })

  it('gives no cursor when exactly 50 rows match', async () => {
    // Catches reading 50 instead of 51, which offers a Load more that returns nothing.
    await seedNumbered(50)
    expect((await page('')).body.nextCursor).toBeNull()
    await seedNumbered(51)
    expect((await page('')).body.nextCursor).not.toBeNull()
  })

  it('answers 400 invalid for a changed cursor sent with sort=name, and for bad queries', async () => {
    // Catches a cursor of one sort reused for another, and unchecked query text.
    const first = (await page('sort=changed')).body.nextCursor
    for (const query of [`sort=name&cursor=${first}`, 'sort=size', 'category=nature', 'q=a%20b%20c%20d%20e%20f', 'cursor=%21%21']) {
      const res = await call(`/api/items?${query}`)
      expect(res.status, query).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid' })
    }
  })

  it('sends no total and the new fields on each row', async () => {
    // Catches a count(*) creeping back, and a row missing its price or times.
    const res = await call('/api/items?sort=name')
    const body = (await res.json()) as Record<string, unknown> & { honors: Record<string, unknown>[] }
    expect(Object.keys(body).sort()).toEqual(['honors', 'nextCursor'])
    expect(body.honors[0]).toEqual({ id: 'item-001', name: 'Item 001', category: 'Outreach', status: 'active', stock: 0, priceCents: 400, image: null, clubAdded: false, createdAt: at(1), modifiedAt: at(1) })
  })

  it('marks a Club-added honor with clubAdded', async () => {
    // Catches clubAdded read from the wrong column.
    await seedHonors([{ id: 'camp-shirt', name: 'Camp Shirt', issuedBy: 'Club' }])
    expect(((await page('')).body.honors[0] as Record<string, unknown>).clubAdded).toBe(true)
  })
})
