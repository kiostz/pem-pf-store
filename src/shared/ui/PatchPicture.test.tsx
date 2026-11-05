// Tests for PatchPicture: the patch picture when there is one, the category mark when there is none or it fails to load.

import { fireEvent, render, screen } from '@testing-library/react' // render and poke the picture
import { afterEach, describe, expect, it, vi } from 'vitest' // test API
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
  afterEach(() => vi.unstubAllEnvs()) // the env stub never leaks to another test

  it('builds the picture URL from VITE_PICTURE_URL', () => {
    // catches: a picture still loaded from the site's own base path instead of the picture domain
    vi.stubEnv('VITE_PICTURE_URL', 'https://pictures.example.test')
    const { container } = render(<PatchPicture honor={honor('items/knot-tying.webp')} />)
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://pictures.example.test/items/knot-tying.webp')
  })

  it('uses pictureBase over the env, and accepts a bare image and category', () => {
    // catches: the admin page unable to point pictures at its own origin, or a prop type too wide for AdminHonor
    const { container } = render(<PatchPicture honor={{ image: 'items/knot-tying.webp', category: 'Nature' }} pictureBase="/pictures" />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/pictures/items/knot-tying.webp')
  })

  it('shows the picture as decoration', () => {
    // catches: a picture read out twice beside the name
    const { container } = render(<PatchPicture honor={honor('items/knot-tying.webp')} pictureBase="/pictures" />)
    const img = container.querySelector('img')
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
    const { container } = render(<PatchPicture honor={honor('items/knot-tying.webp')} />)
    fireEvent.error(container.querySelector('img')!) // the browser could not load it
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByTestId('category-mark')).toBeInTheDocument()
  })
})
