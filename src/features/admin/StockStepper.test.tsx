// Tests for the admin stock stepper: its limits, typed entry, clamping and the restore on a cleared field.

import { fireEvent, render, screen } from '@testing-library/react' // rendering and events
import { describe, expect, it, vi } from 'vitest' // test API
import { StockStepper } from './StockStepper.tsx' // the code under test

describe('StockStepper', () => {
  it('makes minus at 0 and plus at 9,999 dead, with the reason in the label', () => {
    // Catches a stepper that goes below 0 or past the limit, or a dead button that does not say why.
    const onChange = vi.fn()
    const { rerender } = render(<StockStepper itemName="Knot Tying" stock={0} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: "Stock can't go below 0" }))
    expect(onChange).not.toHaveBeenCalled()
    rerender(<StockStepper itemName="Knot Tying" stock={9999} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: "Stock can't go above 9,999" }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('steps by one with the two buttons', () => {
    // Catches buttons that step by the wrong amount or in the wrong direction.
    const onChange = vi.fn()
    render(<StockStepper itemName="Knot Tying" stock={12} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'One less' }))
    fireEvent.click(screen.getByRole('button', { name: 'One more' }))
    expect(onChange.mock.calls).toEqual([[11], [13]])
  })

  it('steps a stock above 9,999 down to 9,999, never to a value the Worker refuses', () => {
    // Catches a minus on a stored 12000 that sends 11999 and fails on every save.
    const onChange = vi.fn()
    render(<StockStepper itemName="Knot Tying" stock={12000} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'One less' }))
    expect(onChange).toHaveBeenCalledWith(9999)
  })

  it('commits a typed number on Enter and on blur', () => {
    // Catches typing that is lost when the admin presses Enter or taps away.
    const onChange = vi.fn()
    render(<StockStepper itemName="Knot Tying" stock={3} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Stock of Knot Tying' })
    fireEvent.change(input, { target: { value: '12' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: '20' } })
    fireEvent.blur(input)
    expect(onChange.mock.calls).toEqual([[12], [20]])
  })

  it('commits a typed number on Enter and never submits a wrapping form', () => {
    // Enter in the stock field
    // catches: Enter submitting the Item sheet's form before the typed stock is committed.
    const onChange = vi.fn() // records the committed stock
    const onSubmit = vi.fn((event: React.SyntheticEvent) => event.preventDefault()) // runs only if the form submits
    // Draw the stepper inside a form with a submit button, as the Item sheet does.
    render(
      // A form around the stepper and a submit button, like the Item sheet.
      <form onSubmit={onSubmit}>
        {/* The stepper, then a submit button. */}
        <StockStepper itemName="Knot Tying" stock={12} onChange={onChange} />
        <button type="submit">Done</button>
      </form>,
    ) // the stepper inside a form
    const input = screen.getByRole('textbox', { name: 'Stock of Knot Tying' }) // the stock number field
    fireEvent.change(input, { target: { value: '7' } }) // type 7 without committing it yet
    if (fireEvent.keyDown(input, { key: 'Enter' })) (input as HTMLInputElement).form?.requestSubmit() // jsdom has no implicit submit, so do what a browser does when keydown was not prevented
    expect(onSubmit).not.toHaveBeenCalled() // the form never submitted
    expect(onChange).toHaveBeenCalledWith(7) // Enter committed the typed number
  })

  it('clamps 12000 to 9,999 and ignores letters', () => {
    // Catches stock above the Worker's limit being sent, or letters reaching the number.
    const onChange = vi.fn()
    render(<StockStepper itemName="Knot Tying" stock={3} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Stock of Knot Tying' })
    fireEvent.change(input, { target: { value: '1a2' } })
    expect(input).toHaveValue('12')
    fireEvent.change(input, { target: { value: '12000' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith(9999)
  })

  it('restores the earlier value when the text is cleared, never zeroing the stock', () => {
    // Catches an accidental clear that saves a stock of 0.
    const onChange = vi.fn()
    render(<StockStepper itemName="Knot Tying" stock={7} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Stock of Knot Tying' })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('7')
  })
})
