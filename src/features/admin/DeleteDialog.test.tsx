// Tests for the Delete dialog: where focus lands, the words, one request, and the failure line.

import { fireEvent, render, screen } from '@testing-library/react' // rendering and events
import { describe, expect, it, vi } from 'vitest' // test API
import { DeleteDialog } from './DeleteDialog.tsx' // the code under test

describe('DeleteDialog', () => {
  it('names the item, explains what stays, and puts focus on Keep item', () => {
    // Catches focus landing on the destructive button, where Enter would delete.
    render(<DeleteDialog name="Camp Shirt" busy={false} error={null} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Delete Camp Shirt?' })).toBeInTheDocument()
    expect(
      screen.getByText(
        "Buyers can't order it any more, and this can't be undone. Past orders keep its name and price.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep item' })).toHaveFocus()
  })

  it('calls onConfirm once for a double click, and onCancel for Keep item', () => {
    // Catches a double click that sends two deletes.
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const { rerender } = render(
      <DeleteDialog name="Camp Shirt" busy={false} error={null} onConfirm={onConfirm} onCancel={onCancel} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Keep item' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    const confirm = screen.getByRole('button', { name: 'Delete item' })
    fireEvent.click(confirm)
    rerender(<DeleteDialog name="Camp Shirt" busy error={null} onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Deleting…' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('shows the failure line, such as the one for a 409', () => {
    // Catches a refused delete that closes with no word.
    render(
      <DeleteDialog
        name="Camp Shirt"
        busy={false}
        error="This item has been updated. Check it, then try again."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('This item has been updated. Check it, then try again.')).toBeInTheDocument()
  })

  it('cancels when the dialog is dismissed with Escape', () => {
    // Catches an Escape that leaves the parent thinking the dialog is still open.
    const onCancel = vi.fn()
    render(<DeleteDialog name="Camp Shirt" busy={false} error={null} onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent(screen.getByRole('dialog'), new Event('close'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
