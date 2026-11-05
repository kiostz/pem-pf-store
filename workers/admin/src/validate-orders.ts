// Validates the bodies of the step and settings saves where they enter: strict shape, no surprises reach the database.

import type { SettingsChange, StepChange } from './admin-types' // The shapes.
import { ORDER_STEPS, parseOrderNumber } from './order-query' // The step list and the number check.

/**
 * Tells whether a value is a plain object whose keys are exactly the given ones.
 * @param value Anything.
 * @param keys The only keys, all required.
 * @return True for a matching object.
 */
export function hasExactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false // Plain objects only.
  const actual = Object.keys(value) // The keys it has.
  return actual.length === keys.length && keys.every((key) => actual.includes(key)) // No extra, none missing.
}

/**
 * Parses the body of `POST /api/orders/step`.
 * @param body The parsed JSON.
 * @return The change, or null when invalid.
 */
export function parseStepChange(body: unknown): StepChange | null {
  if (!hasExactKeys(body, ['number', 'from', 'to', 'restock'])) return null // Exact shape.
  const number = parseOrderNumber(body.number) // Checked and upper-cased.
  const from = ORDER_STEPS.find((step) => step === body.from) // Exact match.
  const to = ORDER_STEPS.find((step) => step === body.to) // Exact match.
  if (number === null || from === undefined || to === undefined || typeof body.restock !== 'boolean') return null // Each field checked.
  if (from === 'cancelled' || to === from) return null // Cancelled is final; a no-op is refused.
  if (body.restock && to !== 'cancelled') return null // Only a cancel puts stock back.
  return { number, from, to, restock: body.restock } // All checked.
}

/**
 * Parses the body of `POST /api/settings`.
 * @param body The parsed JSON.
 * @return The change, or null when invalid.
 */
export function parseSettingsChange(body: unknown): SettingsChange | null {
  if (!hasExactKeys(body, ['orderEmailOn'])) return null // Exact shape.
  const pair = body.orderEmailOn // The switch.
  if (!hasExactKeys(pair, ['from', 'to']) || typeof pair.from !== 'boolean' || typeof pair.to !== 'boolean') return null // Two booleans.
  return pair.from === pair.to ? null : { orderEmailOn: { from: pair.from, to: pair.to } } // A no-op is refused.
}
