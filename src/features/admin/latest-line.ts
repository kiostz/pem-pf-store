// The text that says what an item holds now, shared by the flagged row and the Delete dialog's refusal so both read the same.

import type { AdminItem } from '../../../workers/admin/src/admin-types.ts' // the row shape
import { formatPrice } from '@/shared/format/price.ts' // "RM 25.00"

/**
 * Writes an item's current values on one line.
 * @param row the item's latest values
 * @param currency the ISO currency code
 * @return "Camp Shirt · Shirt · RM 25.00 · Active · 9 in stock"
 */
export const describeLatest = (row: AdminItem, currency: string): string =>
  `${row.name} · ${row.category} · ${formatPrice(row.priceCents / 100, currency)} · ${row.status === 'active' ? 'Active' : 'Hidden'} · ${row.stock} in stock` // name, category, price, status and stock
