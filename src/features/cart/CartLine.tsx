// One line of the cart card: an order line with its stepper, or an Unavailable line with its tag and trash, so a buyer can change a quantity or remove what is no longer sold.

import { useRef } from 'react' // whether the last input was the keyboard
import type { Item } from '@/shared/data/types.ts' // the shape of an item
import { formatPrice } from '@/shared/format/price.ts' // "RM 4.00"
import { PatchPicture } from '@/shared/ui/PatchPicture.tsx' // picture or category mark
import { TrashIcon } from './cart-icons.tsx' // the trash on an Unavailable line
import { CART_LINE_BOX, CART_PICTURE_BOX } from './cart-line-box.ts' // the line's boxes
import { exceedsStock, GONE_NAME, lineLabel, lineTotalCents, quantityCap } from './cart.ts' // the gone name, the label, the line's price and the stock rules
import { QuantityStepper } from './QuantityStepper.tsx' // the quantity control

/**
 * Draws one line.
 * @param id the item id saved in the cart, so a gone item's line can still be found for focus
 * @param item the item on this line, or null when it is gone from the data
 * @param quantity the quantity in the cart
 * @param currency the currency code from the settings
 * @param unavailable true when the item is gone from the shop: greyed, no stepper, left out of the total
 * @param onChange called with a new quantity from 1 to 99
 * @param onRemove called when the line is removed (trash, or a typed 0), with true when the keyboard did it
 * @return an `li` element
 */
export function CartLine({
  id,
  item, // the item on the line
  quantity,
  currency,
  unavailable,
  onChange,
  onRemove,
}: {
  id: string
  item: Item | null // the item behind the line, null once the shop stops listing it
  quantity: number
  currency: string
  unavailable: boolean
  onChange: (quantity: number) => void
  onRemove: (keyboard: boolean) => void
}) {
  const keyboard = useRef(false) // set by the latest input in this line, read when a removal comes from the stepper
  const name = item?.name ?? GONE_NAME // the line's name
  const over = item !== null && !unavailable && exceedsStock({ item, quantity }) // asks for more than is left, or the item is Sold out
  return (
    // The line; the capture handlers note which input is about to cause a removal, before the stepper reacts to it.
    <li
      data-over-stock={over ? 'true' : undefined} // marks a line Checkout must send the buyer back to
      data-line-id={id} // from the saved id, so a gone item has one too; lets the screen find the line to focus
      onKeyDownCapture={() => (keyboard.current = true)} // a key press (Enter in the field, Enter or Space on the trash)
      onClickCapture={(event) => (keyboard.current = event.detail === 0)} // a keyboard-made click has detail 0
      onBlurCapture={() => (keyboard.current = false)} // a field committed by leaving it
      className={`${CART_LINE_BOX} ${over ? 'ring-danger ring-2 ring-inset' : ''}`} // an over-stock line gets a 2 px danger ring inside its box, so the hairlines do not move
    >
      {/* Picture or category mark in its rounded box; greyed when unavailable. */}
      <div className={`${CART_PICTURE_BOX} ${unavailable ? 'opacity-50 grayscale' : ''}`}>
        {item === null ? ( // a gone item has no data to show
          <div className="bg-bg-soft size-full" /> /* a plain soft box for a gone item */
        ) : (
          <PatchPicture item={item} /> /* the line's picture comes from the item */
        )}
      </div>
      {/* Two lines: name and total, then "each" and the stepper (or the tag and the trash). */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Name and total. */}
        <div className="flex items-baseline justify-between gap-3 leading-5">
          <span className={`wrap-break-word ${unavailable ? 'text-text-muted' : 'font-bold'}`}>{name}</span>{' '}
          {/* the name */}
          {unavailable ? (
            <span className="text-text-muted shrink-0 text-sm">Not in your total</span> // where the total was
          ) : (
            <span className="shrink-0 font-bold tabular-nums">
              {/* the line total from the item's price */}
              {formatPrice(lineTotalCents({ item: item as Item, quantity }) / 100, currency)}
            </span> // the line total
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          {unavailable ? (
            <>
              <span className="bg-tag-warning text-on-tag-warning rounded-pill px-2 py-0.5 text-xs font-medium">
                Unavailable
              </span>{' '}
              {/* the tag */}
              {/* 36 px drawn, 44 px tap area. */}
              <span className="bg-bg-soft rounded-pill flex size-9 items-center justify-center">
                <button
                  type="button" // not a form submit
                  aria-label={`Remove ${lineLabel(item, id)}`} // names the line, a gone one by id
                  onClick={() => onRemove(keyboard.current)} // keyboard or pointer, as noted above
                  className="text-trash focus-visible:outline-focus-ring rounded-pill flex size-11 shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-0 active:scale-[0.97]" // 44 px tap area over the 36 px disc
                >
                  <TrashIcon />
                </button>
              </span>
            </>
          ) : (
            <>
              {over ? (
                // In words as well as red, in the place of one's price.
                <span className="text-danger text-[0.8125rem] font-medium">
                  {/* Sold out, or how many are left. */}
                  {/* stock note from the item */}
                  {(item as Item).stock === 0 ? 'Sold out' : `Only ${(item as Item).stock} left`}
                </span>
              ) : (
                <span className="text-text-muted text-[0.8125rem]">{`${formatPrice((item as Item).price, currency)} each`}</span> // one's price, 13 px
              )}{' '}
              <QuantityStepper
                itemName={name} // for the labels
                quantity={quantity} // the cart's quantity
                max={quantityCap(item as Item)} // + stops at the stock
                trashAtOne // the cart's look: trash at 1
                onChange={(next) => (next === 0 ? onRemove(keyboard.current) : onChange(next))} // 0 is a removal, like the trash
              />
            </>
          )}
        </div>
      </div>
    </li>
  )
}
