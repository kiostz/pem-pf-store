// Tests for the pending-changes functions: edits per field against a snapshot of the row, counting, the request's `from` values, and the three rebases.

import { describe, expect, it } from 'vitest' // test API
import {
  applySaved,
  countChanges,
  dropIds,
  mergeSaved,
  rebaseAfterConflict,
  rebaseOnFetch,
  setEdit,
  toItemChanges,
  type PendingChanges,
} from './pending-changes.ts' // the code under test
import { makeItem } from '@/test/item-fixtures.ts' // row builder

const knot = makeItem({
  id: 'knot-tying',
  name: 'Knot Tying',
  category: 'Recreation',
  stock: 12,
}) // a row as seen

describe('setEdit', () => {
  it('records an edit with the row as seen, and drops the row when the edit is set back', () => {
    // Catches an edit that lingers after the admin types the old value back.
    const edited = setEdit({}, knot, 'stock', 5)
    expect(edited).toEqual({
      'knot-tying': { seen: knot, edits: { stock: 5 } },
    })
    expect(setEdit(edited, knot, 'stock', 12)).toEqual({})
  })

  it('keeps the first snapshot even when the shown row has moved on', () => {
    // Catches `from` being taken from a newer row than the one the admin edited against.
    const first = setEdit({}, knot, 'stock', 5)
    const moved = { ...knot, stock: 9 }
    expect(setEdit(first, moved, 'name', 'Knots')['knot-tying'].seen).toEqual(
      knot,
    )
  })

  it('edits name, category and price like status and stock', () => {
    // Catches a field the pending model cannot hold.
    let pending: PendingChanges = {}
    pending = setEdit(pending, knot, 'name', 'Knots')
    pending = setEdit(pending, knot, 'category', 'Nature')
    pending = setEdit(pending, knot, 'priceCents', 550)
    expect(pending['knot-tying'].edits).toEqual({
      name: 'Knots',
      category: 'Nature',
      priceCents: 550,
    })
    expect(countChanges(pending)).toBe(3)
  })
})

describe('toItemChanges', () => {
  it('takes every `from` from the snapshot, per edited field only', () => {
    // Catches a `from` read from a list that has since changed, which would hide a conflict.
    let pending: PendingChanges = {}
    pending = setEdit(pending, knot, 'priceCents', 550)
    pending = setEdit(pending, knot, 'status', 'hidden')
    expect(toItemChanges(pending)).toEqual([
      {
        id: 'knot-tying',
        priceCents: { from: 400, to: 550 },
        status: { from: 'active', to: 'hidden' },
      },
    ])
  })
})

describe('mergeSaved', () => {
  it('takes only the saved fields and the new change time, leaving other fields as seen', () => {
    // Catches a save answer that silently shows a name another admin changed, hiding a later conflict.
    const sent = setEdit({}, knot, 'priceCents', 550)
    const answer = {
      ...knot,
      name: 'Other',
      priceCents: 550,
      modifiedAt: '2026-11-03T05:00:00.000Z',
    }
    expect(mergeSaved(sent, [answer])).toEqual([
      { ...knot, priceCents: 550, modifiedAt: '2026-11-03T05:00:00.000Z' },
    ])
  })

  it('keeps an answer for a row nothing was sent for', () => {
    // Catches a dropped row.
    expect(mergeSaved({}, [knot])).toEqual([knot])
  })
})

describe('applySaved', () => {
  it('makes the saved row the snapshot, drops what was written, and keeps edits made meanwhile', () => {
    // Catches a save that clears an edit typed while it ran, or leaves the written edit pending.
    let pending = setEdit({}, knot, 'stock', 5)
    pending = setEdit(pending, knot, 'name', 'Knots')
    const saved = { ...knot, stock: 5, modifiedAt: '2026-11-03T05:00:00.000Z' }
    const next = applySaved(pending, [saved])
    expect(next).toEqual({
      'knot-tying': { seen: saved, edits: { name: 'Knots' } },
    })
  })
})

describe('rebaseOnFetch', () => {
  it('rebases and flags a row whose edited field moved', () => {
    // Catches a refetch that leaves a stale `from`, or one that silently drops the admin's edit.
    const pending = setEdit({}, knot, 'stock', 5)
    const fresh = { ...knot, stock: 9 }
    const result = rebaseOnFetch(pending, [fresh])
    expect(result.pending).toEqual({
      'knot-tying': { seen: fresh, edits: { stock: 5 } },
    })
    expect(result.flagged).toEqual([fresh])
  })

  it('only updates the snapshot when an unedited field moved, with no flag', () => {
    // Catches a flag on a row where nothing the admin touched changed.
    const pending = setEdit({}, knot, 'stock', 5)
    const fresh = { ...knot, name: 'Knot Tying 2' }
    const result = rebaseOnFetch(pending, [fresh])
    expect(result.pending['knot-tying'].seen).toEqual(fresh)
    expect(result.flagged).toEqual([])
  })

  it('ignores rows with no pending edit', () => {
    // Catches pending entries invented for every fetched row.
    expect(rebaseOnFetch({}, [knot]).pending).toEqual({})
  })
})

describe('rebaseAfterConflict', () => {
  it('rebases the current rows, flags them, and drops ids another admin deleted', () => {
    // Catches a conflict that re-sends the stale `from`, or keeps an edit for a gone row.
    const gone = makeItem({ id: 'gone', name: 'Gone' })
    let pending = setEdit({}, knot, 'stock', 5)
    pending = setEdit(pending, gone, 'stock', 1)
    const current = { ...knot, stock: 7 }
    const result = rebaseAfterConflict(pending, [current], ['gone'])
    expect(result.pending).toEqual({
      'knot-tying': { seen: current, edits: { stock: 5 } },
    })
    expect(result.conflictedIds).toEqual(['knot-tying'])
  })

  it('drops an edit that the current row already holds', () => {
    // Catches a pending edit that equals the base and would show a pointless Changed label.
    const pending = setEdit({}, knot, 'stock', 5)
    expect(
      rebaseAfterConflict(pending, [{ ...knot, stock: 5 }], []).pending,
    ).toEqual({})
  })
})

describe('dropIds', () => {
  it('removes the named rows', () => {
    // Catches a deleted row that keeps its edits.
    const pending = setEdit({}, knot, 'stock', 5)
    expect(dropIds(pending, ['knot-tying'])).toEqual({})
  })
})
