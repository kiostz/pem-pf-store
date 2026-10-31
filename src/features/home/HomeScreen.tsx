// Home, the landing page: the welcome band with its way into the shop, the category tiles and the three ordering steps, so a buyer arriving from a club link knows what to do first.

import { CATALOGUE_HASH } from '@/shared/routes.ts' // the shop's address
import type { CatalogueLoad } from '@/features/catalogue/use-catalogue-data.ts' // the load, made by the app
import { CategoryTiles } from './CategoryTiles.tsx' // the tile row
import { EmblemTrace } from './EmblemTrace.tsx' // the drawing behind the band's text

const STEPS = [
  { title: 'Pick your items', line: 'Add what your club needs to the cart.' }, // step 1
  { title: 'Send your details', line: 'Name, email, phone and club. No payment yet.' }, // step 2
  { title: 'Get your invoice', line: 'We check the order and email the final total.' }, // step 3
] // the ordering steps, in order

/**
 * The landing page.
 * @param data the load that feeds the tiles
 * @return the band, the tiles and the steps; the band and steps never wait on the load
 */
export function HomeScreen({ data }: { data: CatalogueLoad }) {
  return (
    <>
      {/* Full width under the header, with rounded bottom corners; on paper it takes ink like the header, so only the drawing is left out. */}
      <section className="bg-header text-on-header rounded-b-card print:text-text-default relative overflow-hidden print:bg-transparent">
        {/* The 1,200 px column that holds the text and the drawing. */}
        <div className="relative mx-auto max-w-300 px-5 pt-5 pb-5">
          {/* Above the drawing, so the drawing never covers the text or the button. */}
          <div className="relative z-10 flex flex-col items-start gap-3 sm:max-w-[min(36rem,calc(100%-12rem))]">
            <h2 className="text-3xl leading-tight font-extrabold tracking-tight">
              Everything your club needs, in one order
            </h2>{' '}
            {/* the headline */}
            <p className="text-on-header/85 print:text-text-default text-base leading-snug">
              Pick the items, send your details, and we'll email your invoice once we've checked it.
            </p>
            {/* The one primary action on the screen. */}
            <a
              href={CATALOGUE_HASH} // the shop
              className="bg-band-action text-on-band-action focus-visible:outline-focus-ring rounded-pill mt-1.5 flex h-12 items-center gap-1.5 px-6 font-extrabold transition-transform duration-(--duration-press) focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97]" // rose pill, press feedback, focus ring
            >
              Browse the shop
              <svg
                aria-hidden="true" // decorative so the name stays Browse the shop
                viewBox="0 0 24 24" // a 24 unit canvas
                className="size-4" // 16 px
                fill="none" // outline only
                stroke="currentColor" // the pill's oxblood
                strokeWidth="3" // bold chevron
                strokeLinecap="round" // round ends
                strokeLinejoin="round" // round corner
              >
                <path d="M9 5l7 7-7 7" /> {/* the chevron */}
              </svg>
            </a>
          </div>
          <EmblemTrace /> {/* the outline and its canvases, after the text so they sit under it on a phone */}
        </div>
      </section>
      {/* The page's own column under the band. */}
      <div className="mx-auto flex max-w-300 flex-col gap-6 px-4 pt-6">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Shop by category</h2> {/* the tiles' heading */}
          <CategoryTiles data={data} /> {/* its own loading, error and empty states */}
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">How ordering works</h2> {/* the steps' heading */}
          <ol className="bg-bg-surface border-border-subtle rounded-card flex flex-col border">
            {/* One row per step. */}
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="border-bg-soft flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
              >
                {/* The step's number in a soft circle. */}
                <span className="bg-bg-soft text-accent flex size-8 shrink-0 items-center justify-center rounded-full font-extrabold">
                  {index + 1}
                </span>
                <span className="text-base">
                  <b>{step.title}</b>
                  {/* bold title */}
                  <br />
                  {/* the muted line starts a new line */}
                  <span className="text-text-muted text-sm">{step.line}</span>
                  {/* what happens */}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  )
}
