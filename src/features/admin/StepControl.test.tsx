// Tests for the Step select: its three choices, and the call on a change.

import { fireEvent, render, screen } from '@testing-library/react' // rendering and events
import { describe, expect, it, vi } from 'vitest' // test API
import { StepControl } from './StepControl.tsx' // the code under test

describe('StepControl', () => {
  it('offers New, Paid and Handed out, shows the step, and reports a pick', () => {
    // Catches a Cancelled option (cancelling has its own dialog) or a missing label.
    const onChange = vi.fn()
    render(<StepControl step="paid" busy={false} onChange={onChange} />)
    const select = screen.getByLabelText('Step')
    expect(select).toHaveValue('paid')
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['New', 'Paid', 'Handed out'])
    fireEvent.change(select, { target: { value: 'handed_out' } })
    expect(onChange).toHaveBeenCalledWith('handed_out')
  })

  it('stays focusable but ignores a pick while busy, so keyboard focus is not dropped', () => {
    // Catches a select that is disabled during a save and throws focus to the page.
    const onChange = vi.fn()
    render(<StepControl step="new" busy onChange={onChange} />)
    const select = screen.getByLabelText('Step')
    expect(select).not.toBeDisabled()
    expect(select).toHaveAttribute('aria-disabled', 'true')
    fireEvent.change(select, { target: { value: 'paid' } })
    expect(onChange).not.toHaveBeenCalled()
  })
})
