// The tab pill floating at the bottom of Home and Shop: Home, Shop and Cart, where Cart grows into the item count and estimated total once something is picked.

import { useState, type MouseEvent, type Ref } from 'react' // the grown flag's memory, and the ref and click types
import { CartIcon } from '@/features/cart/cart-icons.tsx' // the Cart tab's icon
import { cartCount, estimatedTotalCents, resolveCart } from '@/features/cart/cart.ts' // the cart maths
import { useCart } from '@/features/cart/use-cart.ts' // the cart
import type { Item } from '@/shared/data/types.ts' // the shape of an item
import { formatPrice } from '@/shared/format/price.ts' // "RM 20.00"
import { CART_HASH, HOME_HASH } from '@/shared/routes.ts' // the Home and cart addresses
import { PILL_DOCK, PILL_SURFACE } from '@/shared/ui/floating-pill-box.ts' // the one pill shape
import { HomeIcon, ShopIcon } from './tab-icons.tsx' // the Home and Shop icons

const TAB_BOX = 'pill-tab focus-visible:outline-focus-ring rounded-pill flex h-13 min-w-0 items-center focus-visible:outline-2 focus-visible:outline-offset-2' // what every tab shares: 52 px tall inside the 64 px pill, a pill-shaped target, the focus ring outside it
const STACK_BOX = 'flex-col justify-center gap-0.5 text-xs' // icon over label, as Home, Shop and the plain Cart tab draw

/**
 * Draws the pill; the current tab is marked, and the Cart tab counts what is orderable.
 * @param current the tab for the screen showing
 * @param items every item in the data, or null until it has loaded
 * @param currency the currency code from the settings, or null until it has loaded
 * @param shopHref the last Shop address, so the Shop tab brings back the category
 * @param cartLinkRef lets the app focus the Cart tab when the buyer comes back from the cart
 * @param onOpenCart called with the click on the Cart tab, so the app can mark the cart's history entry
 * @return the nav element
 */
export function TabPill({
  current,
  items, // every item, null while loading
  currency,
  shopHref,
  cartLinkRef,
  onOpenCart,
}: {
  current: 'home' | 'catalogue' // which tab is the current page
  items: Item[] | null // every item, null while loading
  currency: string | null // the currency code, null while loading
  shopHref: string // the last Shop address
  cartLinkRef?: Ref<HTMLAnchorElement> // for focus on return
  onOpenCart?: (event: MouseEvent<HTMLAnchorElement>) => void // the click, so the app can tell a plain open from a new-tab one
}) {
  const { quantities } = useCart() // the cart
  const { lines } = items ? resolveCart(quantities, items) : { lines: [] } // order lines A to Z, none until the items load
  const count = cartCount(lines) // the Item count
  const totalCents = estimatedTotalCents(lines) // the estimated total
  const grown = lines.length > 0 && currency !== null // only with something orderable
  const [wasGrown, setWasGrown] = useState(grown) // the last shape drawn
  const [changed, setChanged] = useState(false) // true once the shape has changed, so the first draw does not fade
  if (grown !== wasGrown) {
    setWasGrown(grown) // remember it
    setChanged(true) // from now on a new shape fades in
  }
  const itemCountText = `${count} ${count === 1 ? 'item' : 'items'}` // "5 items" or "1 item"
  const totalText = grown ? formatPrice(totalCents / 100, currency ?? '') : '' // "RM 20.00"
  const spokenTotal = totalText.replace(/\u00a0/g, ' ') // Intl puts a no-break space after "RM"; the name a reader gets uses a plain one
  const fade = changed ? 'pill-content animate-fade-in' : '' // the content fades in with the width change
  /** Home and Shop: equal thirds while the cart is empty, 64 px columns once the Cart tab grows. */
  const side = grown ? 'grow-0 basis-16' : 'grow basis-0' // flex-grow and flex-basis are what the stylesheet transitions
  /**
   * Picks a tab's colours.
   * @param isCurrent whether this tab is the current page
   * @return the classes for the stone capsule and oxblood, or the muted idle look
   */
  const tone = (isCurrent: boolean) => (isCurrent ? 'bg-bg-soft text-accent font-extrabold' : 'text-text-muted font-medium')
  return (
    <nav
      aria-label="Main" // the site's main navigation
      className={`${PILL_DOCK} ${PILL_SURFACE} flex-row! gap-1!`} // the shared dock and surface; the tabs sit in a row with 4 px gaps, not in the dock's stack
    >
      {/* Always in the page, so the first add is announced; the count and total are as the Cart tab's name says. */}
      <p
        role="status" // polite announcement of the count
        className="sr-only" // heard, not seen
      >
        {grown ? `${itemCountText}, Estimated total ${spokenTotal}` : ''}
      </p>
      {/* Home */}
      <a
        href={HOME_HASH} // the landing page
        aria-current={current === 'home' ? 'page' : undefined} // marks the current tab
        className={`${TAB_BOX} ${STACK_BOX} ${side} ${tone(current === 'home')}`} // idle or current look
      >
        <HomeIcon /> {/* the house */}
        Home {/* the label */}
      </a>
      {/* Shop: the last Shop address, so category, search and scroll come back. */}
      <a
        href={shopHref} // where the buyer last was in the shop
        aria-current={current === 'catalogue' ? 'page' : undefined} // marks the current tab
        className={`${TAB_BOX} ${STACK_BOX} ${side} ${tone(current === 'catalogue')}`} // idle or current look
      >
        <ShopIcon /> {/* the tiles */}
        Shop {/* the label */}
      </a>
      {/* Cart: a plain tab like the others, or the oxblood button that takes the rest of the pill. */}
      <a
        ref={cartLinkRef} // for focus on return
        href={CART_HASH} // opens the cart screen
        onClick={onOpenCart} // tells the app the cart is opened from a tab
        aria-label={grown ? `Cart, ${itemCountText}, estimated total ${spokenTotal}` : undefined} // the plain tab's name is its text, "Cart"
        className={`${TAB_BOX} grow basis-0 ${grown ? 'bg-accent text-on-accent justify-between px-3.5 sm:px-4' : `justify-center ${tone(false)}`}`} // the oxblood pill grown, else like Home and Shop
      >
        {grown ? (
          <>
            {/* The icon and the two lines, fading in as the tab widens. */}
            <span key="grown" className={`${fade} flex min-w-0 items-center gap-2`}>
              <CartIcon className="size-5 shrink-0" /> {/* the bag, never squeezed */}
              <span className="min-w-0 leading-tight">
                {/* The Item count, bold. */}
                <span className="block truncate text-sm font-extrabold">{itemCountText}</span>
                {/* The estimated total: short under 640 px, in full from 640 px. */}
                <span className="block truncate text-xs sm:hidden">{totalText}</span>
                <span className="hidden truncate text-xs sm:block">{`Estimated total ${totalText}`}</span>
              </span>
            </span>
            {/* The chevron, a hint that it opens something. */}
            <span aria-hidden="true" className={`${fade} shrink-0 text-base font-extrabold`}>
              ›
            </span>
          </>
        ) : (
          <span key="plain" className={`${fade} flex flex-col items-center gap-0.5 text-xs`}>
            <CartIcon className="size-5.5" /> {/* the bag */}
            Cart {/* the label */}
          </span>
        )}
      </a>
    </nav>
  )
}
