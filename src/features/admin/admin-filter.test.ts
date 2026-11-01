// Tests for the admin items filter: every search word must match, the category narrows, and Hidden items stay in the list.

import { describe, expect, it } from 'vitest' // test API
import type { AdminHonor } from '../../../workers/admin/src/admin-types.ts' // the row shape
import { adminCategoryNames, filterAdminHonors } from './admin-filter.ts' // the code under test

const rows: AdminHonor[] = [
  {
    id: 'knot-tying',
    name: 'Knot Tying',
    category: 'Outdoor',
    status: 'active',
    stock: 1,
  },
  {
    id: 'camp-knots',
    name: 'Camp Knots Advanced',
    category: 'Recreation',
    status: 'hidden',
    stock: 0,
  },
  {
    id: 'africa-lore',
    name: 'Africa Lore',
    category: 'Mission',
    status: 'hidden',
    stock: 0,
  },
] // three rows, two Hidden

describe('filterAdminHonors', () => {
  it('matches every word, in any order, ignoring case, and lists Hidden items', () => {
    // Catches a search that matches any word, or one that hides the Hidden items the admin came to edit.
    expect(
      filterAdminHonors(rows, { query: 'KNOT camp', category: null }).map(
        (row) => row.id,
      ),
    ).toEqual(['camp-knots'])
    expect(
      filterAdminHonors(rows, { query: 'knot', category: null }).map(
        (row) => row.id,
      ),
    ).toEqual(['knot-tying', 'camp-knots'])
    expect(
      filterAdminHonors(rows, { query: '  ', category: null }),
    ).toHaveLength(3)
  })

  it('narrows by category together with the search', () => {
    // Catches a category filter that ignores the search box.
    expect(
      filterAdminHonors(rows, { query: 'knot', category: 'Outdoor' }).map(
        (row) => row.id,
      ),
    ).toEqual(['knot-tying'])
  })
})

describe('adminCategoryNames', () => {
  it('lists the categories of every row, Hidden ones included, once each, A to Z', () => {
    // Catches a category missing from the filter because all its items are Hidden.
    expect(adminCategoryNames(rows)).toEqual([
      'Mission',
      'Outdoor',
      'Recreation',
    ])
  })
})
