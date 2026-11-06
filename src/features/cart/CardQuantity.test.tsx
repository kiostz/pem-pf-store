// Tests for CardQuantity: Add at 0, the stepper from 1, and where focus goes when the control under it swaps.

import { fireEvent, render, screen, waitFor } from '@testing-library/react' // render, query and wait for the focus tick
import { describe, expect, it, vi } from 'vitest' // test API and mocks
import { useState } from 'react' // a tiny cart for the swap
import { CardQuantity } from './CardQuantity.tsx' // code under test

/**
 * Renders a CardQuantity for Knot Tying that keeps its own quantity, as the cart does.
 * @param start the quantity to start at
 * @return the change spy
 */
function setup(start: number) {
  const onChange = vi.fn() // records every committed quantity
  /** A host that holds the quantity so the control re-renders on a change. */
  function Host() {
    const [quantity, setQuantity] = useState(start) // the cart's quantity for this item
    return (
      <CardQuantity
        // the item name the stepper labels use
        itemName="Knot Tying"
        quantity={quantity}
        onChange={(next) => {
          onChange(next) // record
          setQuantity(next) // and apply
        }}
      />
    )
  }
  render(<Host />)
  return { onChange }
}

describe('CardQuantity', () => {
  it('shows Add and no stepper at 0', () => {
    // catches: a stepper on every card before anything is picked
    setup(0)
    expect(screen.getByRole('button', { name: 'Add Knot Tying' })).toHaveTextContent('Add')
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('turns Add into a stepper at 1 with focus on One more', async () => {
    // catches: focus dropped to the page when the Add button unmounts
    const { onChange } = setup(0)
    fireEvent.click(screen.getByRole('button', { name: 'Add Knot Tying' }))
    expect(onChange).toHaveBeenCalledWith(1)
    expect(screen.queryByRole('button', { name: 'Add Knot Tying' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Quantity of Knot Tying' })).toHaveValue('1')
    await waitFor(() => expect(screen.getByRole('button', { name: 'One more Knot Tying' })).toHaveFocus())
  })

  it('does not move focus when it mounts already holding a quantity', () => {
    // catches: a card that steals focus when a search shows it again
    setup(2)
    expect(document.body).toHaveFocus()
  })

  it('brings Add back with focus when minus takes 1 to 0', async () => {
    // catches: focus lost when the stepper unmounts under the buyer's thumb
    const { onChange } = setup(1)
    fireEvent.click(screen.getByRole('button', { name: 'One fewer Knot Tying' }))
    expect(onChange).toHaveBeenCalledWith(0)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Knot Tying' })).toHaveFocus())
  })

  it('brings Add back when 0 is typed and Enter pressed', async () => {
    // catches: a stepper stuck showing 0 after the buyer types it
    setup(3)
    const field = screen.getByRole('textbox', { name: 'Quantity of Knot Tying' })
    fireEvent.change(field, { target: { value: '0' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Knot Tying' })).toHaveFocus())
  })

  it('keeps the 99 limit', () => {
    // catches: the card letting a quantity pass 99
    setup(99)
    expect(screen.getByRole('button', { name: '99 is the most of Knot Tying' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('leaves focus where the buyer moved it when 0 is committed by tabbing away', async () => {
    // catches: Add pulling focus back from the control the buyer tabbed to
    render(
      <>
        <button type="button">Elsewhere</button>
        {/* the item name for the labels */}
        <CardQuantity itemName="Knot Tying" quantity={1} onChange={() => {}} />
      </>,
    )
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' })
    const field = screen.getByRole('textbox', { name: 'Quantity of Knot Tying' })
    field.focus() // the buyer is in the field
    fireEvent.change(field, { target: { value: '0' } })
    elsewhere.focus() // and tabs to another control, which commits through blur
    await new Promise((resolve) => setTimeout(resolve, 20)) // past the focus tick
    expect(elsewhere).toHaveFocus()
  })
})

describe('CardQuantity with a max or sold out', () => {
  it('stops + at the max and commits a typed number as the max', () => {
    // catches: a card that orders more than the stock
    const onChange = vi.fn() // records every committed quantity
    const { unmount } = render(<CardQuantity itemName="Knot Tying" quantity={3} max={3} onChange={onChange} />) // the item name for the labels
    expect(screen.getByRole('button', { name: '3 is the most of Knot Tying' })).toHaveAttribute('aria-disabled', 'true')
    unmount()
    render(<CardQuantity itemName="Knot Tying" quantity={1} max={3} onChange={onChange} />) // the item name for the labels
    const field = screen.getByRole('textbox', { name: 'Quantity of Knot Tying' })
    fireEvent.change(field, { target: { value: '50' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('keeps minus working above the max', () => {
    // catches: a card whose cart holds more than the stock now left and cannot be lowered
    const onChange = vi.fn() // records every committed quantity
    render(<CardQuantity itemName="Knot Tying" quantity={12} max={2} onChange={onChange} />) // the item name for the labels
    fireEvent.click(screen.getByRole('button', { name: 'One fewer Knot Tying' }))
    expect(onChange).toHaveBeenCalledWith(11)
  })

  it('shows Sold out in place of Add, with no control to focus, even when the cart holds some', () => {
    // catches: an Add on a Sold out card, or a stepper left for a cart item whose stock fell to 0
    const { rerender } = render(<CardQuantity itemName="Knot Tying" quantity={0} soldOut onChange={() => {}} />) // the item name for the labels
    expect(screen.getByText('Sold out')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(<CardQuantity itemName="Knot Tying" quantity={4} soldOut onChange={() => {}} />) // the item name for the labels
    expect(screen.getByText('Sold out')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
