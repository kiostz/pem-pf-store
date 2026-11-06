// Tests for PatchPicture: the patch picture when there is one, the category mark when there is none or it fails to load.

import { fireEvent, render, screen } from '@testing-library/react' // render and poke the picture
import { afterEach, describe, expect, it, vi } from 'vitest' // test API
import type { Item } from '@/shared/data/types.ts' // the shape of an item
import { PatchPicture } from './PatchPicture.tsx' // code under test

/**
 * Builds an item for the tests.
 * @param image the picture path or null
 * @return an item in Nature
 */
function item(image: string | null): Item { // builds an item with an image key
  return {
    id: 'knot-tying',
    name: 'Knot Tying',
    category: 'Nature',
    subcategory: null, // no subcategory
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
    const { container } = render(<PatchPicture item={item('items/knot-tying.webp')} />) // renders the picture of an item
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://pictures.example.test/items/knot-tying.webp')
  })

  it('uses pictureBase over the env, and accepts a bare image and category', () => {
    // catches: the admin page unable to point pictures at its own origin, or a prop type too wide for AdminItem
    const { container } = render(<PatchPicture item={{ image: 'items/knot-tying.webp', category: 'Nature' }} pictureBase="/pictures" />) // a bare image and category fit the prop
    expect(container.querySelector('img')).toHaveAttribute('src', '/pictures/items/knot-tying.webp')
  })

  it('shows the picture as decoration', () => {
    // catches: a picture read out twice beside the name
    const { container } = render(<PatchPicture item={item('items/knot-tying.webp')} pictureBase="/pictures" />) // the picture with its own base
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('width', '56')
    expect(screen.queryByTestId('category-mark')).not.toBeInTheDocument()
  })

  it('shows the category mark when the item has no picture', () => {
    // catches: an empty box or a broken image for items without a picture
    const { container } = render(<PatchPicture item={item(null)} />) // an item with no picture
    expect(container.querySelector('img')).toBeNull()
    const mark = screen.getByTestId('category-mark')
    expect(mark).toHaveStyle({ backgroundColor: '#525252', color: '#ffffff' }) // the grey default's colours
    expect(mark).toHaveClass('border')
    expect(mark.querySelector('svg')).not.toBeNull()
  })

  it('shows the Honors mark for a Honors item with no picture, and for one whose picture fails to load', () => { // both fallback paths
    // catches: an Honors item showing the grey default or an old area colour
    const honors = { ...item(null), category: 'Honors' } // a Honors item with no picture
    const { unmount } = render(<PatchPicture item={honors} />) // the no-picture case
    expect(screen.getByTestId('category-mark')).toHaveStyle({ backgroundColor: '#1f5f3a', color: '#ffffff' }) // forest green, white icon
    unmount() // render the failing-picture case fresh
    const failing = render(<PatchPicture item={{ ...honors, image: 'items/knot-tying.webp' }} />) // the picture fails
    fireEvent.error(failing.container.querySelector('img')!) // the browser could not load it
    expect(screen.getByTestId('category-mark')).toHaveStyle({ backgroundColor: '#1f5f3a' }) // forest green again
  })

  it('swaps a picture that fails to load for the category mark', () => {
    // catches: a broken-image icon when a picture 404s or the buyer is offline
    const { container } = render(<PatchPicture item={item('items/knot-tying.webp')} />) // an item whose picture fails
    fireEvent.error(container.querySelector('img')!) // the browser could not load it
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByTestId('category-mark')).toBeInTheDocument()
  })
})
