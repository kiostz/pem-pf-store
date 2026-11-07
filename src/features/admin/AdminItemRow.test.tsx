// Tests for one admin Items row on its own: picture, plain name, details line, stock text, Edit button, Status control, Changed label and the conflict note.

import { cleanup, fireEvent, render, screen } from '@testing-library/react' // rendering, events and unmounting
import { afterEach, describe, expect, it, vi } from 'vitest' // test API
import { AdminItemRow } from './AdminItemRow.tsx' // the code under test
import { makeItem } from '@/test/item-fixtures.ts' // a full row

const knot = makeItem({ id: 'knot-tying', name: 'Knot Tying', category: 'Honors', stock: 12 }) // a Honors item with 12 in stock
const now = new Date('2026-11-03T04:00:00.000Z') // 3 Nov 2026 in Malaysia

/**
 * Renders the row inside a list, with spies for the callbacks.
 * @param props the props that differ from Knot Tying with nothing pending
 * @return the spies and the rendered container
 */
function renderRow(props: Partial<React.ComponentProps<typeof AdminItemRow>> = {}) { // a row with overridable props
  const spies = { onEdit: vi.fn(), onStatus: vi.fn() } // the callbacks
  const view = render( // draw it
    <ul>
      {/* no subcategory unless a test passes one */}
      <AdminItemRow item={knot} currency="MYR" now={now} subcategory={null} {...spies} {...props} />
    </ul>,
  ) // the row in a list, like the screen draws it
  return { ...spies, container: view.container } // the spies and the container
}

afterEach(cleanup) // no row leaks into the next test

describe('AdminItemRow', () => { // the row on its own
  it('shows the picture at 44 px', () => {
    // the lead picture
    // catches: a row with no lead picture, or one drawn at the old 56 px
    const { container } = renderRow({ item: { ...knot, image: 'items/knot-tying.webp' } }) // an item with a picture
    expect(container.querySelector('img')).toHaveAttribute('src', '/pictures/items/knot-tying.webp') // from the Admin Worker's own origin
    expect(container.querySelector('img')).toHaveClass('size-11') // 44 px
    expect(screen.queryByTestId('category-mark')).not.toBeInTheDocument() // no mark when there is a picture
  })

  it('shows the small Category mark when the picture is null', () => {
    // the fallback lead
    // catches: no lead for a picture-less item
    renderRow() // Knot Tying has no picture here
    expect(screen.getByTestId('category-mark')).toHaveClass('size-11') // 44 px mark
  })

  it('draws the Category mark of the pending category, so the picture and the details line agree', () => {
    // the mark follows the unsaved category
    // catches: a row whose mark says Honors while its details line already says Shirts
    renderRow({ pending: { category: 'Shirts' } }) // Knot Tying edited to Shirts, not saved
    expect(screen.getByTestId('category-mark')).toHaveStyle({ backgroundColor: '#c3b091' }) // khaki, the Shirts colour, not Honors green
    expect(screen.getByText('Shirts · RM 4.00 · changed 3 Nov')).toBeInTheDocument() // the line says Shirts too
  })

  it('shows the name as plain text, not a button or a link', () => {
    // the name is not a control
    // catches: the name still being a second way into the sheet
    renderRow() // the row
    expect(screen.getByText('Knot Tying')).toBeInTheDocument() // the name is shown
    expect(screen.queryByRole('button', { name: 'Knot Tying' })).toBeNull() // not a button
    expect(screen.queryByRole('link', { name: 'Knot Tying' })).toBeNull() // not a link
  })

  it('reads the details line as Category, price and changed date', () => {
    // the facts line
    // catches: a changed order or a missing part of the line
    renderRow() // the row
    expect(screen.getByText('Honors · RM 4.00 · changed 3 Nov')).toBeInTheDocument() // the exact line
  })

  it('adds the subcategory after the category when there is one, and nothing when there is none', () => { // the subcategory part of the details line
    // the subcategory in the facts line
    // catches: a missing subcategory part, or a stray separator when the item has none
    renderRow({ subcategory: 'Recreation' }) // Honors · Recreation
    expect(screen.getByText('Honors · Recreation · RM 4.00 · changed 3 Nov')).toBeInTheDocument() // the subcategory sits between category and price
    cleanup() // next render
    renderRow({ item: { ...knot, category: 'Shirts' }, subcategory: null }) // a Shirts item
    expect(screen.getByText('Shirts · RM 4.00 · changed 3 Nov')).toBeInTheDocument() // no subcategory part, no doubled dot
  })

  it('shows the stock as text, "0 in stock" at zero, and the pending stock when edited', () => {
    // the stock text
    // catches: a stock number that disagrees with the pending edit, or a bare number with no unit
    renderRow() // stock 12
    expect(screen.getByText('12 in stock')).toBeInTheDocument() // the stored stock
    cleanup() // next render
    renderRow({ item: { ...knot, stock: 0 } }) // stock 0
    expect(screen.getByText('0 in stock')).toBeInTheDocument() // zero reads the same way
    cleanup() // next render
    renderRow({ pending: { stock: 5 } }) // an unsaved stock of 5
    expect(screen.getByText('5 in stock')).toBeInTheDocument() // the pending stock wins
  })

  it('has no Stock stepper on the row', () => {
    // stock is edited in the sheet only
    // catches: the stepper surviving on the row
    renderRow() // the row
    expect(screen.queryByRole('group', { name: /Stock of/ })).toBeNull() // no stepper group
    expect(screen.queryByRole('textbox', { name: /Stock of/ })).toBeNull() // no number field
  })

  it('has one Edit button named for the shown name, which calls onEdit once', () => {
    // the pencil
    // catches: an unnamed icon button, or a label that ignores a pending rename
    const spies = renderRow({ pending: { name: 'Knots' } }) // a pending rename
    expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(1) // one pencil
    fireEvent.click(screen.getByRole('button', { name: 'Edit Knots' })) // press the pencil, named for the pending rename
    expect(spies.onEdit).toHaveBeenCalledTimes(1) // opens the sheet once
  })

  it('names the Edit button after the stored name when nothing is pending', () => {
    // the label without an edit
    // catches: a missing accessible name on the pencil
    renderRow() // the row
    expect(screen.getByRole('button', { name: 'Edit Knot Tying' })).toBeInTheDocument() // named for the item
  })

  it('gives the Edit button a 44 px target, and the Status control still reports onStatus', () => {
    // targets and the switch
    // catches: a pencil too small to tap, or a Status control the new layout cut off
    const spies = renderRow() // the row
    expect(screen.getByRole('button', { name: 'Edit Knot Tying' })).toHaveClass('size-11') // 44 px
    fireEvent.click(screen.getByRole('switch', { name: 'Active: Knot Tying' })) // flip the switch
    expect(spies.onStatus).toHaveBeenCalledWith('hidden') // reports the other status
  })

  it('shows the conflict note with the Latest line, and the Changed label for a pending edit', () => {
    // flags survive
    // catches: a conflict or pending state lost in the new layout
    renderRow({ pending: { stock: 5 }, conflict: { ...knot, stock: 9 } }) // a flagged, edited row
    expect(screen.getByText('This item has been updated.')).toBeInTheDocument() // the note
    expect(screen.getByText('Latest: Knot Tying · Honors · Nature · RM 4.00 · Active · 9 in stock')).toBeInTheDocument() // the current values
    expect(screen.getByText('Changed')).toBeInTheDocument() // the pending label
  })
})
