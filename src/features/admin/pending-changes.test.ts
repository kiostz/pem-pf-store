// Tests for the pending-changes functions: set-back removal, counting by field, `from` taken from the base, and the rebase after a conflict.

import { describe, expect, it } from 'vitest' // test API
import type { AdminHonor } from '../../../workers/admin/src/admin-types.ts' // the row shape
import {
  applySaved,
  countChanges,
  rebaseAfterConflict,
  setStatus,
  setStock,
  toHonorChanges,
} from './pending-changes.ts' // the code under test

const base: AdminHonor[] = [
  {
    id: 'knot-tying',
    name: 'Knot Tying',
    category: 'Outdoor',
    status: 'active',
    stock: 12,
  },
  {
    id: 'africa-lore',
    name: 'Africa Lore',
    category: 'Mission',
    status: 'hidden',
    stock: 0,
  },
] // two rows as the admin saw them

describe('pending changes', () => {
  it('removes a field when it is set back to the base value, and the row when it has no field left', () => {
    // Catches a Save pill that keeps counting an edit that was undone by hand.
    const edited = setStock({}, base, 'knot-tying', 5)
    expect(edited).toEqual({ 'knot-tying': { stock: 5 } })
    expect(setStock(edited, base, 'knot-tying', 12)).toEqual({})
  })

  it('counts by field, not by row', () => {
    // Catches "Save (1 change)" for a row with both its status and its stock edited.
    let pending = setStock({}, base, 'knot-tying', 5)
    pending = setStatus(pending, base, 'knot-tying', 'hidden')
    pending = setStatus(pending, base, 'africa-lore', 'active')
    expect(countChanges(pending)).toBe(3)
  })

  it('takes `from` from the base and `to` from the edit', () => {
    // Catches a save that sends the edited value as `from`, which the Worker would never refuse.
    const pending = setStock(
      setStatus({}, base, 'africa-lore', 'active'),
      base,
      'africa-lore',
      7,
    )
    expect(toHonorChanges(pending, base)).toEqual([
      {
        id: 'africa-lore',
        status: { from: 'hidden', to: 'active' },
        stock: { from: 0, to: 7 },
      },
    ])
  })

  it('applies saved rows over the base by id and leaves the others alone', () => {
    // Catches a saved row that is not shown as saved, or one that wipes its neighbours.
    const saved: AdminHonor = { ...base[0], stock: 5 }
    expect(applySaved(base, [saved])).toEqual([saved, base[1]])
  })

  it('rebases after a conflict: keeps the edit, drops an edit that equals the current value, lists the conflicted ids', () => {
    // Catches a conflict that throws the admin's edits away, or keeps one that is already true.
    const pending = {
      'knot-tying': { stock: 7 }, // differs from the current 5: stays
      'africa-lore': { status: 'active' as const }, // equals the current value: goes
    }
    const current: AdminHonor[] = [
      { ...base[0], stock: 5 },
      { ...base[1], status: 'active' },
    ]
    const result = rebaseAfterConflict(base, pending, current)
    expect(result.pending).toEqual({ 'knot-tying': { stock: 7 } })
    expect(result.base).toEqual(current)
    expect(result.conflictedIds).toEqual(['knot-tying', 'africa-lore'])
    expect(toHonorChanges(result.pending, result.base)).toEqual([
      { id: 'knot-tying', stock: { from: 5, to: 7 } },
    ])
  })
})
