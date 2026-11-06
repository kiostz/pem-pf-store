// Tests for CategoryTiles: one coloured link per category, and the row's loading, error and empty states.

import { fireEvent, render, screen } from '@testing-library/react' // render and query
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API
import type { Item } from '@/shared/data/types.ts' // the shape of an item
import { item as makeItem } from '@/test/shop-fetch.ts' // the item builder
import type { CatalogueLoad } from '@/features/catalogue/use-catalogue-data.ts' // the load the tiles receive
import { CategoryTiles } from './CategoryTiles.tsx' // code under test

/**
 * Builds one item.
 * @param name its name
 * @param category its category
 * @return the item
 */
function item(name: string, category: string): Item { // builds an item in a category
  return makeItem(name.toLowerCase(), name, { category }) // the id from the name
}

/**
 * Builds a ready load.
 * @param items the items
 * @return the load
 */
function ready(items: Item[]): CatalogueLoad { // a ready load over these items
  return {
    state: { status: 'ready', items, settings: { currency: 'MYR' }, clubs: [] }, // the ready state holds the items
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
          item('Leaves', 'Nature'), // one test item the shop lists
          item('Ants', 'Arts and Crafts'), // one test item the shop lists
          item('Tie', 'Recreation'), // one test item the shop lists
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

  it('fills each tile with its category colour and an aria-hidden icon, the name alone as its accessible name, and grey for an unknown category', () => { // one test, four checks
    // catches: a tile with the wrong fill, no icon, or an icon read out beside the name
    render(<CategoryTiles data={ready([item('A', 'Honors'), item('B', 'Club Special')])} />) // the tiles read their categories from these items
    const honors = screen.getByRole('link', { name: 'Honors' }) // the name is the whole accessible name
    expect(honors).toHaveStyle({ backgroundColor: '#1f5f3a' }) // forest green
    expect(honors.querySelector('svg')).toHaveAttribute('aria-hidden', 'true') // the icon is decoration
    expect(screen.getByRole('link', { name: 'Club Special' })).toHaveStyle({ backgroundColor: '#525252' })
    expect(honors).toHaveClass('text-shadow-halo') // the halo token class, no literal
  })

  it('gives the Shirts tile a near-black name without a halo and the Honors and Accessories tiles a white name in the plain halo', () => { // light tile, dark name
    // catches: a white name on the light khaki tile, or a missing halo on the dark ones
    render(<CategoryTiles data={ready([item('A', 'Shirts'), item('B', 'Accessories'), item('C', 'Honors')])} />) // the tiles read their categories from these items
    const shirts = screen.getByRole('link', { name: 'Shirts' }) // the khaki tile
    expect(shirts).toHaveStyle({ backgroundColor: '#c3b091', color: '#171717' }) // khaki with near-black lettering
    expect(shirts).not.toHaveClass('text-shadow-halo') // dark letters take no halo
    for (const name of ['Accessories', 'Honors']) { // the two dark tiles
      expect(screen.getByRole('link', { name })).toHaveClass('text-on-patch', 'text-shadow-halo') // a dark tile has a white name in the halo
    }
    expect(screen.getByRole('link', { name: 'Accessories' })).toHaveStyle({ backgroundColor: '#2f4858' }) // slate
  })

  it('carries no strong halo class on any tile', () => { // the halo is deleted
    // catches: the deleted strong halo coming back on a tile
    const { container } = render(<CategoryTiles data={ready([item('A', 'Accessories'), item('B', 'Honors'), item('C', 'Shirts')])} />) // all three tiles
    expect(container.innerHTML).not.toContain('halo-strong') // no tile carries it
  })

  it('lets the tile row scroll with 16 px of scroll padding so a swipe never leaves a tile flush to the screen edge', () => { // scroll padding on the row
    // catches: the first tile pulled to the screen edge after a swipe
    render(<CategoryTiles data={ready([item('A', 'Honors')])} />) // one tile
    expect(screen.getByRole('link', { name: 'Honors' }).parentElement).toHaveClass('scroll-px-4', 'snap-x') // the row is the link's parent
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
})
