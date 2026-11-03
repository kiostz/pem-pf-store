// Tests for the Item sheet (Edit and Add): the shown times, what Done hands back, the field errors, one request per Add, and who sees Delete.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react' // rendering and events
import { describe, expect, it, vi } from 'vitest' // test API
import { ItemSheet } from './ItemSheet.tsx' // the code under test
import { makeItem, meta, rows } from './item-fixtures.ts' // shared data

const knot = rows[2] // Knot Tying, built in
const shirt = rows[1] // Camp Shirt, Club-added

/**
 * Renders the sheet with spies for every callback.
 * @param props the props that differ from an Edit of Knot Tying
 * @return the spies
 */
function openSheet(props: Partial<React.ComponentProps<typeof ItemSheet>> = {}) {
  const spies = {
    onDone: vi.fn(),
    onAdd: vi.fn(() => Promise.resolve('added' as const)),
    onDelete: vi.fn(() => Promise.resolve({ kind: 'deleted' as const })),
    onClose: vi.fn(),
  } // the callbacks
  render(
    <ItemSheet
      mode="edit"
      honor={knot}
      categories={meta.categories}
      currency={meta.currency}
      defaultPriceCents={meta.defaultPriceCents}
      isNameTaken={() => false}
      {...spies}
      {...props}
    />,
  )
  return spies
}

describe('Edit sheet', () => {
  it('shows the fields, and Created and Last changed in Malaysia time', () => {
    // Catches UTC times on the sheet, or fields not filled from the row.
    openSheet({
      honor: makeItem({ ...knot, createdAt: '2026-11-01T00:00:00.000Z', modifiedAt: '2026-11-03T09:05:00.000Z' }),
    })
    expect(screen.getByRole('heading', { name: 'Edit item' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Knot Tying')
    expect(screen.getByLabelText('Category')).toHaveValue('Recreation')
    expect(screen.getByLabelText('Price (RM)')).toHaveValue('4.00')
    expect(screen.getByText('Created 1 Nov 2026, 8:00 am')).toBeInTheDocument()
    expect(screen.getByText('Last changed 3 Nov 2026, 5:05 pm')).toBeInTheDocument()
  })

  it('shows no admin email or editor, only the times', () => {
    // Catches an editor name or email appearing on the sheet.
    openSheet()
    expect(document.body.textContent).not.toMatch(/@|edited by|changed by/i)
  })

  it('hands the edited fields to Done and closes, and shows the pending value when reopened', () => {
    // Catches Done that loses an edit, or a reopened sheet that shows the stored value instead of the pending one.
    const spies = openSheet({ pending: { name: 'Knots' } })
    expect(screen.getByLabelText('Name')).toHaveValue('Knots')
    fireEvent.change(screen.getByLabelText('Price (RM)'), { target: { value: '5.5' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Nature' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(spies.onDone).toHaveBeenCalledWith({ name: 'Knots', category: 'Nature', priceCents: 550 })
    expect(spies.onClose).toHaveBeenCalled()
  })

  it('changes nothing when closed with Escape or the Close button', () => {
    // Catches an edit saved by a dismissal.
    const spies = openSheet()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Other' } })
    fireEvent(screen.getByRole('dialog'), new Event('close'))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(spies.onDone).not.toHaveBeenCalled()
    expect(spies.onClose).toHaveBeenCalled()
  })

  it('blocks an empty name, a long name, a duplicate name and a bad price, each with its line', () => {
    // Catches an invalid edit reaching the pending list, where the Worker would refuse the whole save.
    const spies = openSheet({ isNameTaken: (name: string) => name.toLowerCase() === 'knot tying 2' })
    const name = screen.getByLabelText('Name')
    fireEvent.change(name, { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Enter a name.')).toBeInTheDocument()
    fireEvent.change(name, { target: { value: 'x'.repeat(101) } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Names can be up to 100 characters.')).toBeInTheDocument()
    fireEvent.change(name, { target: { value: 'KNOT TYING 2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Another item is already called KNOT TYING 2.')).toBeInTheDocument()
    fireEvent.change(name, { target: { value: 'Knots' } })
    fireEvent.change(screen.getByLabelText('Price (RM)'), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Prices go up to 999.99.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Price (RM)'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Enter a price like 4.50.')).toBeInTheDocument()
    expect(spies.onDone).not.toHaveBeenCalled()
  })

  it('offers Delete item only for Club-added rows', () => {
    // Catches a Delete button on a built-in item, which the Worker refuses.
    openSheet()
    expect(screen.queryByRole('button', { name: 'Delete item' })).not.toBeInTheDocument()
  })

  it('opens the Delete dialog for a Club-added row, and deletes after a confirmation', async () => {
    // Catches a delete with no confirmation, or one that leaves the sheet open after it worked.
    const spies = openSheet({ honor: shirt })
    fireEvent.click(screen.getByRole('button', { name: 'Delete item' }))
    expect(screen.getByRole('heading', { name: 'Delete Camp Shirt?' })).toBeInTheDocument()
    expect(spies.onDelete).not.toHaveBeenCalled()
    const confirm = screen.getAllByRole('button', { name: 'Delete item' }).at(-1)!
    await act(async () => void fireEvent.click(confirm))
    expect(spies.onDelete).toHaveBeenCalledWith(shirt)
    expect(spies.onClose).toHaveBeenCalled()
  })
})

describe('Add sheet', () => {
  it('prefills the price with the default price from /api/meta and says new items start Hidden', () => {
    // Catches a price field that starts empty or at a hard-coded 4.00.
    openSheet({ mode: 'add', honor: undefined })
    expect(screen.getByRole('heading', { name: 'Add item' })).toBeInTheDocument()
    expect(screen.getByLabelText('Price (RM)')).toHaveValue('4.50')
    expect(screen.getByText('New items start Hidden with 0 in stock.')).toBeInTheDocument()
    expect(screen.queryByText(/^Created/)).not.toBeInTheDocument()
  })

  it('sends one request for a double click, then closes', async () => {
    // Catches a double click that adds the item twice.
    let finish: (kind: 'added') => void = () => undefined
    const onAdd = vi.fn(() => new Promise<'added'>((resolve) => (finish = resolve)))
    const spies = openSheet({ mode: 'add', honor: undefined, onAdd })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Camp Hat ' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Shirt' } })
    const add = screen.getByRole('button', { name: 'Add item' })
    fireEvent.click(add)
    fireEvent.click(add)
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith({ name: 'Camp Hat', category: 'Shirt', priceCents: 450 })
    await act(async () => finish('added'))
    expect(spies.onClose).toHaveBeenCalled()
  })

  it('asks for a category before adding', async () => {
    // Catches an Add with no category, which the Worker refuses.
    const spies = openSheet({ mode: 'add', honor: undefined })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Camp Hat' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    expect(screen.getByText('Choose a category.')).toBeInTheDocument()
    expect(spies.onAdd).not.toHaveBeenCalled()
  })

  it('shows the right line for name-taken, id-taken, signed-out and a failure, and stays open', async () => {
    // Catches two different refusals shown with one wrong sentence, or a sheet that closes on a failure.
    for (const [outcome, line] of [
      ['name-taken', 'Another item is already called Camp Hat.'],
      ['id-taken', "Couldn't add this item. Try a slightly different name."],
      ['signed-out', 'Your sign-in has ended. Open this page in a new tab to sign in, then try again.'],
      ['error', "We couldn't add the item. Try again."],
    ] as const) {
      const onAdd = vi.fn(() => Promise.resolve(outcome))
      const spies = openSheet({ mode: 'add', honor: undefined, onAdd })
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Camp Hat' } })
      fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Shirt' } })
      await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Add item' })))
      expect(screen.getByText(line)).toBeInTheDocument()
      expect(spies.onClose).not.toHaveBeenCalled()
      cleanup() // the next round renders afresh
    }
  })
})
