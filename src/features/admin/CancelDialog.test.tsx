// Tests for the Cancel dialog: focus, the words, the tick box and its count, and one request.

import { fireEvent, render, screen } from '@testing-library/react' // rendering and events
import { describe, expect, it, vi } from 'vitest' // test API
import { CancelDialog } from './CancelDialog.tsx' // the code under test
import { makeOrder } from '@/test/order-fixtures.ts' // order builder

const order = makeOrder({ number: 'PF-20261105-ABCD' }) // 3 items, all in the shop

describe('CancelDialog', () => {
  it('puts focus on Keep order and says it cannot be undone', () => {
    // Catches focus landing on the destructive button, or a missing warning.
    render(<CancelDialog order={order} busy={false} error={null} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Cancel PF-20261105-ABCD?' })).toBeInTheDocument()
    expect(screen.getByText("It stays in the list as Cancelled. This can't be undone.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep order' })).toHaveFocus()
  })

  it('ticks the restock box by default and confirms with true, or false when unticked', () => {
    // Catches stock left out by default, or an unticked box that still restocks.
    const onConfirm = vi.fn()
    render(<CancelDialog order={order} busy={false} error={null} onConfirm={onConfirm} onCancel={vi.fn()} />)
    const box = screen.getByRole('checkbox', { name: 'Put 3 items back in stock' })
    expect(box).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
    expect(onConfirm).toHaveBeenLastCalledWith(true)
    fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
    expect(onConfirm).toHaveBeenLastCalledWith(false)
  })

  it('counts only the lines still in the shop and names the gone item', () => {
    // Catches a count that promises stock for a deleted item.
    const gone = makeOrder({
      number: 'PF-20261105-ABCD',
      lines: [
        { itemId: 'knot-tying', name: 'Knot Tying', quantity: 2, priceCents: 400, inShop: true },
        { itemId: 'camp-shirt', name: 'Camp Shirt', quantity: 1, priceCents: 400, inShop: false },
      ],
    })
    render(<CancelDialog order={gone} busy={false} error={null} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: 'Put 2 items back in stock' })).toBeInTheDocument()
    expect(screen.getByText("Camp Shirt is no longer in the shop, so it can't go back.")).toBeInTheDocument()
  })

  it('has no box when nothing can go back, and confirms with false', () => {
    // Catches an empty "Put 0 items back" box.
    const none = makeOrder({
      number: 'PF-20261105-ABCD',
      lines: [{ itemId: 'camp-shirt', name: 'Camp Shirt', quantity: 1, priceCents: 400, inShop: false }],
    })
    const onConfirm = vi.fn()
    render(<CancelDialog order={none} busy={false} error={null} onConfirm={onConfirm} onCancel={vi.fn()} />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
    expect(onConfirm).toHaveBeenCalledWith(false)
  })

  it('sends once for a double click, and shows a failure line', () => {
    // Catches two cancels from one double click.
    const onConfirm = vi.fn()
    const { rerender } = render(
      <CancelDialog order={order} busy={false} error={null} onConfirm={onConfirm} onCancel={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
    rerender(<CancelDialog order={order} busy error={null} onConfirm={onConfirm} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelling…' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    rerender(<CancelDialog order={order} busy={false} error="The order wasn't cancelled." onConfirm={onConfirm} onCancel={vi.fn()} />)
    expect(screen.getByText("The order wasn't cancelled.")).toBeInTheDocument()
  })

  it('does nothing but close on Escape', () => {
    // Catches Escape that cancels the order.
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<CancelDialog order={order} busy={false} error={null} onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent(document.querySelector('dialog') as HTMLDialogElement, new Event('close'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('ignores Escape, Keep order and the backdrop while the cancel is running', () => {
    // Catches a dialog that closes mid-request and hides the outcome.
    const onCancel = vi.fn()
    render(<CancelDialog order={order} busy error={null} onConfirm={vi.fn()} onCancel={onCancel} />)
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    const escape = new Event('cancel', { cancelable: true })
    fireEvent(dialog, escape)
    expect(escape.defaultPrevented).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Keep order' }))
    fireEvent.click(dialog)
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Keep order' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('stays open when a second Escape closes it while the cancel is running', () => {
    // Catches Chrome's second Escape (no cancel event) closing the dialog and hiding a failed cancel.
    const onCancel = vi.fn()
    render(<CancelDialog order={order} busy error={null} onConfirm={vi.fn()} onCancel={onCancel} />)
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    fireEvent(dialog, new Event('cancel', { cancelable: true })) // first Escape: prevented
    dialog.close() // second Escape: the browser closes it without a cancel event
    fireEvent(dialog, new Event('close')) // the close event the browser fires
    expect(onCancel).not.toHaveBeenCalled()
    expect(dialog.open).toBe(true)
  })

  it('puts focus back on Keep order when the busy dialog is reopened, so Space cannot untick restock', () => {
    // Catches focus falling to the restock box after a mid-request reopen.
    render(<CancelDialog order={order} busy error={null} onConfirm={vi.fn()} onCancel={vi.fn()} />) // busy, with items to restock
    const dialog = document.querySelector('dialog') as HTMLDialogElement // the element
    const box = screen.getByRole('checkbox') // the restock box
    box.focus() // focus has wandered off Keep order
    dialog.close() // the browser closes it
    fireEvent(dialog, new Event('close')) // the close event
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep order' })) // focus is on the safe action
    expect((box as HTMLInputElement).checked).toBe(true) // still ticked
  })
})
