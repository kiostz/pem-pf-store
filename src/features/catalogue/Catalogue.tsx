// The catalogue screen: a sticky search, category and Subcategory filter toolbar over one stock-first, then A to Z grid of item cards, plus its loading, error, empty and no-match states.

import { useLayoutEffect, useRef, useState } from 'react' // the filter, handles on the list and the search box, and the scroll after a pick has drawn
import { CategoryFilter } from './CategoryFilter.tsx' // the category filter
import { categoryNames, filterItems, shopOrder, subcategoryNames } from './filter.ts' // search, category filter, the chips' names and the Shop's order
import { PILL_BOX } from '@/shared/ui/button-box.ts' // the pill shape of the actions
import { loadErrorText } from '@/shared/ui/load-error-text.ts' // the failed-load message by reason
import { LoadingStatus } from '@/shared/ui/LoadingStatus.tsx' // what a screen reader hears while loading
import { SKELETON_PULSE } from '@/shared/ui/skeleton-box.ts' // the skeleton's pulse
import { ItemCard } from './ItemCard.tsx' // one card
import { CARD_BOX, CARD_GRID_BOX } from './item-card-box.ts' // the grid and card boxes, shared with the skeleton
import { SearchBox } from './SearchBox.tsx' // the labelled search input
import { SubcategoryFilter } from './SubcategoryFilter.tsx' // the chip row
import type { CatalogueLoad } from './use-catalogue-data.ts' // the load, made by the app

const SKELETON_ROWS = 6 // how many skeleton cards the loading state shows
const TOOLBAR_BOX = 'border-border-subtle bg-bg-app -mx-4 -mt-6 flex flex-col gap-2 border-b px-4 py-2' // the toolbar's box, shared with its skeleton so the list does not jump
const TOOLBAR_ROW = 'h-11' // the one 44 px row the skeleton stands in for
const COUNT_BOX = 'mt-3 min-h-6' // the count line's box, shared by the real line and its skeleton
const LIST_BOX = 'mt-3' // the grid's top, shared by the real list and the skeleton cards

/**
 * The buyer's list of items.
 * @param data the load: state, skeleton gate and retry
 * @param category the category the address names, or null; validated here against the data
 * @param subcategory the subcategory the address names, or null; used only when the category holds it
 * @param onSelectCategory called with the category picked, or null for All categories
 * @param onSelectSubcategory called with the subcategory picked, or null for All
 * @return the toolbar, the status line, the retry or Clear filters button, and the stock-first list
 */
export function Catalogue({
  data, // the load
  category: requestedCategory, // the address's category, not yet checked
  subcategory: requestedSubcategory, // the address's subcategory, not yet checked
  onSelectCategory, // the app puts the pick in the address
  onSelectSubcategory, // the app puts the chip pick in the address
}: {
  data: CatalogueLoad // the load: state, skeleton gate and retry
  category: string | null // as read from the address
  subcategory: string | null // as read from the address
  onSelectCategory: (next: string | null) => void // reports a pick
  onSelectSubcategory: (next: string | null) => void // reports a chip pick
}) {
  const { state, showSkeleton, retry } = data // load state, skeleton gate and retry
  const [query, setQuery] = useState('') // what the buyer typed
  const searchRef = useRef<HTMLInputElement>(null) // the search box, focused by Clear filters
  const listRef = useRef<HTMLDivElement>(null) // the list, scrolled to its top on a category change
  const toolbarRef = useRef<HTMLDivElement>(null) // the sticky toolbar, measured so the list top can clear it
  const allItems = state.status === 'ready' ? state.items : [] // every item in the file
  const switchedOn = filterItems(allItems, { query: '', category: null, subcategory: null }) // what the buyer may see at all
  const category = requestedCategory !== null && categoryNames(allItems).includes(requestedCategory) ? requestedCategory : null // an unknown, blank or not yet loaded category is All categories
  const subcategories = category === null ? [] : subcategoryNames(allItems, category) // the chips, none for a category without subcategories
  const subcategory = requestedSubcategory !== null && subcategories.includes(requestedSubcategory) ? requestedSubcategory : null // a stray, blank or not yet loaded subcategory is All
  const matches = filterItems(allItems, { query, category, subcategory }) // what the search, the category and the subcategory leave
  const sorted = shopOrder(matches) // in stock first, then Sold out, each A to Z
  const filtering = query.trim() !== '' || category !== null || subcategory !== null // whether any filter is active
  const countText = `${matches.length} ${matches.length === 1 ? 'item' : 'items'}${filtering ? (matches.length === 1 ? ' matches' : ' match') : ''}` // "299 items", "12 items match", "1 item matches"

  const scrollAfterPick = useRef(false) // set by a pick, read once the new filter has drawn, so the toolbar is measured with or without its chip row

  // After a pick has drawn, return the list to its top, clear of the toolbar as it is now, when its top is hidden under it.
  useLayoutEffect(() => { // runs after every draw
    if (!scrollAfterPick.current) return // nothing was picked since the last draw
    scrollAfterPick.current = false // only this draw
    const list = listRef.current // the list element, if it is on screen
    const toolbarHeight = toolbarRef.current?.getBoundingClientRect().height ?? 0 // measured, so any root font size works
    if (list && list.getBoundingClientRect().top < toolbarHeight) {
      // the list top is hidden under the toolbar
      list.style.scrollMarginTop = `${toolbarHeight}px` // stop the list top just below the toolbar
      list.scrollIntoView() // only when the top is hidden under the toolbar
    }
  }) // every draw: cheap, and it must see the draw a pick causes

  /**
   * Chooses a category and returns the list to its top.
   * @param next the category chosen, or null for All categories
   */
  const selectCategory = (next: string | null) => { // the dropdown's callback
    onSelectCategory(next) // the app puts it in the address, and the filter follows
    scrollAfterPick.current = true // scroll once the new list and toolbar have drawn
  }

  /**
   * Chooses a subcategory and returns the list to its top.
   * @param next the subcategory chosen, or null for All
   */
  const selectSubcategory = (next: string | null) => { // the chip row's callback
    onSelectSubcategory(next) // the app puts it in the address, and the filter follows
    scrollAfterPick.current = true // scroll once the new list has drawn
  }

  /** Empties the search, selects All categories and puts the cursor in the search box. */
  const clearFilters = () => {
    setQuery('') // empty the box
    onSelectCategory(null) // All categories
    searchRef.current?.focus() // ready to type again
  }
  return (
    <>
      {/* Search and category stay at the top while the list scrolls; shown once there is something to filter. */}
      {state.status === 'ready' && switchedOn.length > 0 && (
        <div
          ref={toolbarRef} // measured on a category choice
          className={`${TOOLBAR_BOX} sticky top-0 z-10`} // pinned to the top, full width
        >
          {/* The search row: the search box takes the width the category filter leaves. */}
          {/* Row one is a flex line of its own now that the toolbar is a column. */}
          <div className="flex items-start gap-2">
            {/* The search box's share of the row. */}
            <div className="min-w-0 flex-1">
              <SearchBox value={query} onChange={setQuery} ref={searchRef} /> {/* the typed query */}
            </div>
            <CategoryFilter
              categories={categoryNames(allItems)} // All categories plus these
              selected={category} // the chosen category
              onSelect={selectCategory} // filter and scroll
            />
          </div>
          {/* The second row, 8 px under the search row, only when the picked category has subcategories. */}
          {subcategories.length > 0 && (
            <SubcategoryFilter
              subcategories={subcategories} // A to Z, from the listed items
              selected={subcategory} // the checked pick
              onSelect={selectSubcategory} // filter and scroll
            />
          )}
        </div>
      )}
      {/* On the error and empty states the toolbar's box stays as an empty band, so the message lands where the skeleton stood. */}
      {(state.status === 'error' || (state.status === 'ready' && switchedOn.length === 0)) && (
        <div data-testid="catalogue-toolbar-space" aria-hidden="true" className={TOOLBAR_BOX}>
          {/* The one 44 px row the toolbar would fill. */}
          <div className={`${TOOLBAR_ROW} w-full`} />
        </div>
      )}
      {/* Skeleton shaped like the final toolbar, count line and rows, shown only after the loader delay; the status line tells a screen reader, the pulsing bars are for the eye. */}
      <LoadingStatus loading={showSkeleton} /> {/* always mounted, so its text is announced when the skeleton appears */}
      {showSkeleton && (
        <>
          <div data-testid="catalogue-skeleton" aria-hidden="true" className={SKELETON_PULSE}>
            {/* Stands where the toolbar will be: the same box, one 44 px row. */}
            <div data-testid="catalogue-skeleton-toolbar" className={TOOLBAR_BOX}>
              {/* Stands where the search box and the category filter will be. */}
              <div className={`${TOOLBAR_ROW} w-full`} />
            </div>
            {/* Stands where the count line will be. */}
            <div data-testid="catalogue-skeleton-count" className={COUNT_BOX} />
            {/* The cards sit where the grid will be. */}
            <div data-testid="catalogue-skeleton-grid" className={`${LIST_BOX} ${CARD_GRID_BOX}`}>
              {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                // A skeleton card has the same box as an item card, so the grid does not jump when it loads.
                <div key={index} data-testid="catalogue-skeleton-row" className={CARD_BOX}>
                  {/* Stands where the picture will be: 112 px. */}
                  <div data-skeleton-part="picture" className="bg-border-subtle size-28 shrink-0 rounded-md" />
                  {/* The text bars stack 4 px apart, as the card's name, label, price and stock do. */}
                  <div className="flex w-full flex-1 flex-col items-center gap-1">
                    {/* Stands where the name will be. */}
                    <div data-skeleton-part="name" className="bg-border-subtle h-6 w-4/5 rounded-sm" />
                    {/* Stands where the Category label will be. */}
                    <div data-skeleton-part="label" className="bg-border-subtle h-4 w-20 rounded-sm" />
                    {/* Stands where the price will be. */}
                    <div data-skeleton-part="price" className="bg-border-subtle h-6 w-14 rounded-sm" />
                    {/* Stands where the stock line will be: 20 px, like the line. */}
                    <div data-skeleton-part="stock" className="bg-border-subtle h-5 w-24 rounded-sm" />
                  </div>
                  {/* Stands where Add will be: a 44 px pill. */}
                  <div data-skeleton-part="button" className="bg-border-subtle rounded-pill h-11 w-full" />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {/* Announced politely when loading gives way to the count, the empty message or the error. */}
      <div aria-live="polite">
        {/* The count line, the empty message when nothing is Active, or the no-match message. */}
        {state.status === 'ready' && (
          <p className={`${COUNT_BOX} text-text-muted animate-fade-in`}>
            {/* The three messages share one line so the live region announces whichever applies. */}
            {switchedOn.length === 0
              ? 'Nothing is in the shop yet. Check back soon.'
              : matches.length === 0
                ? `No items match "${query.trim()}"${subcategory !== null ? ` in ${subcategory}` : category !== null ? ` in ${category}` : ''}.` // the subcategory alone when one is picked
                : countText}
          </p>
        )}
        {/* The error copy; the Try again button follows below. */}
        {state.status === 'error' && <p className={`${COUNT_BOX} text-danger`}>{loadErrorText(state.reason)}</p>}
      </div>
      {/* The only action on the screen, shown only after a failed load. */}
      {state.status === 'error' && (
        <button
          type="button" // not a form submit
          onClick={retry} // run the load again
          className={`${PILL_BOX} bg-accent text-on-accent focus-visible:outline-focus-ring mt-4 transition-transform duration-(--duration-press) focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97]`} // oxblood pill, press feedback, focus ring
        >
          Try again
        </button>
      )}
      {/* The one way back from no match. */}
      {state.status === 'ready' && switchedOn.length > 0 && matches.length === 0 && (
        <button
          type="button" // not a form submit
          onClick={clearFilters} // back to the full list
          className={`${PILL_BOX} bg-accent text-on-accent focus-visible:outline-focus-ring mt-4 transition-transform duration-(--duration-press) focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97]`} // oxblood pill, press feedback, focus ring
        >
          Clear filters
        </button>
      )}
      {state.status === 'ready' && (
        // The grid fades in once as a whole; cards do not animate one by one.
        <div ref={listRef} className="animate-fade-in">
          {/* All Active items at once, in stock first, then Sold out, each A to Z. */}
          <ul className={`${LIST_BOX} ${CARD_GRID_BOX}`}>
            {sorted.map((item) => ( // one item per card
              // one card per item
              <ItemCard key={item.id} item={item} currency={state.settings.currency} /> // key by id; price in the settings currency
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
