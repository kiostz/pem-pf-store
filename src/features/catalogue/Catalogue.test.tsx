// Tests for Catalogue: loading, error, empty and ready states, the stock-first list, search and the category filter, with fetch mocked at the boundary.

import { useState } from 'react' // the stand-in address
import { act, fireEvent, render, screen, within } from '@testing-library/react' // render and query the screen
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import { CART_STORAGE_KEY } from '@/features/cart/cart-storage.ts' // where the cart is kept
import { CartProvider } from '@/features/cart/CartProvider.tsx' // the cart state the steppers edit
import type { Item } from '@/shared/data/types.ts' // the shape of an item
import { item as makeItem, shopBody, shopFetch } from '@/test/shop-fetch.ts' // the item builder and the /shop fake
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
    // the cart provider gets the loaded items
    <CartProvider items={data.state.status === 'ready' ? data.state.items : null}>
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
 * Builds one item for the fake shop.
 * @param name display name
 * @param category its category
 * @param image the picture path, or null for the category mark
 * @return an item as the shop lists it
 */
function item(name: string, category: string, image: string | null = null) {
  return makeItem(name.toLowerCase().replace(/\W+/g, '-'), name, { category, image }) // image null by default: the row shows its category mark
}

/**
 * Makes the global fetch answer with the /shop body for these items.
 * @param items the items the shop lists
 */
function serve(items: Item[]) { // serve these items
  vi.stubGlobal('fetch', shopFetch(items)) // one answer for the one request
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
  it('lists one flat list with no headings, in-stock items first and then Sold out, each A to Z across categories', async () => { // one flat stock-first list across categories
    // catches: file order or category grouping leaking into the list, a heading left in it, or Sold out items mixed among the stocked ones
    serve([
      makeItem('leaves', 'Leaves', { category: 'Nature', stock: 0 }), // Sold out
      makeItem('knot-tying', 'Knot Tying', { category: 'Recreation', stock: 3 }), // in stock
      makeItem('ants', 'Ants', { category: 'Nature', stock: 0 }), // Sold out
      makeItem('braiding', 'Braiding - Advanced', { category: 'Arts and Crafts', stock: 1 }), // in stock
    ])
    render(<CatalogueWithCart />)
    const list = await screen.findByRole('list')
    expect(within(list).queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.getAllByRole('list')).toHaveLength(1)
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent?.replace(/(Nature|Recreation|Arts and Crafts)?RM.*/, '')),
    ).toEqual(['Braiding - Advanced', 'Knot Tying', 'Ants', 'Leaves']) // stock group A to Z, then Sold out A to Z
  })

  it('keeps the stock-first order inside a search', async () => { // order inside a search
    // catches: the order applied before filtering and lost, or only for the full list
    serve([ // four items, one not matching
      makeItem('barn', 'Barn', { stock: 0 }), // Sold out match
      makeItem('arrow', 'Arrow', { stock: 0 }), // Sold out match
      makeItem('marsh', 'Marsh', { stock: 2 }), // stocked match
      makeItem('zebra', 'Zebra', { stock: 5 }), // no match
    ])
    render(<CatalogueWithCart />) // the screen under test
    await screen.findByText('Barn') // wait for the load
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search items' }), { target: { value: 'ar' } }) // matches Barn, Arrow, Marsh
    expect(screen.getAllByRole('listitem').map((li) => li.textContent?.replace(/Recreation.*/, ''))).toEqual(['Marsh', 'Arrow', 'Barn']) // stocked first, then A to Z
  })

  it('keeps the stock-first order inside a category', async () => { // order inside a category
    // catches: the order lost when a category is picked
    serve([ // two honors and a shirt
      makeItem('a', 'Ants', { category: 'Honors', stock: 0 }), // Sold out
      makeItem('b', 'Bees', { category: 'Honors', stock: 4 }), // stocked
      makeItem('c', 'Cap', { category: 'Shirts', stock: 4 }), // other category
    ])
    render(<CatalogueWithCart initialCategory="Honors" />) // opened on Honors
    await screen.findByText('Bees') // wait for the load
    expect(screen.getAllByRole('listitem').map((li) => li.textContent?.replace(/Honors.*/, ''))).toEqual(['Bees', 'Ants']) // stocked first
  })

  it('shows each card its category label, and the label is not a button', async () => {
    // catches: a missing label, or a label that looks and acts like a control
    serve([item('Ants', 'Nature'), item('Knot Tying', 'Recreation')]) // the shop lists these items
    render(<CatalogueWithCart />)
    const row = (await screen.findByText('Ants')).closest('li')!
    expect(within(row).getByText('Nature')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Nature' })).not.toBeInTheDocument() // Add is the card's only button
    expect(within(row).queryByRole('link')).not.toBeInTheDocument()
  })

  it('with the Honors and Accessories data, labels a card Honors · Nature, filters on those two and shows All for an old Nature link', async () => { // the new category names
    // catches: a label missing its subcategory, or an old ?category=Nature link hiding every item
    serve([ // a /shop answer with the new category names
      makeItem('knots', 'Knot Tying', { category: 'Honors', subcategory: 'Nature' }), // an honor with a subcategory
      makeItem('scarf', 'Scarf', { category: 'Accessories' }), // an accessory with none
    ]) // the shop lists these items
    render(<CatalogueWithCart initialCategory="Nature" />) // an old link: Nature is no longer a category
    const row = (await screen.findByText('Knot Tying')).closest('li')! // the honor's card
    expect(within(row).getByText('Honors · Nature')).toBeInTheDocument() // the label is the category and subcategory
    expect(within(row).queryByRole('button', { name: /Honors/ })).not.toBeInTheDocument() // still not a control
    expect(within((await screen.findByText('Scarf')).closest('li')!).getByText('Accessories')).toBeInTheDocument() // no subcategory: the category alone
    const control = screen.getByRole('combobox', { name: 'Category' }) // the filter
    expect(within(control).getAllByRole('option').map((option) => option.textContent)).toEqual(['All categories', 'Accessories', 'Honors']) // only categories present
    expect(control).toHaveDisplayValue('All categories') // the old link falls back
    expect(screen.getByText('Scarf')).toBeInTheDocument() // nothing was hidden
  })

  it('keeps the grid one column below 348 px, where two columns are too narrow for the 134 px stepper', async () => {
    // catches: two columns on a 320 px phone, where the stepper sticks out of its card
    serve([item('Ants', 'Nature')]) // the shop lists these items
    render(<CatalogueWithCart />)
    await screen.findByText('Ants')
    const classes = screen.getByRole('list').className.split(' ') // the grid's utility classes
    expect(classes).toContain('grid-cols-1') // one column by default
    expect(classes).toContain('min-[348px]:grid-cols-2') // two only from 348 px
    expect(classes).not.toContain('grid-cols-2') // never two at every width
  })

  it('draws the category label in the default text colour, not the muted grey that fails contrast on its chip', async () => {
    // catches: muted text (3.4:1) on the light chip
    serve([item('Ants', 'Nature')]) // the shop lists these items
    render(<CatalogueWithCart />)
    const label = within((await screen.findByText('Ants')).closest('li')!).getByText('Nature') // the chip
    expect(label).toHaveClass('text-text-default')
    expect(label).not.toHaveClass('text-text-muted')
  })

  it('shows each item name and its price', async () => { // each card shows name and price
    // catches: a missing or unformatted price
    serve([item('Knot Tying', 'Recreation')]) // the shop lists these items
    render(<CatalogueWithCart />)
    const row = (await screen.findByText('Knot Tying')).closest('li')!
    expect(row).toHaveTextContent(/RM\s?4\.00/)
  })

  it('shows every card its name, Category label, price and Add, with no stepper', async () => {
    // catches: a stepper on every card before anything is picked, or a card missing one of its four parts
    serve([item('Ants', 'Nature'), item('Knot Tying', 'Recreation')]) // the shop lists these items
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
    serve([item('Ants', 'Nature'), item('Knot Tying', 'Recreation')]) // the shop lists these items
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

  it('counts the items, singular for one', async () => { // the count reads singular for one
    // catches: "1 items" and a count that includes more than the loaded items
    serve([item('Knot Tying', 'Recreation')]) // the shop lists these items
    render(<CatalogueWithCart />)
    expect(await screen.findByText('1 item')).toBeInTheDocument()
  })

  it('renders all 299 items at once, with no Load more and lazy pictures', async () => { // all 299 items render at once with lazy pictures
    // catches: pagination or a Load more button creeping back, rows dropped at full size, or pictures that load eagerly
    serve(Array.from({ length: 299 }, (_, i) => item(`Item ${i}`, 'Nature', `items/item-${i}.png`))) // 299 items with R2 keys
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
    serve([item('A', 'Nature'), item('B', 'Nature'), item('C', 'Nature')]) // the shop lists these items
    render(<CatalogueWithCart />)
    await screen.findByText('A')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getAllByTestId('category-mark')).toHaveLength(3)
  })

  it('says so when the shop lists no item', async () => { // the message for a shop with no items
    // catches: a blank page when the list is empty
    serve([])
    render(<CatalogueWithCart />)
    expect(await screen.findByText('Nothing is in the shop yet. Check back soon.')).toBeInTheDocument()
  })

  it('shows nothing for 300 ms, then the toolbar box, the count line box and 6 card shapes with picture, name, label, price, stock and button bars', () => {
    // catches: a skeleton flash on fast loads, or a skeleton missing the count line, label or stock bar so rows jump when data arrives
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
      ).toEqual(['picture', 'name', 'label', 'price', 'stock', 'button']) // the card's six parts, top to bottom, with the stock line's bar so nothing shifts when stock arrives
    }
  })

  it('puts the skeleton in a status region that says "Loading the shop", pulsing, and removes it when the shop is ready', async () => {
    // catches: a skeleton a screen reader never hears about, a static grey block, or a skeleton left over after the data arrives
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    ) // requests that never answer
    const first = render(<CatalogueWithCart />)
    const status = screen.getByRole('status') // in the page from the first paint, empty
    expect(status).toBeEmptyDOMElement()
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByRole('status')).toBe(status) // the same node, so the text is announced
    expect(status).toHaveTextContent('Loading the shop')
    expect(screen.getByTestId('catalogue-skeleton')).toHaveAttribute('aria-hidden', 'true') // the bars are for the eye
    expect(screen.getByTestId('catalogue-skeleton')).toHaveClass('animate-skeleton')
    first.unmount()
    vi.unstubAllGlobals() // drop the never-answering fetch
    serve([item('Knot Tying', 'Recreation')]) // one test item the shop lists
    render(<CatalogueWithCart />)
    await screen.findByText('Knot Tying')
    expect(screen.queryByText('Loading the shop')).not.toBeInTheDocument()
    expect(screen.queryByTestId('catalogue-skeleton')).not.toBeInTheDocument()
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
    serve([item('Knot Tying', 'Recreation')]) // one test item the shop lists
    render(<CatalogueWithCart />)
    expect(await screen.findByText('1 item')).toHaveClass('mt-3', 'min-h-6')
    expect(screen.getByRole('listitem').className).toBe(skeletonCardClass) // the item card and the skeleton card share one box
    expect(screen.getByRole('list').className).toBe(skeletonGridClass) // and the grid
  })

  it('shows the error and Try again, and Try again shows the list', async () => {
    // catches: a dead end after a failed load
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch')) // the first request fails
      .mockImplementation(async () => new Response(JSON.stringify(shopBody([item('Knot Tying', 'Recreation')])))) // the retry succeeds
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

  it('keeps the toolbar space when the shop lists no item', async () => { // the toolbar keeps its space with no items
    // catches: the empty message landing 61 px above where the skeleton stood
    serve([])
    render(<CatalogueWithCart />)
    await screen.findByText('Nothing is in the shop yet. Check back soon.')
    expect(screen.getByTestId('catalogue-toolbar-space')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Category' })).not.toBeInTheDocument() // no real toolbar to filter with
  })

  it('has no toolbar space once the real toolbar shows', async () => {
    // catches: a blank 61 px band above the real toolbar
    serve([item('Knot Tying', 'Recreation')]) // the shop lists these items
    render(<CatalogueWithCart />)
    await screen.findByText('Knot Tying')
    expect(screen.queryByTestId('catalogue-toolbar-space')).not.toBeInTheDocument()
  })

  describe('search and category filter', () => {
    /** Serves a small mixed catalogue and renders the screen once the list is up. */
    async function renderMixed() {
      serve([
        item('Knot Tying', 'Recreation'), // one test item the shop lists
        item('Braiding - Advanced', 'Arts and Crafts'), // one test item the shop lists
        item('Leaves', 'Nature'), // one test item the shop lists
        item('Ants', 'Nature'), // one test item the shop lists
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
      serve([item('Ants', 'Nature'), item('Knot Tying', 'Recreation')]) // one per category
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

describe('Catalogue stock', () => {
  /**
   * Builds an item with a stock.
   * @param name display name
   * @param stock how many are left
   * @return the item
   */
  const stocked = (name: string, stock: number) => makeItem(name.toLowerCase().replace(/\W+/g, '-'), name, { stock }) // an item with this stock, its id made from its name

  it('shows "Stock: N left" under the price, with a thousands separator, on every card', async () => {
    // catches: a missing stock line, or 1200 written without its separator
    serve([stocked('Knot Tying', 12), stocked('Ants', 1200), stocked('Birds', 0)])
    render(<CatalogueWithCart />)
    expect(await screen.findByText('Stock: 12 left')).toBeInTheDocument()
    expect(screen.getByText('Stock: 1,200 left')).toBeInTheDocument()
    expect(screen.getByText('Stock: 0 left')).toBeInTheDocument() // a Sold out card keeps its stock line
  })

  it('shows a stock-0 card Sold out with no Add, greyed, and no new tab stop', async () => {
    // catches: an Add on a Sold out card, a card not greyed, or a focusable Sold out pill
    serve([stocked('Ants', 0), stocked('Knot Tying', 12)])
    render(<CatalogueWithCart />)
    await screen.findByText('Knot Tying')
    expect(screen.queryByRole('button', { name: 'Add Ants' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Knot Tying' })).toBeInTheDocument()
    const card = screen.getByText('Ants').closest('li')! // the Sold out card
    const pill = within(card).getByText('Sold out')
    expect(pill.tagName).toBe('SPAN') // not a control
    expect(within(card).queryAllByRole('button')).toHaveLength(0)
    expect(card.querySelector('.grayscale.opacity-50')).not.toBeNull() // the picture, greyed
    expect(screen.getAllByRole('button').filter((button) => card.contains(button))).toHaveLength(0)
    expect(within(card).getByText('Ants')).not.toHaveClass('opacity-50') // the text keeps full strength for contrast
  })

  it('stops + at the stock with its reason and commits a typed number as the stock', async () => {
    // catches: a card that orders more than is left
    serve([stocked('Knot Tying', 3)])
    render(<CatalogueWithCart />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add Knot Tying' }))
    fireEvent.click(screen.getByRole('button', { name: 'One more Knot Tying' }))
    fireEvent.click(screen.getByRole('button', { name: 'One more Knot Tying' }))
    expect(screen.getByRole('button', { name: '3 is the most of Knot Tying' })).toHaveAttribute('aria-disabled', 'true')
    const field = screen.getByRole('textbox', { name: 'Quantity of Knot Tying' })
    fireEvent.change(field, { target: { value: '50' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(field).toHaveValue('3')
  })

  it('caps at 99 when the stock is 150', async () => {
    // catches: the stock replacing the 99 limit
    serve([stocked('Knot Tying', 150)])
    render(<CatalogueWithCart />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add Knot Tying' }))
    const field = screen.getByRole('textbox', { name: 'Quantity of Knot Tying' })
    fireEvent.change(field, { target: { value: '120' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(field).toHaveValue('99')
  })

  it('shows Sold out on the card of an item in the cart whose stock is now 0, and leaves the stored cart alone', async () => {
    // catches: a stepper on a Sold out card, or the shop quietly rewriting the buyer's cart
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ version: 1, quantities: { 'knot-tying': 4 } })) // the saved cart
    serve([stocked('Knot Tying', 0)])
    render(<CatalogueWithCart />)
    expect(await screen.findByText('Sold out')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toContain('"knot-tying":4')
  })

  it('shows no skeleton once the shop is ready', async () => {
    // catches: a skeleton left under the grid
    serve([stocked('Knot Tying', 12)])
    render(<CatalogueWithCart />)
    await screen.findByText('Knot Tying')
    expect(screen.queryByTestId('catalogue-skeleton')).not.toBeInTheDocument()
  })

  it('says the shop is busy, with Try again, after a refused (429) load', async () => {
    // catches: a rate-limited buyer told the connection is bad
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"rate-limited"}', { status: 429 })))
    render(<CatalogueWithCart />)
    expect(await screen.findByText('The shop is busy right now. Try again in a minute.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
