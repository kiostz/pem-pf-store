// Tests for the Remove dialog: where focus lands, the words, one request, and the failure line.

import { fireEvent, render, screen } from '@testing-library/react' // rendering and events
import { describe, expect, it, vi } from 'vitest' // test API
import { makeClub } from '@/test/club-fixtures.ts' // shared clubs
import { RemoveClubDialog } from './RemoveClubDialog.tsx' // the code under test

const phoenix = makeClub({ id: 4, name: 'Phoenix Club' }) // the club asked about

describe('RemoveClubDialog', () => {
  it('names the club, says past orders keep its name, and puts focus on Keep club', () => {
    // Catches focus landing on the destructive button, where Enter would remove.
    render(<RemoveClubDialog club={phoenix} busy={false} error={null} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Remove Phoenix Club?' })).toBeInTheDocument()
    expect(screen.getByText("Buyers can't pick it any more. Past orders keep its name.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep club' })).toHaveFocus()
  })

  it('calls onConfirm once for a double click, and onCancel for Keep club and Escape', () => {
    // Catches a double click that sends two removals.
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const { rerender } = render(<RemoveClubDialog club={phoenix} busy={false} error={null} onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Keep club' }))
    fireEvent(screen.getByRole('dialog'), new Event('close'))
    expect(onCancel).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Remove club' }))
    rerender(<RemoveClubDialog club={phoenix} busy error={null} onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Removing…' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('shows the failure line', () => {
    // Catches a refused removal that closes with no word.
    render(<RemoveClubDialog club={phoenix} busy={false} error="The club wasn't saved." onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent("The club wasn't saved.")
  })

  it('ignores Keep club, the backdrop and Escape while the remove runs', () => {
    // Catches a dialog that closes mid-remove, so a failure that follows has nowhere to show.
    const onCancel = vi.fn()
    render(<RemoveClubDialog club={phoenix} busy error={null} onConfirm={vi.fn()} onCancel={onCancel} />)
    const dialog = screen.getByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Keep club' }))
    fireEvent.click(dialog)
    const cancel = new Event('cancel', { cancelable: true }) // Escape
    fireEvent(dialog, cancel)
    fireEvent(dialog, new Event('close'))
    expect(cancel.defaultPrevented).toBe(true)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('opens again when the dialog is really closed while the remove runs', () => {
    // Catches a double Escape (which a browser closes without a cancel event) leaving the dialog shut with a remove still running.
    const onCancel = vi.fn()
    render(<RemoveClubDialog club={phoenix} busy error={null} onConfirm={vi.fn()} onCancel={onCancel} />)
    const dialog = screen.getByRole('dialog') as HTMLDialogElement
    dialog.close() // the browser's own close, which fires `close`
    expect(dialog.open).toBe(true) // modal again
    expect(onCancel).not.toHaveBeenCalled()
  })
})
