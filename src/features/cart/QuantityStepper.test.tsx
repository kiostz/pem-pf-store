// Tests for the quantity stepper: buttons, the typed field, limits and labels, through the rendered component.

import { fireEvent, render, screen } from '@testing-library/react' // render and query
import { describe, expect, it, vi } from 'vitest' // test API and mocks
import { QuantityStepper } from './QuantityStepper.tsx' // code under test

/**
 * Renders a stepper for Knot Tying.
 * @param quantity the quantity shown
 * @return the change spy and the three controls
 */
function setup(quantity: number) {
  const onChange = vi.fn() // records every committed quantity
  render(<QuantityStepper honorName="Knot Tying" quantity={quantity} onChange={onChange} />)
  return {
    onChange,
    field: screen.getByRole('textbox', { name: 'Quantity of Knot Tying' }),
    fewer: screen.getByRole('button', { name: 'One fewer Knot Tying' }),
    more: screen.queryByRole('button', { name: 'One more Knot Tying' }),
  } // more is null at 99, where its label changes
}

describe('QuantityStepper', () => {
  it('names the group, the field and the buttons after the honor', () => {
    // catches: unlabelled controls a screen reader cannot tell apart row by row
    const { field, fewer, more } = setup(3)
    expect(screen.getByRole('group', { name: 'Quantity of Knot Tying' })).toBeInTheDocument()
    expect(field).toHaveValue('3')
    expect(fewer).toBeInTheDocument()
    expect(more).toBeInTheDocument()
  })

  it('adds one with + from 0', () => {
    // catches: + that does nothing from an empty cart line
    const { onChange, more } = setup(0)
    fireEvent.click(more!)
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('takes one away with minus', () => {
    // catches: minus wired to plus
    const { onChange, fewer } = setup(5)
    fireEvent.click(fewer)
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('does nothing and keeps focus on minus at 0, which is aria-disabled and not disabled', () => {
    // catches: a disabled button that drops focus, or minus going below 0
    const { onChange, fewer } = setup(0)
    fewer.focus()
    fireEvent.click(fewer)
    expect(onChange).not.toHaveBeenCalled()
    expect(fewer).toHaveAttribute('aria-disabled', 'true')
    expect(fewer).not.toBeDisabled()
    expect(fewer).toHaveFocus()
  })

  it('does nothing at 99 and says 99 is the most', () => {
    // catches: 100 reachable by +, or a silent dead button
    const { onChange } = setup(99)
    const more = screen.getByRole('button', { name: /99 is the most/ })
    fireEvent.click(more)
    expect(onChange).not.toHaveBeenCalled()
    expect(more).toHaveAttribute('aria-disabled', 'true')
    expect(more).not.toBeDisabled()
  })

  it('commits a typed 24 on Enter', () => {
    // catches: typed numbers ignored
    const { onChange, field } = setup(0)
    fireEvent.change(field, { target: { value: '24' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(24)
  })

  it('turns a typed 150 into 99', () => {
    // catches: a quantity over the limit committed
    const { onChange, field } = setup(0)
    fireEvent.change(field, { target: { value: '150' } })
    fireEvent.blur(field)
    expect(onChange).toHaveBeenCalledWith(99)
  })

  it('commits 0 when the field is cleared and left', () => {
    // catches: an empty field leaving the old quantity in place
    const { onChange, field } = setup(7)
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.blur(field)
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('calls nothing while the field is cleared and not yet left', () => {
    // catches: clearing the field to retype removing the line at once
    const { onChange, field } = setup(7)
    fireEvent.change(field, { target: { value: '' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores letters', () => {
    // catches: "abc" or "2x" reaching the cart
    const { onChange, field } = setup(0)
    fireEvent.change(field, { target: { value: 'ab' } })
    expect(field).toHaveValue('')
    fireEvent.change(field, { target: { value: '2x' } })
    fireEvent.blur(field)
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('with trashAtOne the first control at 1 is a Remove button that calls onChange(0)', () => {
    // catches: the cart keeping a dead minus at 1, so a buyer cannot remove the line from the stepper
    const onChange = vi.fn() // records every committed quantity
    render(<QuantityStepper honorName="Knot Tying" quantity={1} onChange={onChange} trashAtOne />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Knot Tying' }))
    expect(onChange).toHaveBeenCalledWith(0)
    expect(screen.queryByRole('button', { name: 'One fewer Knot Tying' })).not.toBeInTheDocument()
  })

  it('with trashAtOne draws the focus ring of every control in the soft-fill ring colour', () => {
    // catches: the card's blue ring (2.97:1 on the soft fill) staying on the cart's stepper
    render(<QuantityStepper honorName="Knot Tying" quantity={2} onChange={() => {}} trashAtOne />)
    for (const control of [
      screen.getByRole('button', { name: 'One fewer Knot Tying' }),
      screen.getByRole('textbox', { name: 'Quantity of Knot Tying' }),
      screen.getByRole('button', { name: 'One more Knot Tying' }),
    ])
      expect(control.className).toContain('focus-visible:outline-focus-ring-soft')
  })

  it('with trashAtOne the first control at 2 is still One fewer', () => {
    // catches: the trash showing above 1, which would drop a line with two in it
    const onChange = vi.fn() // records every committed quantity
    render(<QuantityStepper honorName="Knot Tying" quantity={2} onChange={onChange} trashAtOne />)
    fireEvent.click(screen.getByRole('button', { name: 'One fewer Knot Tying' }))
    expect(onChange).toHaveBeenCalledWith(1)
    expect(screen.queryByRole('button', { name: 'Remove Knot Tying' })).not.toBeInTheDocument()
  })

  it('without trashAtOne minus at 1 still calls onChange(0) as One fewer', () => {
    // catches: the catalogue card stepper changing with the cart's
    const { onChange, fewer } = setup(1)
    fireEvent.click(fewer)
    expect(onChange).toHaveBeenCalledWith(0)
    expect(screen.queryByRole('button', { name: 'Remove Knot Tying' })).not.toBeInTheDocument()
  })
})

describe('QuantityStepper with a max below 99', () => {
  it('kills + at the max with a label that says why, and keeps minus working above it', () => {
    // catches: a + that lets a buyer pass the stock, or a minus that is dead on a line already above the stock
    const onChange = vi.fn() // records every committed quantity
    render(<QuantityStepper honorName="Knot Tying" quantity={12} max={2} onChange={onChange} />)
    const more = screen.getByRole('button', { name: '2 is the most of Knot Tying' })
    expect(more).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(more)
    expect(onChange).not.toHaveBeenCalled() // dead
    fireEvent.click(screen.getByRole('button', { name: 'One fewer Knot Tying' }))
    expect(onChange).toHaveBeenCalledWith(11) // minus lowers it a step
  })

  it('says the honor is sold out on a dead + when the max is 0', () => {
    // catches: a "0 is the most of" label on a line whose stock is gone
    render(<QuantityStepper honorName="Knot Tying" quantity={3} max={0} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Knot Tying is sold out' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('clamps a typed number to the max, not to 99', () => {
    // catches: typing 50 into a stock-12 stepper committing 50
    const onChange = vi.fn() // records every committed quantity
    render(<QuantityStepper honorName="Knot Tying" quantity={1} max={12} onChange={onChange} />)
    const field = screen.getByRole('textbox', { name: 'Quantity of Knot Tying' })
    fireEvent.change(field, { target: { value: '50' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(12)
  })
})
