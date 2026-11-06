// Tests for CategoryFilter: the closed control, its options and what it reports, driven through the native select it renders.

import { fireEvent, render, screen, within } from '@testing-library/react' // render and query the control
import { describe, expect, it, vi } from 'vitest' // test API and mock
import { CategoryFilter } from './CategoryFilter.tsx' // code under test

const categories = ['Arts and Crafts', 'Nature', 'Recreation'] // the options after All categories

describe('CategoryFilter', () => {
  it('shows "All categories" in the control named Category when nothing is chosen', () => {
    // catches: a control with no name for screen readers, or one that shows a blank for All
    render(<CategoryFilter categories={categories} selected={null} onSelect={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveDisplayValue('All categories')
  })

  it('shows the chosen category in the control', () => {
    // catches: a control stuck on All while a category is applied
    render(<CategoryFilter categories={categories} selected="Nature" onSelect={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveDisplayValue('Nature')
  })

  it('lists All categories first, then the given categories in order, with the chosen one selected', () => {
    // catches: a reordered list, a missing All option, or no option marked as chosen
    render(<CategoryFilter categories={categories} selected="Nature" onSelect={() => {}} />)
    const options = within(screen.getByRole('combobox', { name: 'Category' })).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'All categories',
      'Arts and Crafts',
      'Nature',
      'Recreation',
    ])
    expect(
      options.filter((option) => (option as HTMLOptionElement).selected).map((option) => option.textContent),
    ).toEqual(['Nature'])
  })

  it('reports a chosen category once', () => {
    // catches: a missing or doubled onSelect call
    const onSelect = vi.fn()
    render(<CategoryFilter categories={categories} selected={null} onSelect={onSelect} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'Nature' } })
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('Nature')
  })

  it('reports null when All categories is chosen', () => {
    // catches: the string "All" leaking out instead of null
    const onSelect = vi.fn()
    render(<CategoryFilter categories={categories} selected="Nature" onSelect={onSelect} />)
    const control = screen.getByRole('combobox', { name: 'Category' }) // the closed control
    const allOption = within(control).getByRole('option', { name: 'All categories' }) as HTMLOptionElement // the All option
    fireEvent.change(control, { target: { value: allOption.value } })
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('reports a category named "All" as that category, not as All categories', () => {
    // catches: a category called All colliding with the All categories value and showing every item
    const onSelect = vi.fn()
    render(<CategoryFilter categories={['All', 'Nature']} selected={null} onSelect={onSelect} />)
    const control = screen.getByRole('combobox', { name: 'Category' }) // the closed control
    const option = within(control).getByRole('option', { name: 'All' }) as HTMLOptionElement // the category named All
    fireEvent.change(control, { target: { value: option.value } })
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('All')
  })

  it('does not report choosing the option that is already chosen', () => {
    // catches: a scroll-to-top triggered by picking the same category again
    const onSelect = vi.fn()
    render(<CategoryFilter categories={categories} selected="Nature" onSelect={onSelect} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'Nature' } })
    expect(onSelect).not.toHaveBeenCalled()
  })
})
