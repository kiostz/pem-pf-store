// Tests for the status control: switch semantics, the word beside it, Space and Enter, and one change per flip.

import { fireEvent, render, screen } from '@testing-library/react' // rendering and events
import { describe, expect, it, vi } from 'vitest' // test API
import { StatusControl } from './StatusControl.tsx' // the code under test

describe('StatusControl', () => {
  it('is a switch named "Active: <name>", on when Active, with the word beside it', () => {
    // Catches a status shown by colour alone, or one a screen reader cannot read as an on/off control.
    const { rerender } = render(<StatusControl itemName="Knot Tying" status="active" onChange={vi.fn()} />)
    const control = screen.getByRole('switch', { name: 'Active: Knot Tying' })
    expect(control).toBeChecked()
    expect(control).toHaveTextContent('') // the word sits beside the switch, not inside it
    expect(screen.getByText('Active')).toHaveAttribute('aria-hidden', 'true') // so no second name is announced
    rerender(<StatusControl itemName="Knot Tying" status="hidden" onChange={vi.fn()} />)
    expect(screen.getByRole('switch', { name: 'Active: Knot Tying' })).not.toBeChecked()
    expect(screen.getByText('Hidden')).toBeVisible()
  })

  it('reports the other status on each click', () => {
    // Catches a flip that reports the current status, or none.
    const onChange = vi.fn()
    const { rerender } = render(<StatusControl itemName="Knot Tying" status="active" onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch'))
    rerender(<StatusControl itemName="Knot Tying" status="hidden" onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange.mock.calls).toEqual([['hidden'], ['active']])
  })

  it('flips when the word beside the switch is clicked', () => {
    // Catches a word that looks clickable but does nothing.
    const onChange = vi.fn()
    render(<StatusControl itemName="Knot Tying" status="active" onChange={onChange} />)
    fireEvent.click(screen.getByText('Active'))
    expect(onChange.mock.calls).toEqual([['hidden']])
  })

  it('is a native button, so it is one tab stop and Space and Enter flip it', () => {
    // Catches a switch built from a div that a keyboard user cannot reach or flip (browsers turn Space and Enter on a button into a click).
    render(<StatusControl itemName="Knot Tying" status="active" onChange={vi.fn()} />)
    const control = screen.getByRole('switch')
    expect(control.tagName).toBe('BUTTON')
    expect(control).toHaveAttribute('type', 'button')
    expect(control).not.toHaveAttribute('tabindex', '-1')
  })
})
