// Tests for PatchPicture: the patch picture when there is one, the category mark when there is none or it fails to load.

import { fireEvent, render, screen } from '@testing-library/react' // render and poke the picture
import { describe, expect, it } from 'vitest' // test API
import type { Honor } from '@/shared/data/types.ts' // the shape of an honor
import { PatchPicture } from './PatchPicture.tsx' // code under test

/**
 * Builds an honor for the tests.
 * @param image the picture path or null
 * @return an honor in Nature
 */
function honor(image: string | null): Honor {
  return {
    id: 'knot-tying',
    name: 'Knot Tying',
    category: 'Nature',
    stock: 10,
    price: 4,
    image,
  } // only the image and category matter here
}

describe('PatchPicture', () => {
  it('shows the picture under the base path, as decoration', () => {
    // catches: a wrong picture URL, or a picture read out twice beside the name
    const { container } = render(<PatchPicture honor={honor('patches/knot-tying.webp')} />)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', '/patches/knot-tying.webp')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('width', '56')
    expect(screen.queryByTestId('category-mark')).not.toBeInTheDocument()
  })

  it('shows the category mark when the honor has no picture', () => {
    // catches: an empty box or a broken image for honors without a picture
    const { container } = render(<PatchPicture honor={honor(null)} />)
    expect(container.querySelector('img')).toBeNull()
    const mark = screen.getByTestId('category-mark')
    expect(mark).toHaveStyle({ backgroundColor: '#f0f2ed', color: '#171717' }) // Nature's colours
    expect(mark).toHaveClass('border')
    expect(mark.querySelector('svg')).not.toBeNull()
  })

  it('swaps a picture that fails to load for the category mark', () => {
    // catches: a broken-image icon when a picture 404s or the buyer is offline
    const { container } = render(<PatchPicture honor={honor('patches/knot-tying.webp')} />)
    fireEvent.error(container.querySelector('img')!) // the browser could not load it
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByTestId('category-mark')).toBeInTheDocument()
  })
})
