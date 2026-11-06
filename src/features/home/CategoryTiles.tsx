// The category tiles: a sideways row of links in each category's patch colour that open Shop on that category, with the row's own loading, error and empty states so Home never waits on the load.

import { categoryNames } from '@/features/catalogue/filter.ts' // Active categories, A to Z
import type { CatalogueLoad } from '@/features/catalogue/use-catalogue-data.ts' // the load, made by the app
import { shopHash } from '@/shared/routes.ts' // the filtered shop's address
import { PILL_BOX } from '@/shared/ui/button-box.ts' // the pill shape of the actions
import { categoryMark } from '@/shared/ui/category-mark.ts' // the category's patch colour
import { loadErrorText } from '@/shared/ui/load-error-text.ts' // the failed-load message by reason
import { LoadingStatus } from '@/shared/ui/LoadingStatus.tsx' // what a screen reader hears while loading
import { SKELETON_PULSE } from '@/shared/ui/skeleton-box.ts' // the skeleton's pulse

const TILE_BOX = 'h-22 w-26 shrink-0 rounded-card' // the 104 x 88 px tile, shared with its skeleton
const PATCH_WHITE = '#ffffff' // the mark colour that means a white name
const SKELETON_TILES = 3 // how many skeleton tiles the loading state shows

/**
 * The row of category tiles.
 * @param data the load: state, skeleton gate and retry
 * @return the tiles, or the skeleton, the load error with Try again, or the empty message
 */
export function CategoryTiles({ data }: { data: CatalogueLoad }) {
  const { state, showSkeleton, retry } = data // load state, skeleton gate and retry
  const categories = state.status === 'ready' ? categoryNames(state.items) : [] // Active categories A to Z
  return (
    // Out to the screen edges so the row scrolls under the page's gutter; vertical room so a focus ring is not clipped.
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 py-1">
      {/* Nothing for the loader delay, then skeleton tiles of the same box. */}
      <LoadingStatus loading={showSkeleton} /> {/* always mounted, so its text is announced when the tiles appear */}
      {showSkeleton &&
        Array.from({ length: SKELETON_TILES }, (_, index) => (
          <div key={index} data-testid="tile-skeleton" aria-hidden="true" className={`${TILE_BOX} bg-border-subtle ${SKELETON_PULSE}`} />
        ))}
      {/* The error stays in the row, with the one way out. */}
      {state.status === 'error' && (
        <div className="px-1">
          <p className="text-danger">{loadErrorText(state.reason)}</p>
          <button
            type="button" // not a form submit
            onClick={retry} // run the load again
            className={`${PILL_BOX} bg-accent text-on-accent focus-visible:outline-focus-ring mt-3 transition-transform duration-(--duration-press) focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97]`} // oxblood pill, press feedback, focus ring
          >
            Try again
          </button>
        </div>
      )}
      {/* Nothing Active. */}
      {state.status === 'ready' && categories.length === 0 && (
        <p className="text-text-muted px-1">Nothing is in the shop yet. Check back soon.</p>
      )}
      {/* One link per category. */}
      {categories.map((category) => {
        const { background, foreground, strongHalo } = categoryMark(category) // the patch colour and the lettering that reads on it, from the one map
        const dark = foreground !== PATCH_WHITE // the light tiles take near-black names, as their icons do
        return (
          <a
            key={category} // names are unique
            href={shopHash(category)} // opens Shop on this category
            style={dark ? { backgroundColor: background, color: foreground } : { backgroundColor: background }} // the colours are data, the same in both themes
            className={`${TILE_BOX} ${dark ? '' : `text-on-patch ${strongHalo ? 'text-shadow-halo-strong' : 'text-shadow-halo'}`} focus-visible:outline-focus-ring flex snap-start items-end p-2.5 text-sm font-extrabold transition-transform duration-(--duration-press) focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97]`} // name bottom-left; white names sit in a dark halo, near-black ones have none; press feedback, focus ring
          >
            {category}
          </a>
        )
      })}
    </div>
  )
}
