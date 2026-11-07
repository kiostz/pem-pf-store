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
  staleRows, // the function under test
  toItemChanges,
  type PendingChanges,
} from './pending-changes.ts' // the code under test
import { makeItem } from '@/test/item-fixtures.ts' // row builder

const knot = makeItem({
  id: 'knot-tying',
  name: 'Knot Tying',
  subcategoryId: 8, // Recreation's id
  subcategory: 'Recreation', // Recreation's name
  stock: 12,
}) // a row as seen in Honors · Recreation

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
    pending = setEdit(pending, knot, 'category', 'Accessories') // a category with no subcategories
    pending = setEdit(pending, knot, 'priceCents', 550)
    expect(pending['knot-tying'].edits).toEqual({
      name: 'Knots',
      category: 'Accessories', // the edited category
      priceCents: 550,
    })
    expect(countChanges(pending)).toBe(3)
  })
})

describe('setEdit on the subcategory', () => { // the subcategory field of the pending edits
  it('counts one change, and none once it is set back', () => { // the subcategory is its own field
    // catches: a subcategory edit that is not counted, or one that lingers after it is set back.
    const edited = setEdit({}, knot, 'subcategoryId', 5) // Recreation to Nature
    expect(edited['knot-tying'].edits).toEqual({ subcategoryId: 5 }) // recorded
    expect(countChanges(edited)).toBe(1) // one change
    expect(setEdit(edited, knot, 'subcategoryId', 8)).toEqual({}) // back to the seen value: gone
  })
})

describe('toItemChanges', () => {
  it('sends the subcategory pair from the snapshot, and a clear as to null', () => { // the guard on the subcategory
    // catches: a subcategory sent without its `from`, or a clear sent as a missing key.
    expect(toItemChanges(setEdit({}, knot, 'subcategoryId', 5))).toEqual([ // a pick of Nature
      { id: 'knot-tying', subcategoryId: { from: 8, to: 5 } }, // the pair: Recreation to Nature
    ]) // a pick
    expect(toItemChanges(setEdit({}, knot, 'subcategoryId', null))).toEqual([ // a clear
      { id: 'knot-tying', subcategoryId: { from: 8, to: null } }, // the pair: Recreation to None
    ]) // a clear
  })

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

  it('takes subcategoryId and subcategory from the answer when the subcategory was edited, and neither when it was not', () => { // the name follows the id
    // catches: a saved row that shows the old subcategory name, or one that takes a subcategory nobody edited.
    const answer = { ...knot, subcategoryId: 5, subcategory: 'Nature', priceCents: 550, modifiedAt: '2026-11-03T05:00:00.000Z' } // the Worker's answer
    expect(mergeSaved(setEdit({}, knot, 'subcategoryId', 5), [answer])).toEqual([ // a subcategory edit folds
      { ...knot, subcategoryId: 5, subcategory: 'Nature', modifiedAt: '2026-11-03T05:00:00.000Z' }, // the id and name taken, the time new
    ]) // both taken, price left as seen
    expect(mergeSaved(setEdit({}, knot, 'priceCents', 550), [answer])).toEqual([ // a price edit folds
      { ...knot, priceCents: 550, modifiedAt: '2026-11-03T05:00:00.000Z' }, // no subcategory taken
    ]) // neither taken
  })

  it('takes subcategoryId and subcategory from the answer when only the category was edited, so a clear by the Worker raises no stale flag', () => { // the Worker clears a misfit subcategory
    // catches: a saved row that keeps "Nature" under Shirts and flags "This item has been updated." for a save that did what was asked.
    const seenWithNature = { ...knot, subcategoryId: 5, subcategory: 'Nature' } // the admin saw Honors · Nature
    const answer = { ...seenWithNature, category: 'Shirts', subcategoryId: null, subcategory: null, modifiedAt: '2026-11-03T05:00:00.000Z' } // the Worker cleared it
    const sent = setEdit({}, seenWithNature, 'category', 'Shirts') // only the category was edited
    const shown = mergeSaved(sent, [answer]) // the folded row
    expect(shown).toEqual([answer]) // category, subcategory id and name all from the answer
    expect(staleRows(shown, [answer])).toEqual([]) // nothing out of date
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

  it('flags a row whose subcategoryId moved under a pending subcategory edit, and drops an edit the fetched row already holds', () => { // the subcategory rebases like any field
    // catches: a subcategory that moved under an edit with no flag, or an edit kept after the row holds it.
    const pending = setEdit({}, knot, 'subcategoryId', 5) // Recreation to Nature
    const moved = { ...knot, subcategoryId: 2, subcategory: 'Arts and Crafts' } // another admin picked Arts and Crafts
    const result = rebaseOnFetch(pending, [moved]) // the rebase with the moved row
    expect(result.flagged).toEqual([moved]) // flagged
    expect(result.pending['knot-tying'].edits).toEqual({ subcategoryId: 5 }) // the edit stays
    const held = { ...knot, subcategoryId: 5, subcategory: 'Nature' } // the row already holds Nature
    expect(rebaseOnFetch(pending, [held]).pending).toEqual({}) // the edit is gone
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

describe('staleRows', () => { // rows whose answer differs from the folded row
  it('reports a row whose answered subcategoryId differs from the folded row', () => { // the subcategory is compared
    // catches: a save that shows a subcategory another admin changed meanwhile as if it were current.
    const answered = { ...knot, subcategoryId: 2, subcategory: 'Arts and Crafts' } // what the Worker holds
    expect(staleRows([knot], [answered])).toEqual([answered]) // reported
    expect(staleRows([knot], [knot])).toEqual([]) // equal rows are not
  })
})
