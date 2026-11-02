// The details page: the order form for the cart's orderable lines, so a buyer who pressed Checkout can leave their details and send; it sends them back to the cart when an order could not be right.

import { useEffect, useRef } from 'react' // the redirect and the heading focus
import { exceedsStock, resolveCart } from '@/features/cart/cart.ts' // orderable lines, what cannot be ordered and the stock rule
import { useCart } from '@/features/cart/use-cart.ts' // the cart
import type { CatalogueLoad } from '@/features/catalogue/use-catalogue-data.ts' // the load the app hands over
import { CART_HASH, DETAILS_HASH } from '@/shared/routes.ts' // the cart's and this page's addresses
import { ACTION_BOX } from '@/shared/ui/button-box.ts' // the retry button
import { loadErrorText } from '@/shared/ui/load-error-text.ts' // the failed-load message by reason
import { LoadingStatus } from '@/shared/ui/LoadingStatus.tsx' // what a screen reader hears while loading
import { SKELETON_PULSE } from '@/shared/ui/skeleton-box.ts' // the skeleton's pulse
import { OrderForm } from './OrderForm.tsx' // the form
import { useOrderForm } from './use-order-form.ts' // whether a send is running

/**
 * Draws the details page.
 * @param data the load: state, skeleton gate and retry
 * @return the heading and the order form; nothing but the heading while the data loads
 */
export function DetailsScreen({ data }: { data: CatalogueLoad }) {
  const { state, showSkeleton, retry } = data // load state, skeleton gate and retry
  const { quantities } = useCart() // the cart
  const { sending, failure } = useOrderForm() // an order is being sent: the page waits; a failed send shows the failure note
  const headingRef = useRef<HTMLHeadingElement>(null) // focused on arrival
  const ready = state.status === 'ready' // the honors are known
  const { lines, unavailable } = resolveCart(quantities, ready ? state.honors : []) // what can be ordered, what cannot
  const mustLeave = ready && (lines.length === 0 || unavailable.length > 0 || lines.some(exceedsStock)) // nothing to order, a line that cannot be ordered, or one above today's stock is still in the cart

  // Arriving keyboard and screen-reader users start at the heading.
  useEffect(() => {
    headingRef.current?.focus() // the heading has tabIndex -1
  }, [])

  // A page that cannot lead to a right order goes back to the cart (a typed address, a reload, an honor hidden or sold out since).
  useEffect(() => {
    if (!mustLeave) return // an order can be sent from here
    if (window.location.hash !== DETAILS_HASH) return // already leaving (a sent order opened the confirmation)
    window.location.replace(CART_HASH) // replace, so Back does not return to a page that bounces
  }, [mustLeave])

  return (
    // A 768 px centred column like the cart's; while an order sends the heading and the fields are inert and busy, Send order and its live region are not; the bottom padding clears the floating pill and what stacks over it, and grows while the failure note shows so it never covers a line of the form.
    <div className={`mx-auto max-w-3xl ${failure ? 'pb-60' : 'pb-24'}`}>
      {/* Where focus lands on arrival. */}
      <h2 ref={headingRef} inert={sending} tabIndex={-1} className="sm:text-title mt-2 text-xl font-bold outline-none">
        Your details
      </h2>
      {/* The same copy as the catalogue, and the way to retry. */}
      {state.status === 'error' && (
        <>
          <p className="text-danger mt-3 min-h-6">{loadErrorText(state.reason)}</p>
          <button
            type="button" // not a form submit
            onClick={retry} // run the load again
            className={`${ACTION_BOX} bg-accent text-on-accent mt-4 px-6`}
          >
            Try again
          </button>
        </>
      )}
      {/* Nothing for 300 ms, then bars where the form's fields will be, at their real heights, so the page does not jump. */}
      <LoadingStatus loading={showSkeleton} /> {/* always mounted, so its text is announced when the skeleton appears */}
      {showSkeleton && (
        <>
          <div data-testid="details-skeleton" aria-hidden="true" className={`mt-6 space-y-4 ${SKELETON_PULSE}`}>
            {/* Name, email, phone and club: a label bar over a 44 px pill, as the form draws them. */}
            {[0, 1, 2, 3].map((index) => (
              <div key={index} data-testid="details-skeleton-field">
                <div className="bg-border-subtle mb-1 h-5 w-16 rounded-sm" /> {/* the label line */}
                <div className="bg-border-subtle rounded-pill h-11 w-full" /> {/* the field, 44 px */}
              </div>
            ))}
            {/* The Turnstile widget's box, 300 by 65 px. */}
            <div data-testid="details-skeleton-captcha" className="bg-border-subtle h-16.25 w-75 max-w-full rounded-sm" />
          </div>
        </>
      )}
      {/* Only with orderable lines and nothing unavailable; otherwise the redirect above is under way. */}
      {ready && !mustLeave && <OrderForm lines={lines} currency={state.settings.currency} clubs={state.clubs} />}
    </div>
  )
}
