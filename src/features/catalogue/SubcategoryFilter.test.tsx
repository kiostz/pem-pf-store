// Tests for SubcategoryFilter: the labelled group of toggle buttons that narrows Shop to one subcategory.

import { fireEvent, render, screen } from '@testing-library/react' // render and query the row
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import { SubcategoryFilter } from './SubcategoryFilter.tsx' // code under test

const scrollIntoView = vi.fn() // stands in for the scroll jsdom cannot do

beforeEach(() => { // before each test
  scrollIntoView.mockClear() // count calls per test
  Element.prototype.scrollIntoView = scrollIntoView // jsdom has no scrollIntoView
})

afterEach(() => { // after each test
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView // put jsdom's prototype back as it was
})

describe('SubcategoryFilter', () => { // the chip row
  it('is a group named Subcategory with All first, then the names in the order given', () => { // structure
    // catches: an unnamed group, All not first, or the names re-sorted
    render(<SubcategoryFilter subcategories={['Nature', 'Recreation']} selected={null} onSelect={() => {}} />) // two chips
    const group = screen.getByRole('group', { name: 'Subcategory' }) // the labelled group
    expect(Array.from(group.querySelectorAll('button')).map((button) => button.textContent)).toEqual(['All', 'Nature', 'Recreation']) // in order
  })

  it('presses the picked chip, or All when none is picked, and no other', () => { // aria-pressed
    // catches: two chips pressed, or All left unpressed at the start
    const { rerender } = render(<SubcategoryFilter subcategories={['Nature', 'Recreation']} selected={null} onSelect={() => {}} />) // none picked
    expect(screen.getByRole('button', { name: 'All', pressed: true })).toBeInTheDocument() // All pressed
    expect(screen.getByRole('button', { name: 'Nature', pressed: false })).toBeInTheDocument() // the rest not
    rerender(<SubcategoryFilter subcategories={['Nature', 'Recreation']} selected="Nature" onSelect={() => {}} />) // Nature picked
    expect(screen.getByRole('button', { name: 'Nature', pressed: true })).toBeInTheDocument() // Nature pressed
    expect(screen.getByRole('button', { name: 'All', pressed: false })).toBeInTheDocument() // All not
    expect(screen.getByRole('button', { name: 'Recreation', pressed: false })).toBeInTheDocument() // Recreation not
  })

  it('reports the name on a tap, and null on All', () => { // callbacks
    // catches: All reporting its label instead of null, or a tap reporting nothing
    const onSelect = vi.fn() // the spy
    render(<SubcategoryFilter subcategories={['Nature', 'Recreation']} selected="Recreation" onSelect={onSelect} />) // Recreation picked
    fireEvent.click(screen.getByRole('button', { name: 'Nature' })) // another chip
    expect(onSelect).toHaveBeenLastCalledWith('Nature') // its name
    fireEvent.click(screen.getByRole('button', { name: 'All' })) // All
    expect(onSelect).toHaveBeenLastCalledWith(null) // null
  })

  it('reports nothing on a tap of the chip already picked', () => { // no repeat
    // catches: a history replace and a scroll for a pick that changes nothing
    const onSelect = vi.fn() // the spy
    const { rerender } = render(<SubcategoryFilter subcategories={['Nature']} selected="Nature" onSelect={onSelect} />) // Nature picked
    fireEvent.click(screen.getByRole('button', { name: 'Nature' })) // the picked chip
    rerender(<SubcategoryFilter subcategories={['Nature']} selected={null} onSelect={onSelect} />) // All picked
    fireEvent.click(screen.getByRole('button', { name: 'All' })) // the picked All
    expect(onSelect).not.toHaveBeenCalled() // silent
  })

  it('gives every chip the 44 px class, and the row scrolls sideways without wrapping', () => { // size and overflow
    // catches: a chip under 44 px, or a row that wraps to a second line
    render(<SubcategoryFilter subcategories={['Nature']} selected={null} onSelect={() => {}} />) // one chip and All
    for (const button of screen.getAllByRole('button')) expect(button).toHaveClass('min-h-11') // 44 px each
    const group = screen.getByRole('group', { name: 'Subcategory' }) // the row
    expect(group).toHaveClass('overflow-x-auto') // swipes
    expect(group).not.toHaveClass('flex-wrap') // never wraps
  })

  it('scrolls the picked chip into view on mount', () => { // opened on a chip off screen
    // catches: a shared link to a chip off the edge that opens with the pick hidden
    render(<SubcategoryFilter subcategories={['Nature', 'Recreation']} selected="Recreation" onSelect={() => {}} />) // Recreation picked
    expect(scrollIntoView).toHaveBeenCalledTimes(1) // once
    expect(scrollIntoView.mock.instances[0]).toBe(screen.getByRole('button', { name: 'Recreation' })) // on the picked chip
  })
})
