// Tests for CategoryTiles: one coloured link per category, and the row's loading, error and empty states.

import { fireEvent, render, screen } from '@testing-library/react' // render and query
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API
import type { Honor } from '@/shared/data/types.ts' // the shape of an item
import { honor as makeHonor } from '@/test/shop-fetch.ts' // the honor builder
import type { CatalogueLoad } from '@/features/catalogue/use-catalogue-data.ts' // the load the tiles receive
import { CategoryTiles } from './CategoryTiles.tsx' // code under test

/**
 * Builds one item.
 * @param name its name
 * @param category its category
 * @return the item
 */
function honor(name: string, category: string): Honor {
  return makeHonor(name.toLowerCase(), name, { category }) // the id from the name
}

/**
 * Builds a ready load.
 * @param honors the items
 * @return the load
 */
function ready(honors: Honor[]): CatalogueLoad {
  return {
    state: { status: 'ready', honors, settings: { currency: 'MYR' }, clubs: [] },
    showSkeleton: false,
    retry: () => {}, applyStock: () => {},
  } as CatalogueLoad
}

beforeEach(() => {
  vi.useFakeTimers() // the skeleton gate is the hook's; nothing here waits
})
afterEach(() => {
  vi.useRealTimers() // real clock again
})

describe('CategoryTiles', () => {
  it('draws one link per category, A to Z, named by the category, with the address of the filtered shop', () => {
    // catches: a tile for a category the shop lacks, wrong order, or a link that does not carry the category
    render(
      <CategoryTiles
        data={ready([
          honor('Leaves', 'Nature'),
          honor('Ants', 'Arts and Crafts'),
          honor('Tie', 'Recreation'),
        ])}
      />,
    )
    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Arts and Crafts', 'Nature', 'Recreation'])
    expect(screen.getByRole('link', { name: 'Arts and Crafts' })).toHaveAttribute(
      'href',
      '#/shop?category=Arts%20and%20Crafts',
    )
  })

  it('fills each tile with its patch colour and the grey award colour for an unknown category, with the name as text and no icon', () => {
    // catches: a tile with the wrong fill, or an icon or overlay added over the colour
    render(<CategoryTiles data={ready([honor('A', 'Recreation'), honor('B', 'Club Special')])} />)
    const recreation = screen.getByRole('link', { name: 'Recreation' })
    expect(recreation).toHaveStyle({ backgroundColor: '#117155' })
    expect(screen.getByRole('link', { name: 'Club Special' })).toHaveStyle({ backgroundColor: '#525252' })
    expect(recreation.querySelector('svg')).toBeNull()
    expect(recreation).toHaveClass('text-shadow-halo') // the halo token class, no literal
  })

  it('shows nothing for a load that has not passed the delay, then 3 skeleton tiles, with no links', () => {
    // catches: a flash of skeleton on a fast load, or a wrong tile count
    const loading = { state: { status: 'loading' }, showSkeleton: false, retry: () => {}, applyStock: () => {} } as CatalogueLoad
    const { rerender } = render(<CategoryTiles data={loading} />)
    expect(screen.queryByTestId('tile-skeleton')).not.toBeInTheDocument()
    const region = screen.getByRole('status') // already in the page before it speaks
    expect(region).toBeEmptyDOMElement()
    rerender(<CategoryTiles data={{ ...loading, showSkeleton: true }} />)
    expect(screen.getByRole('status')).toBe(region) // the same node gained its text
    expect(screen.getAllByTestId('tile-skeleton')).toHaveLength(3)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('Loading the shop').closest('[role="status"]')).not.toBeNull() // heard by a screen reader
    expect(screen.getAllByTestId('tile-skeleton')[0]).toHaveClass('animate-skeleton') // pulsing, and no emblem loader
  })

  it('says the shop is busy, with Try again, when the load was refused', () => {
    // catches: Home telling a rate-limited buyer to check their connection
    render(<CategoryTiles data={{ state: { status: 'error', reason: 'busy' }, showSkeleton: false, retry: () => {}, applyStock: () => {} } as CatalogueLoad} />)
    expect(screen.getByText('The shop is busy right now. Try again in a minute.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('shows the load error with Try again that calls retry', () => {
    // catches: a failed load with no way to retry
    const retry = vi.fn()
    render(<CategoryTiles data={{ state: { status: 'error', reason: 'failed' }, showSkeleton: false, retry, applyStock: () => {} } as CatalogueLoad} />)
    expect(screen.getByText("We couldn't load the shop. Check your connection and try again.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('says nothing is in the shop yet, with no links, when the shop lists no item', () => {
    // catches: an empty row with no explanation
    render(<CategoryTiles data={ready([])} />)
    expect(screen.getByText('Nothing is in the shop yet. Check back soon.')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('writes the name in near-black on the two light tiles, as the category marks do, and in white on the rest', () => {
    // catches: white names on Nature and Household Arts, where white has 1.13:1 and 1.96:1
    render(
      <CategoryTiles data={ready([honor('A', 'Nature'), honor('B', 'Household Arts'), honor('C', 'Recreation')])} />,
    )
    for (const name of ['Nature', 'Household Arts']) {
      const tile = screen.getByRole('link', { name })
      expect(tile).toHaveStyle({ color: '#171717' })
      expect(tile).not.toHaveClass('text-shadow-halo', 'text-shadow-halo-strong') // a dark halo round dark letters would blur them
    }
    expect(screen.getByRole('link', { name: 'Recreation' })).toHaveClass('text-on-patch', 'text-shadow-halo')
  })

  it('gives Arts and Crafts, the one mid-tone tile, the stronger tighter halo', () => {
    // catches: the plain halo on a tile where white measures only 3.6:1
    render(<CategoryTiles data={ready([honor('A', 'Arts and Crafts')])} />)
    const tile = screen.getByRole('link', { name: 'Arts and Crafts' })
    expect(tile).toHaveClass('text-on-patch', 'text-shadow-halo-strong')
    expect(tile).not.toHaveClass('text-shadow-halo')
  })
})
