// Tests for the Club sheet: field cleaning and checks, the lines for a taken name, a conflict and a signed-out session, and the focus rules.

import { fireEvent, render, screen } from '@testing-library/react' // rendering and events
import { describe, expect, it, vi } from 'vitest' // test API
import { SIGNED_OUT_NOTE } from './admin-api.ts' // the 403 line
import { makeClub } from '@/test/club-fixtures.ts' // shared clubs
import { ClubSheet, type ClubSheetOutcome } from './ClubSheet.tsx' // the code under test

const phoenix = makeClub({ id: 4, name: 'Phoenix Club', area: 'Klang', churchName: 'Phoenix SDA Church' }) // a club with details

/**
 * Renders an Add sheet.
 * @param outcome what the last write ended in
 * @return the three callbacks
 */
function renderAdd(outcome: ClubSheetOutcome = null) {
  const handlers = { onSave: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() } // the spies
  render(<ClubSheet mode="add" busy={false} outcome={outcome} {...handlers} />)
  return handlers
}

describe('ClubSheet', () => {
  it('trims every field and sends a blank optional field as null', async () => {
    // Catches padded text or an empty string reaching the Worker, which refuses both.
    const { onSave } = renderAdd()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Lions  ' } })
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: ' Klang ' } })
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add club' }))
    expect(onSave).toHaveBeenCalledWith({ name: 'Lions', area: 'Klang', language: null, location: null, churchName: null })
  })

  it('titles Add and Edit, marks the four details Optional and shows the hint under Name', () => {
    // Catches a sheet whose fields or hint differ from the screen text.
    render(<ClubSheet mode="edit" club={phoenix} busy={false} outcome={null} onSave={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Edit club' })).toBeInTheDocument()
    expect(screen.getAllByText('Optional')).toHaveLength(4)
    expect(screen.getByText('Buyers see this in the club list. Past orders keep the name they were sent with.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Phoenix Club')
    expect(screen.getByLabelText('Church name')).toHaveValue('Phoenix SDA Church')
    expect(screen.getByRole('button', { name: 'Remove club' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('requires a name of at most 100 characters and sends nothing otherwise', () => {
    // Catches an empty or 101-unit name leaving the sheet, which the Worker would refuse.
    const { onSave } = renderAdd()
    fireEvent.click(screen.getByRole('button', { name: 'Add club' }))
    expect(screen.getByText('Enter a club name, up to 100 characters.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'a'.repeat(101) } })
    fireEvent.click(screen.getByRole('button', { name: 'Add club' }))
    expect(screen.getByText('Enter a club name, up to 100 characters.')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'a'.repeat(100) } })
    fireEvent.click(screen.getByRole('button', { name: 'Add club' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('counts an emoji as two units like the Worker does', () => {
    // Catches a 51-emoji name passing here and failing at the Worker.
    const { onSave } = renderAdd()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '😀'.repeat(51) } })
    fireEvent.click(screen.getByRole('button', { name: 'Add club' }))
    expect(screen.getByText('Enter a club name, up to 100 characters.')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('refuses "Other" in any case with the reserved line', () => {
    // Catches a club called Other, which the shop keeps for typed clubs.
    const { onSave } = renderAdd()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' oTHer ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add club' }))
    expect(screen.getByText('“Other” is kept for clubs that aren\'t listed.')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('refuses a detail over 100 characters and a tab or line break in any field', () => {
    // Catches text the Worker would refuse reaching it.
    const { onSave } = renderAdd()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lions' } })
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'a'.repeat(101) } })
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Kl\tang' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add club' }))
    expect(screen.getByText('Up to 100 characters.')).toBeInTheDocument()
    expect(screen.getByText('Remove tabs and line breaks.')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('announces the taken-name line for the typed name and keeps the typing', () => {
    // Catches a refused name that clears the form, or a taken-name line a screen reader never hears.
    const handlers = { onSave: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() }
    const { rerender } = render(<ClubSheet mode="add" busy={false} outcome={null} {...handlers} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lions' } }) // typed first
    rerender(<ClubSheet mode="add" busy={false} outcome={{ kind: 'name-taken' }} {...handlers} />) // then the answer arrives
    expect(screen.getByRole('alert')).toHaveTextContent('Another club is already called Lions.')
    expect(screen.getByLabelText('Name')).toHaveValue('Lions')
  })

  it('hides the taken-name line once Name changes, so the alert is not read again on each key', () => {
    // Catches a taken-name alert whose text follows the typing, re-announced on every key and wrongly claiming the new text is taken.
    const handlers = { onSave: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() }
    const { rerender } = render(<ClubSheet mode="add" busy={false} outcome={null} {...handlers} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lions' } }) // typed first
    rerender(<ClubSheet mode="add" busy={false} outcome={{ kind: 'name-taken' }} {...handlers} />) // then the answer arrives
    expect(screen.getByRole('alert')).toHaveTextContent('Another club is already called Lions.')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lions 2' } }) // the admin edits the name
    expect(screen.queryByRole('alert')).not.toBeInTheDocument() // no alert re-reads on the key
    expect(screen.queryByText(/already called/)).not.toBeInTheDocument() // and none claims the new text is taken
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'false')
  })

  it('shows the latest values on an edit conflict', () => {
    // Catches a conflict line that hides what changed, or a name field still on the stale copy.
    const handlers = { onSave: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() }
    const { rerender } = render(<ClubSheet mode="edit" club={phoenix} busy={false} outcome={null} {...handlers} />)
    const latest = makeClub({ id: 4, name: 'Phoenix Club B', area: 'Klang' })
    rerender(<ClubSheet mode="edit" club={latest} busy={false} outcome={{ kind: 'conflict', latest }} {...handlers} />)
    expect(screen.getByText('This club has been updated. Latest: Phoenix Club B · Klang.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Phoenix Club B')
  })

  it('says the club was removed in another tab when the conflict has no club', () => {
    // Catches an edit of a gone club that shows a blank "Latest:".
    render(
      <ClubSheet mode="edit" club={phoenix} busy={false} outcome={{ kind: 'conflict', latest: null }} onSave={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByText('This club was removed in another tab.')).toBeInTheDocument()
  })

  it('shows the signed-out line and keeps the typing', () => {
    // Catches an ended session that loses what the admin typed.
    const handlers = { onSave: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() }
    const { rerender } = render(<ClubSheet mode="add" busy={false} outcome={null} {...handlers} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lions' } }) // typed first
    rerender(<ClubSheet mode="add" busy={false} outcome={{ kind: 'signed-out' }} {...handlers} />) // then the answer arrives
    expect(screen.getByText(SIGNED_OUT_NOTE)).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Lions')
  })

  it('on a conflict keeps the typed fields and takes the latest value for the fields left alone', () => {
    // Catches a second Save that sends the stale copy of a field the admin never touched, undoing another tab's change.
    const handlers = { onSave: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() }
    const { rerender } = render(<ClubSheet mode="edit" club={phoenix} busy={false} outcome={null} {...handlers} />)
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'Subang' } }) // the admin's own change
    const latest = makeClub({ id: 4, name: 'Phoenix Club B', area: 'Klang', churchName: 'Phoenix SDA Church' }) // another tab renamed it
    rerender(<ClubSheet mode="edit" club={latest} busy={false} outcome={{ kind: 'conflict', latest }} {...handlers} />)
    expect(screen.getByLabelText('Name')).toHaveValue('Phoenix Club B')
    expect(screen.getByLabelText('Area')).toHaveValue('Subang')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(handlers.onSave).toHaveBeenCalledWith({ name: 'Phoenix Club B', area: 'Subang', language: null, location: null, churchName: 'Phoenix SDA Church' })
  })

  it('on two conflicts in a row takes the second latest for fields left alone and keeps the typed one', () => {
    // Catches a rebase that is not moved after a conflict, so the next conflict keeps the first rename and a Save undoes another tab's second rename.
    const handlers = { onSave: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() }
    const { rerender } = render(<ClubSheet mode="edit" club={phoenix} busy={false} outcome={null} {...handlers} />)
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'Subang' } }) // the admin's own change
    const first = makeClub({ id: 4, name: 'Phoenix Club B', area: 'Klang', churchName: 'Phoenix SDA Church' }) // another tab's first rename
    rerender(<ClubSheet mode="edit" club={first} busy={false} outcome={{ kind: 'conflict', latest: first }} {...handlers} />)
    expect(screen.getByLabelText('Name')).toHaveValue('Phoenix Club B')
    const second = makeClub({ id: 4, name: 'Phoenix Club C', area: 'Klang', churchName: 'Phoenix SDA Church' }) // its second rename
    rerender(<ClubSheet mode="edit" club={second} busy={false} outcome={{ kind: 'conflict', latest: second }} {...handlers} />)
    expect(screen.getByLabelText('Name')).toHaveValue('Phoenix Club C')
    expect(screen.getByLabelText('Area')).toHaveValue('Subang')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(handlers.onSave).toHaveBeenCalledWith({ name: 'Phoenix Club C', area: 'Subang', language: null, location: null, churchName: 'Phoenix SDA Church' })
  })

  it('opens again when the dialog is really closed while a write runs', () => {
    // Catches a double Escape (which a browser closes without a cancel event) leaving the sheet shut with a save still running.
    const handlers = { onSave: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() }
    render(<ClubSheet mode="add" busy outcome={null} {...handlers} />)
    const dialog = screen.getByRole('dialog') as HTMLDialogElement
    dialog.close() // the browser's own close, which fires `close`
    expect(dialog.open).toBe(true) // modal again
    expect(handlers.onClose).not.toHaveBeenCalled()
  })

  it('ignores Cancel, Close, the backdrop and Escape while a write runs', () => {
    // Catches a sheet that closes mid-save, so a failure that follows has nowhere to show.
    const handlers = { onSave: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() }
    render(<ClubSheet mode="add" busy outcome={null} {...handlers} />)
    const dialog = screen.getByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(dialog)
    const cancel = new Event('cancel', { cancelable: true }) // Escape
    fireEvent(dialog, cancel)
    fireEvent(dialog, new Event('close'))
    expect(cancel.defaultPrevented).toBe(true)
    expect(handlers.onClose).not.toHaveBeenCalled()
  })

  it('shows the failure line for an error', () => {
    // Catches a failed save with no word.
    renderAdd({ kind: 'error' })
    expect(screen.getByText("The club wasn't saved.")).toBeInTheDocument()
  })

  it('closes without saving when an edit changed nothing', () => {
    // Catches a Save with no change that sends a request the Worker refuses (from equals to).
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(<ClubSheet mode="edit" club={phoenix} busy={false} outcome={null} onSave={onSave} onRemove={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose for Cancel and for Escape', () => {
    // Catches an Escape that leaves the parent thinking the sheet is open.
    const { onClose } = renderAdd()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent(screen.getByRole('dialog'), new Event('close'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('opens modal and returns focus to the opener when it goes', () => {
    // Catches focus lost to the page after the sheet closes.
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    const { unmount } = render(<ClubSheet mode="add" busy={false} outcome={null} onSave={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />)
    expect(showModal).toHaveBeenCalledTimes(1)
    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
    showModal.mockRestore()
  })

  it('opens the Remove dialog from Remove club and sends onRemove only from the dialog', () => {
    // Catches a Remove club in the sheet that removes without asking.
    const onRemove = vi.fn()
    render(<ClubSheet mode="edit" club={phoenix} busy={false} outcome={null} onSave={vi.fn()} onRemove={onRemove} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove club' }))
    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Remove Phoenix Club?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep club' })).toHaveFocus()
  })
})
