// Tests for CategoryIcon: every icon name the category mark can ask for must draw something.

import { render } from '@testing-library/react' // render the icon
import { describe, expect, it } from 'vitest' // test API
import type { CategoryIconName } from './category-mark.ts' // the icon names
import { CategoryIcon } from './CategoryIcon.tsx' // code under test

const names: CategoryIconName[] = ['award', 'shirt', 'neckerchief'] // the three names, written out

describe('CategoryIcon', () => {
  it.each(names)('draws %s as a hidden svg', (name) => {
    // catches: a name with no path data, which would render an empty square
    const { container } = render(<CategoryIcon name={name} />) // draw the icon
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0) // it has paths
  })

  it.each(names)('draws %s as stroked paths on the 24 px grid', (name) => { // one case per icon
    // catches: an icon drifting from Tabler's outline style
    const { container } = render(<CategoryIcon name={name} />) // draw the icon
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    expect(svg).toHaveAttribute('stroke-width', '2')
    expect(svg).toHaveAttribute('stroke-linecap', 'round')
    expect(svg).toHaveAttribute('stroke-linejoin', 'round')
  })

  it('draws the neckerchief as exactly four paths', () => { // the loop's two ends, the ring and the triangle
    // catches: the hand-drawn icon losing one of its four paths
    const { container } = render(<CategoryIcon name="neckerchief" />) // draw the icon
    expect(container.querySelector('svg')?.querySelectorAll('path').length).toBe(4) // the exact count
  })

  it('passes className to the svg', () => {
    // catches: the mark being unable to size the icon
    const { container } = render(<CategoryIcon name="award" className="size-7" />) // draw with a size class
    expect(container.querySelector('svg')).toHaveClass('size-7')
  })
})
