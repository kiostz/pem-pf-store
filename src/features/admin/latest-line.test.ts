// Tests for describeLatest: the one-line "what the item holds now" text, with and without a subcategory.

import { describe, expect, it } from 'vitest' // test API
import { describeLatest } from './latest-line.ts' // the code under test
import { makeItem } from '@/test/item-fixtures.ts' // a full row

describe('describeLatest', () => { // the Latest line's text
  it('puts the subcategory after the category when the item has one', () => { // Honors items show their subcategory
    // catches: a conflict line that hides the subcategory another admin set.
    const row = makeItem({ id: 'knot-tying', name: 'Knot Tying', subcategoryId: 8, subcategory: 'Recreation', stock: 12 }) // Honors · Recreation
    expect(describeLatest(row, 'MYR')).toBe('Knot Tying · Honors · Recreation · RM\u00a04.00 · Active · 12 in stock') // the subcategory sits between category and price; the price joins its currency with a no-break space
  })

  it('has no subcategory part when it is null', () => { // Accessories and Shirts show none
    // catches: a doubled separator or the word "null" in the line.
    const row = makeItem({ id: 'camp-shirt', name: 'Camp Shirt', category: 'Shirts', subcategoryId: null, subcategory: null, status: 'hidden', stock: 4, priceCents: 2500 }) // a Shirts item
    expect(describeLatest(row, 'MYR')).toBe('Camp Shirt · Shirts · RM\u00a025.00 · Hidden · 4 in stock') // category then price
  })
})
