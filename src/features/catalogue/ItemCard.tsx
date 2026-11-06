// One item in the catalogue grid: picture, name, Category label, price, stock and Add (or Sold out), so a buyer can scan by picture and order from the card.

import type { Item } from '@/shared/data/types.ts' // the shape of an item
import { formatPrice } from '@/shared/format/price.ts' // "RM 4.00"
import { useCart } from '@/features/cart/use-cart.ts' // the cart the card edits
import { CardQuantity } from '@/features/cart/CardQuantity.tsx' // Add, the stepper or Sold out
import { quantityCap } from '@/features/cart/cart.ts' // the most a buyer may pick
import { PatchPicture } from '@/shared/ui/PatchPicture.tsx' // picture or category mark
import { CARD_BOX } from './item-card-box.ts' // the card's box classes

const STOCK_FORMAT = new Intl.NumberFormat('en-US') // 1,200: a thousands separator whatever the browser's language

/**
 * Draws one card.
 * @param item the item to show
 * @param currency the currency code from the settings
 * @return an `li` element: picture on top, then the wrapping name, the Category label, the price, the stock line and the Add control at the bottom
 */
export function ItemCard({ item, currency }: { item: Item; currency: string }) { // the card shows one item
  const { quantityOf, setQuantity } = useCart() // this item's quantity and how to change it
  const soldOut = item.stock === 0 // nothing left to sell
  return (
    // One card.
    <li className={CARD_BOX}>
      {/* Picture or category mark, 112 px square; greyed when Sold out (the text keeps full strength, so its contrast holds). */}
      <div className={soldOut ? 'opacity-50 grayscale' : ''}>
        {/* the card's picture comes from the item */}
        <PatchPicture item={item} size="card" />
      </div>
      {/* The text grows so Add sits at the same height on every card in a row. */}
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
        {/* The name, read first; wraps rather than truncates. */}
        <span className="font-medium wrap-break-word">{item.name}</span>
        {/* The Category label: text only, not a control. */}
        <span className="text-text-default bg-border-subtle rounded-sm px-1.5 text-xs">{item.category}</span>
        {/* The price in tabular figures. */}
        <span className="text-text-muted tabular-nums">{formatPrice(item.price, currency)}</span>
        {/* How many are left, on every card including Sold out ones; a 20 px line, 13 px text. */}
        <span className="text-text-muted text-[0.8125rem] leading-5 tabular-nums">{`Stock: ${STOCK_FORMAT.format(item.stock)} left`}</span>
      </div>
      <CardQuantity
        honorName={item.name} // for the labels
        quantity={quantityOf(item.id)} // 0 when not in the cart
        onChange={(quantity) => setQuantity(item.id, quantity)} // edit the cart
        max={quantityCap(item)} // the stock or 99
        soldOut={soldOut} // no Add, no stepper
      />
    </li>
  )
}
