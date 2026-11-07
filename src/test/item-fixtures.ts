// Rows and meta the admin tests share, shaped like the Admin Worker's answers, so each test file builds on the same four items.

import type {
  AdminItem,
  AdminMeta,
} from '../../workers/admin/src/admin-types.ts' // the shared shapes

/**
 * Builds one row with sensible defaults.
 * @param fields the fields that differ from the default
 * @return a full row
 */
export const makeItem = (
  fields: Partial<AdminItem> & { id: string },
): AdminItem => ({
  name: fields.id, // the id doubles as a name unless given
  category: 'Honors', // a category of the fixed list
  subcategoryId: 5, // the Nature subcategory
  subcategory: 'Nature', // its name
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
    subcategoryId: 7, // Outreach
    subcategory: 'Outreach', // its name
    status: 'hidden',
    stock: 0,
  }),
  makeItem({
    id: 'camp-shirt',
    name: 'Camp Shirt',
    category: 'Shirts', // the Club-added shirt is in Shirts
    subcategoryId: null, // Shirts has no subcategories
    subcategory: null, // no name
    stock: 4,
    priceCents: 2500,
    clubAdded: true,
  }),
  makeItem({
    id: 'knot-tying',
    name: 'Knot Tying',
    subcategoryId: 8, // Recreation
    subcategory: 'Recreation', // its name
    stock: 12,
  }),
  makeItem({
    id: 'nature-walk',
    name: 'Nature Walk',
    stock: 3,
  }),
] // the list

// What /api/meta answers.
export const meta: AdminMeta = {
  currency: 'MYR', // Malaysian ringgit
  defaultPriceCents: 450, // RM 4.50
  categories: ['Accessories', 'Honors', 'Shirts'], // the three categories
  subcategories: { // each category's subcategories
    Accessories: [], // none
    Honors: [ // the nine Honors subcategories, A to Z
      { id: 1, name: 'ADRA' }, // subcategory 1
      { id: 2, name: 'Arts and Crafts' }, // subcategory 2
      { id: 3, name: 'Health and Science' }, // subcategory 3
      { id: 4, name: 'Household Arts' }, // subcategory 4
      { id: 5, name: 'Nature' }, // subcategory 5
      { id: 6, name: 'Outdoor Industries' }, // subcategory 6
      { id: 7, name: 'Outreach' }, // subcategory 7
      { id: 8, name: 'Recreation' }, // subcategory 8
      { id: 9, name: 'Vocational' }, // subcategory 9
    ], // the nine Honors subcategories, A to Z
    Shirts: [], // none
  }, // a key per category
}
