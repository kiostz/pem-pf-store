// Tests for Catalogue: loading, error, empty and ready states, the flat A to Z list, search and the category filter, with fetch mocked at the boundary.

import { useState } from 'react' // the stand-in address
import { act, fireEvent, render, screen, within } from '@testing-library/react' // render and query the screen
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import { CartProvider } from '@/features/cart/CartProvider.tsx' // the cart state the steppers edit
import type { Honor } from '@/shared/data/types.ts' // the shape of an honor
import { honor as makeHonor, shopBody, shopFetch } from '@/test/shop-fetch.ts' // the honor builder and the /shop fake
import { Catalogue } from './Catalogue.tsx' // code under test
import { useCatalogueData } from './use-catalogue-data.ts' // the load the catalogue now receives

/**
 * Loads the data and renders the catalogue inside a cart, as the app does.
 * @return the catalogue under a CartProvider
 */
function CatalogueWithCart({ initialCategory = null, onSelect }: { initialCategory?: string | null; onSelect?: (next: string | null) => void }) {
  const data = useCatalogueData() // the one load
  const [category, setCategory] = useState<string | null>(initialCategory) // stands in for the address, which App owns
  return (
    <CartProvider honors={data.state.status === 'ready' ? data.state.honors : null}>
      <Catalogue
        data={data}
        category={category}
        onSelectCategory={(next) => {
          onSelect?.(next) // lets a test see the call
          setCategory(next) // the address follows
        }}
      />
    </CartProvider>
  )
}

/**
 * Builds one honor for the fake shop.
 * @param name display name
 * @param category its category
 * @param image the picture path, or null for the category mark
 * @return an honor as the shop lists it
 */
function honor(name: string, category: string, image: string | null = null) {
  return makeHonor(name.toLowerCase().replace(/\W+/g, '-'), name, { category, image }) // image null by default: the row shows its category mark
}

/**
 * Makes the global fetch answer with the /shop body for these honors.
 * @param honors the honors the shop lists
 */
function serve(honors: Honor[]) {
  vi.stubGlobal('fetch', shopFetch(honors)) // one answer for the one request
}

const scrollIntoView = vi.fn() // stands in for the scroll jsdom cannot do

beforeEach(() => {
  scrollIntoView.mockClear() // count calls per test
  Element.prototype.scrollIntoView = scrollIntoView // jsdom has no scrollIntoView
  vi.useFakeTimers({ shouldAdvanceTime: true }) // control the 300 ms loader delay, keep promises moving
  vi.spyOn(console, 'error').mockImplementation(() => {}) // a failed load is logged; keep test output clean
})

afterEach(() => {
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView // put jsdom's prototype back as it was
  vi.useRealTimers() // restore the clock
  vi.unstubAllGlobals() // restore fetch
  vi.restoreAllMocks() // restore console
})

describe('Catalogue', () => {
  it('lists one flat list with no headings, honors A to Z across categories', async () => {
    // catches: file order or category grouping leaking into the list, or a heading left in it
    serve([
      honor('Leaves', 'Nature'),
      honor('Knot Tying', 'Recreation'),
      honor('Ants', 'Nature'),
      honor('Braiding - Advanced', 'Arts and Crafts'),
    ])
    render(<CatalogueWithCart />)
    const list = await screen.findByRole('list')
    expect(within(list).queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.getAllByRole('list')).toHaveLength(1)
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent?.replace(/(Nature|Recreation|Arts and Crafts)?RM.*/, '')),
    ).toEqual(['Ants', 'Braiding - Advanced', 'Knot Tying', 'Leaves']) // names only, labels and prices checked elsewhere
  })

  it('shows each card its category label, and the label is not a button', async () => {
    // catches: a missing label, or a label that looks and acts like a control
    serve([honor('Ants', 'Nature'), honor('Knot Tying', 'Recreation')])
    render(<CatalogueWithCart />)
    const row = (await screen.findByText('Ants')).closest('li')!
    expect(within(row).getByText('Nature')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Nature' })).not.toBeInTheDocument() // Add is the card's only button
    expect(within(row).queryByRole('link')).not.toBeInTheDocument()
  })

  it('keeps the grid one column below 348 px, where two columns are too narrow for the 134 px stepper', async () => {
    // catches: two columns on a 320 px phone, where the stepper sticks out of its card
    serve([honor('Ants', 'Nature')])
    render(<CatalogueWithCart />)
    await screen.findByText('Ants')
    const classes = screen.getByRole('list').className.split(' ') // the grid's utility classes
    expect(classes).toContain('grid-cols-1') // one column by default
    expect(classes).toContain('min-[348px]:grid-cols-2') // two only from 348 px
    expect(classes).not.toContain('grid-cols-2') // never two at every width
  })

  it('draws the category label in the default text colour, not the muted grey that fails contrast on its chip', async () => {
    // catches: muted text (3.4:1) on the light chip
    serve([honor('Ants', 'Nature')])
    render(<CatalogueWithCart />)
    const label = within((await screen.findByText('Ants')).closest('li')!).getByText('Nature') // the chip
    expect(label).toHaveClass('text-text-default')
    expect(label).not.toHaveClass('text-text-muted')
  })

  it('shows each honor name and its price', async () => {
    // catches: a missing or unformatted price
    serve([honor('Knot Tying', 'Recreation')])
    render(<CatalogueWithCart />)
    const row = (await screen.findByText('Knot Tying')).closest('li')!
    expect(row).toHaveTextContent(/RM\s?4\.00/)
  })

  it('shows every card its name, Category label, price and Add, with no stepper', async () => {
    // catches: a stepper on every card before anything is picked, or a card missing one of its four parts
    serve([honor('Ants', 'Nature'), honor('Knot Tying', 'Recreation')])
    render(<CatalogueWithCart />)
    await screen.findByText('Ants')
    const cards = screen.getAllByRole('listitem')
    expect(cards).toHaveLength(2)
    const ants = within(cards[0])
    expect(ants.getByText('Ants')).toBeInTheDocument()
    expect(ants.getByText('Nature')).toBeInTheDocument()
    expect(cards[0]).toHaveTextContent(/RM\s?4\.00/)
    expect(ants.getByRole('button', { name: 'Add Ants' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /^Quantity of / })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Knot Tying' })).toBeInTheDocument()
  })

  it('keeps a card in the cart showing its stepper after a search hides and shows it again', async () => {
    // catches: a card that forgets its quantity when the search unmounts it
    serve([honor('Ants', 'Nature'), honor('Knot Tying', 'Recreation')])
    render(<CatalogueWithCart />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add Ants' }))
    const search = screen.getByRole('searchbox', { name: 'Search items' })
    fireEvent.change(search, { target: { value: 'knot' } }) // Ants is hidden
    expect(screen.queryByText('Ants')).not.toBeInTheDocument()
    fireEvent.change(search, { target: { value: '' } }) // and shown again
    expect(screen.getByRole('textbox', { name: 'Quantity of Ants' })).toHaveValue('1')
    expect(screen.queryByRole('button', { name: 'Add Ants' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Knot Tying' })).toBeInTheDocument()
  })

  it('counts the honors, singular for one', async () => {
    // catches: "1 honors" and a count that includes more than the loaded honors
    serve([honor('Knot Tying', 'Recreation')])
    render(<CatalogueWithCart />)
    expect(await screen.findByText('1 item')).toBeInTheDocument()
  })

  it('renders all 299 honors at once, with no Load more and lazy pictures', async () => {
    // catches: pagination or a Load more button creeping back, rows dropped at full size, or pictures that load eagerly
    serve(Array.from({ length: 299 }, (_, i) => honor(`Honor ${i}`, 'Nature', `patches/${i}.png`)))
    render(<CatalogueWithCart />)
    expect(await screen.findByText('299 items')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(299)
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument()
    const pictures = Array.from(screen.getByRole('list').querySelectorAll('img')) // decorative pictures have no role to query by
    expect(pictures).toHaveLength(299)
    expect(pictures.every((picture) => picture.getAttribute('loading') === 'lazy')).toBe(true)
  })

  it('renders every row when every image is null', async () => {
    // catches: rows dropped or broken when no picture exists
    serve([honor('A', 'Nature'), honor('B', 'Nature'), honor('C', 'Nature')])
    render(<CatalogueWithCart />)
    await screen.findByText('A')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getAllByTestId('category-mark')).toHaveLength(3)
  })

  it('says so when the shop lists no honor', async () => {
    // catches: a blank page when the list is empty
    serve([])
    render(<CatalogueWithCart />)
    expect(await screen.findByText('Nothing is in the shop yet. Check back soon.')).toBeInTheDocument()
  })

  it('shows nothing for 300 ms, then the toolbar box, the count line box and 6 card shapes with picture, name, label, price and button bars', () => {
    // catches: a skeleton flash on fast loads, or a skeleton missing the count line or label bar so rows jump when data arrives
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    ) // requests that never answer
    render(<CatalogueWithCart />)
    expect(screen.queryByTestId('catalogue-skeleton')).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(300)
    })
    const children = Array.from(screen.getByTestId('catalogue-skeleton').children)
    expect(children[0]).toBe(screen.getByTestId('catalogue-skeleton-toolbar')) // room for the search box and category filter
    expect(children[1]).toBe(screen.getByTestId('catalogue-skeleton-count')) // room for the count line
    const rows = screen.getAllByTestId('catalogue-skeleton-row')
    expect(rows).toHaveLength(6)
    expect(children.slice(2)).toHaveLength(1) // the rows sit in one list box after the count line
    for (const row of rows) {
      expect(
        Array.from(row.querySelectorAll('[data-skeleton-part]')).map((part) => part.getAttribute('data-skeleton-part')),
      ).toEqual(['picture', 'name', 'label', 'price', 'button']) // the card's five parts, top to bottom
    }
  })

  it('gives the skeleton count box and the real count line the same box classes', async () => {
    // catches: the 36 px drop when the count line and its skeleton stop sharing a box
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    ) // requests that never answer
    const first = render(<CatalogueWithCart />)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByTestId('catalogue-skeleton-count')).toHaveClass('mt-3', 'min-h-6')
    const skeletonCardClass = screen.getAllByTestId('catalogue-skeleton-row')[0].className // the skeleton card's box
    const skeletonGridClass = screen.getByTestId('catalogue-skeleton-grid').className // the skeleton's grid
    first.unmount()
    vi.unstubAllGlobals() // drop the never-answering fetch
    serve([honor('Knot Tying', 'Recreation')])
    render(<CatalogueWithCart />)
    expect(await screen.findByText('1 item')).toHaveClass('mt-3', 'min-h-6')
    expect(screen.getByRole('listitem').className).toBe(skeletonCardClass) // the honor card and the skeleton card share one box
    expect(screen.getByRole('list').className).toBe(skeletonGridClass) // and the grid
  })

  it('shows the error and Try again, and Try again shows the list', async () => {
    // catches: a dead end after a failed load
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch')) // the first request fails
      .mockImplementation(async () => new Response(JSON.stringify(shopBody([honor('Knot Tying', 'Recreation')])))) // the retry succeeds
    vi.stubGlobal('fetch', fetchFn)
    render(<CatalogueWithCart />)
    expect(
      await screen.findByText("We couldn't load the shop. Check your connection and try again."),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Knot Tying')).toBeInTheDocument()
  })

  it('keeps the toolbar space on the error state so the message does not jump after the skeleton', async () => {
    // catches: the error message landing 61 px above where the skeleton stood
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))) // every request fails
    render(<CatalogueWithCart />)
    await screen.findByText("We couldn't load the shop. Check your connection and try again.")
    expect(screen.getByTestId('catalogue-toolbar-space')).toHaveClass('border-b', 'px-4', 'py-2') // the toolbar's box, empty
    expect(screen.getByText("We couldn't load the shop. Check your connection and try again.")).toHaveClass(
      'mt-3',
      'min-h-6',
    ) // the count line's box
  })

  it('keeps the toolbar space when the shop lists no honor', async () => {
    // catches: the empty message landing 61 px above where the skeleton stood
    serve([])
    render(<CatalogueWithCart />)
    await screen.findByText('Nothing is in the shop yet. Check back soon.')
    expect(screen.getByTestId('catalogue-toolbar-space')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Category' })).not.toBeInTheDocument() // no real toolbar to filter with
  })

  it('has no toolbar space once the real toolbar shows', async () => {
    // catches: a blank 61 px band above the real toolbar
    serve([honor('Knot Tying', 'Recreation')])
    render(<CatalogueWithCart />)
    await screen.findByText('Knot Tying')
    expect(screen.queryByTestId('catalogue-toolbar-space')).not.toBeInTheDocument()
  })

  describe('search and category filter', () => {
    /** Serves a small mixed catalogue and renders the screen once the list is up. */
    async function renderMixed() {
      serve([
        honor('Knot Tying', 'Recreation'),
        honor('Braiding - Advanced', 'Arts and Crafts'),
        honor('Leaves', 'Nature'),
        honor('Ants', 'Nature'),
      ])
      render(<CatalogueWithCart />)
      await screen.findByText('Ants')
    }

    /**
     * Types into the search box.
     * @param value the text to put in the box
     */
    function type(value: string) {
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search items' }), { target: { value } })
    }

    /**
     * Chooses an option in the category filter the way a buyer would, by its text.
     * @param name the option text, such as "Nature" or "All categories"
     */
    function chooseCategory(name: string) {
      const control = screen.getByRole('combobox', { name: 'Category' }) // the closed control
      const option = within(control).getByRole('option', { name }) as HTMLOptionElement // the option the buyer picks
      fireEvent.change(control, { target: { value: option.value } })
    }

    it('shows only matching rows for "knot" and counts them', async () => {
      // catches: a search that keeps the full-list count or other rows
      await renderMixed()
      type('knot')
      expect(screen.getByText('Knot Tying')).toBeInTheDocument()
      expect(screen.queryByText('Leaves')).not.toBeInTheDocument()
      expect(screen.getByText('1 item matches')).toBeInTheDocument()
    })

    it('finds "Braiding - Advanced" from "braiding adv"', async () => {
      // catches: search that needs the whole name or the exact word order
      await renderMixed()
      type('braiding adv')
      expect(screen.getByText('Braiding - Advanced')).toBeInTheDocument()
    })

    it('says "2 items match" in the plural', async () => {
      // catches: a plural count line reading "2 item matches"
      await renderMixed()
      chooseCategory('Nature')
      expect(screen.getByText('2 items match')).toBeInTheDocument()
    })

    it('lists All categories and the categories A to Z, with All categories chosen at the start', async () => {
      // catches: an option for a category the shop lacks, wrong order, or no starting selection
      await renderMixed()
      const control = screen.getByRole('combobox', { name: 'Category' })
      expect(
        within(control)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['All categories', 'Arts and Crafts', 'Nature', 'Recreation'])
      expect(control).toHaveDisplayValue('All categories')
    })

    it('choosing Nature shows only Nature rows and choosing All categories brings every row back', async () => {
      // catches: a category filter that does not filter, or an All option that does not reset
      await renderMixed()
      chooseCategory('Nature')
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveDisplayValue('Nature')
      expect(screen.getAllByRole('listitem').map((li) => li.textContent?.replace(/NatureRM.*/, ''))).toEqual([
        'Ants',
        'Leaves',
      ])
      chooseCategory('All categories')
      expect(screen.getAllByRole('listitem')).toHaveLength(4)
      expect(screen.getByText('4 items')).toBeInTheDocument()
    })

    /**
     * Makes every element report the same box, so the toolbar is 100 px tall and the list top is where the test says.
     * @param top the distance of every element's top edge from the viewport top, in px
     */
    function placeBoxes(top: number) {
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top, height: 100 } as DOMRect) // restored by restoreAllMocks
    }

    it('scrolls the list back to its top when a category is chosen while the top is under the toolbar', async () => {
      // catches: a buyer left halfway down a new, shorter list
      await renderMixed()
      placeBoxes(40) // list top 40 px, toolbar 100 px: hidden
      chooseCategory('Nature')
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
    })

    it('does not scroll when the list top is already below the toolbar', async () => {
      // catches: a page that jumps on every choice, or a guard that always scrolls
      await renderMixed()
      placeBoxes(300) // list top 300 px, toolbar 100 px: visible
      chooseCategory('Nature')
      expect(scrollIntoView).not.toHaveBeenCalled()
    })

    it('scrolls when the list top is hidden by a taller toolbar but would clear a fixed 128 px', async () => {
      // catches: a guessed toolbar height that fails at a larger root font size
      await renderMixed()
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 140, height: 160 } as DOMRect) // 160 px toolbar at a 20 px root
      chooseCategory('Nature')
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
    })

    it('does not scroll when typing', async () => {
      // catches: the page jumping under the buyer's hands on every keystroke
      await renderMixed()
      placeBoxes(40) // list top hidden under the toolbar
      type('kn')
      expect(scrollIntoView).not.toHaveBeenCalled()
    })

    it('shows the no-match message with the category, and Clear filters restores everything and focuses the box', async () => {
      // catches: a dead end when search and category together match nothing
      await renderMixed()
      chooseCategory('Nature')
      type('knot')
      expect(screen.getByText('No items match "knot" in Nature.')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
      const box = screen.getByRole('searchbox', { name: 'Search items' })
      expect(box).toHaveValue('')
      expect(box).toHaveFocus()
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveDisplayValue('All categories')
      expect(screen.getAllByRole('listitem')).toHaveLength(4)
    })

    it('leaves out the category part of the message when only the search matches nothing', async () => {
      // catches: " in null" or " in All" in the message
      await renderMixed()
      type('zzz')
      expect(screen.getByText('No items match "zzz".')).toBeInTheDocument()
    })

    it('trims the outer spaces of the query in the no-match message', async () => {
      // catches: a message reading No items match "  zzz ." with the typed spaces
      await renderMixed()
      type('  zzz ')
      expect(screen.getByText('No items match "zzz".')).toBeInTheDocument()
    })

    it('treats a query of spaces as no search', async () => {
      // catches: a blank box hiding rows or switching the count to "match"
      await renderMixed()
      type('   ')
      expect(screen.getAllByRole('listitem')).toHaveLength(4)
      expect(screen.getByText('4 items')).toBeInTheDocument()
    })
  })
  describe('category from the address', () => {
    /** Serves Nature and Recreation items. */
    function serveTwoCategories() {
      serve([honor('Ants', 'Nature'), honor('Knot Tying', 'Recreation')]) // one per category
    }

    it('shows only the category it is given', async () => {
      // catches: the address's category not reaching the filter
      serveTwoCategories()
      render(<CatalogueWithCart initialCategory="Nature" />)
      await screen.findByText('Ants')
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveDisplayValue('Nature')
      expect(screen.queryByText('Knot Tying')).not.toBeInTheDocument()
    })

    it.each([['Nope'], [null], ['']])('falls back to All categories for %j', async (category) => {
      // catches: an unvalidated address hiding every item
      serveTwoCategories()
      render(<CatalogueWithCart initialCategory={category} />)
      await screen.findByText('Ants')
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveDisplayValue('All categories')
      expect(screen.getByText('Knot Tying')).toBeInTheDocument()
    })

    it('reports a dropdown pick and Clear filters through onSelectCategory', async () => {
      // catches: the screen keeping the category to itself so the address never changes
      serveTwoCategories()
      const onSelect = vi.fn()
      render(<CatalogueWithCart onSelect={onSelect} />)
      await screen.findByText('Ants')
      fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'Recreation' } })
      expect(onSelect).toHaveBeenLastCalledWith('Recreation')
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search items' }), { target: { value: 'zzz' } })
      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
      expect(onSelect).toHaveBeenLastCalledWith(null)
      expect(screen.getByRole('searchbox', { name: 'Search items' })).toHaveValue('')
    })
  })
})
