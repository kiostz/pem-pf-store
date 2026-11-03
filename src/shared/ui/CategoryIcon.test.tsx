// Tests for CategoryIcon: every icon name the category mark can ask for must draw something.

import { render } from '@testing-library/react' // render the icon
import { describe, expect, it } from 'vitest' // test API
import type { CategoryIconName } from './category-mark.ts' // the icon names
import { CategoryIcon } from './CategoryIcon.tsx' // code under test

const names: CategoryIconName[] = [
  'heart-handshake',
  'palette',
  'microscope',
  'tools-kitchen-2',
  'leaf',
  'plant-2',
  'world',
  'tent',
  'tool',
  'award',
  'shirt',
  'neckerchief',
] // all twelve names, written out

describe('CategoryIcon', () => {
  it.each(names)('draws %s as a hidden svg', (name) => {
    // catches: a name with no path data, which would render an empty square
    const { container } = render(<CategoryIcon name={name} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0)
  })

  it('draws the neckerchief as stroked paths on the 24 px grid', () => {
    // catches: the hand-drawn icon losing its paths or drifting from Tabler's outline style
    const { container } = render(<CategoryIcon name="neckerchief" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    expect(svg).toHaveAttribute('stroke-width', '2')
    expect(svg).toHaveAttribute('stroke-linecap', 'round')
    expect(svg).toHaveAttribute('stroke-linejoin', 'round')
    expect(svg?.querySelectorAll('path').length).toBe(4)
  })

  it('passes className to the svg', () => {
    // catches: the mark being unable to size the icon
    const { container } = render(<CategoryIcon name="leaf" className="size-7" />)
    expect(container.querySelector('svg')).toHaveClass('size-7')
  })
})
