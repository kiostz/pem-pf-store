// Rows and meta the admin tests share, shaped like the Admin Worker's answers, so each test file builds on the same four items.

import type {
  AdminItem,
  AdminMeta,
} from '../../../workers/admin/src/admin-types.ts' // the shared shapes

/**
 * Builds one row with sensible defaults.
 * @param fields the fields that differ from the default
 * @return a full row
 */
export const makeItem = (
  fields: Partial<AdminItem> & { id: string },
): AdminItem => ({
  name: fields.id, // the id doubles as a name unless given
  category: 'Nature', // a category of the fixed list
  status: 'active', // shown to buyers
  stock: 3, // a little stock
  priceCents: 400, // RM 4.00
  image: null, // no picture yet
  clubAdded: false, // built in
  createdAt: '2026-11-01T00:00:00.000Z', // the import day
  modifiedAt: '2026-11-03T02:00:00.000Z', // 3 Nov, 10:00 am in Malaysia
  ...fields, // what the test sets
}) // a full row

// Four rows, one Hidden, one Club-added.
export const rows: AdminItem[] = [
  makeItem({
    id: 'africa-lore',
    name: 'Africa Lore',
    category: 'Outreach',
    status: 'hidden',
    stock: 0,
  }),
  makeItem({
    id: 'camp-shirt',
    name: 'Camp Shirt',
    category: 'Shirt',
    stock: 4,
    priceCents: 2500,
    clubAdded: true,
  }),
  makeItem({
    id: 'knot-tying',
    name: 'Knot Tying',
    category: 'Recreation',
    stock: 12,
  }),
  makeItem({
    id: 'nature-walk',
    name: 'Nature Walk',
    category: 'Nature',
    stock: 3,
  }),
] // the list

// What /api/meta answers.
export const meta: AdminMeta = {
  currency: 'MYR', // Malaysian ringgit
  defaultPriceCents: 450, // RM 4.50
  categories: ['Accessories', 'Nature', 'Outreach', 'Recreation', 'Shirt'], // a short list
}
