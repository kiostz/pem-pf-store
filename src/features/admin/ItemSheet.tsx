// The Item sheet: a modal dialog to edit an item's name, category and price (kept pending until Save) or to add a new one (saved at once), with the Created and Last changed times and, for Club-added items, Delete item.

import { useEffect, useRef, useState } from 'react' // the dialog element, focus and the drafts
import type { AdminHonor, NewItem } from '../../../workers/admin/src/admin-types.ts' // the row and the new item
import { ACTION_BOX } from '@/shared/ui/button-box.ts' // the shared 44 px pill action
import { formatAdminTime } from './admin-dates.ts' // the times in Malaysia
import { FIELD_BOX, SHEET_BOX, SOFT_BUTTON } from './admin-boxes.ts' // shared shapes
import { DeleteDialog } from './DeleteDialog.tsx' // the confirmation
import { describeLatest } from './latest-line.ts' // what the item holds now
import { currencySymbol, formatPriceInput, parsePrice } from './price-input.ts' // the price field
import type { ItemEdits } from './pending-changes.ts' // the pending edits
import type { AddOutcome, DeleteOutcome } from './use-admin-honors.ts' // what Add and Delete end in

const MAX_NAME = 100 // the Worker's limit
const SIGNED_OUT = 'Your sign-in has ended. Open this page in a new tab to sign in, then try again.' // the 403 line

/**
 * Checks a typed name.
 * @param text what is in the field
 * @param isNameTaken tells whether another item has the name
 * @return the trimmed name, or the error line
 */
function checkName(
  text: string,
  isNameTaken: (name: string) => boolean,
): { name: string; error: null } | { name: null; error: string } {
  const name = text.trim() // outer spaces never count
  if (name === '') return { name: null, error: 'Enter a name.' } // empty
  if ([...name].length > MAX_NAME) return { name: null, error: 'Names can be up to 100 characters.' } // too long
  if (/[\p{Cc}\p{Zl}\p{Zp}]/u.test(name)) return { name: null, error: 'Remove tabs and line breaks from the name.' } // control characters
  if (isNameTaken(name)) return { name: null, error: `Another item is already called ${name}.` } // a duplicate
  return { name, error: null } // fine
}

/**
 * Draws the sheet.
 * @param mode edit or add
 * @param honor the row being edited (edit only)
 * @param pending the row's unsaved edits, shown instead of the stored values (edit only)
 * @param categories the fixed category list
 * @param currency the ISO currency code
 * @param defaultPriceCents the price an added item starts with
 * @param isNameTaken tells whether another item has a name (edit only; Add leaves it to the Worker)
 * @param onDone called with the three values when an edit is confirmed
 * @param onAdd called with the new item; answers what happened
 * @param onDelete called with the row after the Delete dialog; answers what happened
 * @param onClose called when the sheet should go away
 * @return a modal dialog, and the Delete dialog when asked
 */
export function ItemSheet({
  mode,
  honor,
  pending,
  categories,
  currency,
  defaultPriceCents,
  isNameTaken = () => false,
  onDone,
  onAdd,
  onDelete,
  onClose,
}: {
  mode: 'edit' | 'add' // which sheet
  honor?: AdminHonor // the row, in edit
  pending?: ItemEdits // its unsaved edits
  categories: string[] // the fixed list
  currency: string // the ISO code
  defaultPriceCents: number // the starting price of an added item
  isNameTaken?: (name: string) => boolean // another item has it
  onDone: (values: { name: string; category: string; priceCents: number }) => void // an edit confirmed
  onAdd: (item: NewItem) => Promise<AddOutcome> // an add
  onDelete: (honor: AdminHonor) => Promise<DeleteOutcome> // a delete
  onClose: () => void // go away
}) {
  const dialog = useRef<HTMLDialogElement>(null) // the element
  const busy = useRef(false) // a request is running; read between renders so a double click sends once
  const [name, setName] = useState(mode === 'edit' ? (pending?.name ?? honor!.name) : '') // the name draft
  const [category, setCategory] = useState(mode === 'edit' ? (pending?.category ?? honor!.category) : '') // the category draft
  const [priceText, setPriceText] = useState(
    formatPriceInput(mode === 'edit' ? (pending?.priceCents ?? honor!.priceCents) : defaultPriceCents),
  ) // the price draft
  const [errors, setErrors] = useState<{ name?: string; category?: string; price?: string; form?: string }>({}) // the lines to show
  const [adding, setAdding] = useState(false) // an Add is running
  const [confirming, setConfirming] = useState(false) // the Delete dialog is open
  const [deleting, setDeleting] = useState(false) // a Delete is running
  const [deleteError, setDeleteError] = useState<string | null>(null) // the Delete dialog's failure line

  // Opens as a modal; returns focus to what held it (the row's name or Add item) when the sheet goes away.
  useEffect(() => {
    const element = dialog.current // the dialog
    const opener = document.activeElement as HTMLElement | null // what held focus before
    if (element !== null && !element.open) element.showModal() // modal: traps focus, closes on Escape
    return () => {
      if (opener?.isConnected) opener.focus() // back to where the admin was
    }
  }, [])

  /**
   * Checks the three fields and shows the first problems.
   * @return the clean values, or null when a line is showing
   */
  const validate = () => {
    const checked = checkName(name, mode === 'edit' ? isNameTaken : () => false) // the name
    const price = parsePrice(priceText) // the price
    const next = {
      name: checked.error ?? undefined, // the name line
      category: category === '' ? 'Choose a category.' : undefined, // the category line
      price: price.ok ? undefined : price.error, // the price line
    } // every line
    setErrors(next) // shown
    if (next.name || next.category || next.price || checked.name === null || !price.ok) return null // something to fix
    return { name: checked.name, category, priceCents: price.cents } // clean
  }

  /**
   * Confirms the sheet: an edit goes to the pending list, an add is saved at once.
   * @param event the form submit
   */
  const submit = async (event: React.SubmitEvent) => {
    event.preventDefault() // no page reload
    if (busy.current) return // one request at a time
    const values = validate() // the clean values
    if (values === null) return // a line is showing
    if (mode === 'edit') {
      onDone(values) // the pending list takes it
      onClose() // the sheet goes
      return // nothing to send: an edit waits for Save
    }
    busy.current = true // a second click is ignored
    setAdding(true) // the button says so
    const outcome = await onAdd(values) // the one request
    busy.current = false // free again
    setAdding(false) // the button is back
    if (outcome === 'added') return onClose() // the sheet goes
    setErrors(
      outcome === 'name-taken'
        ? { name: `Another item is already called ${values.name}.` } // the usual line
        : outcome === 'id-taken'
          ? { form: "Couldn't add this item. Try a slightly different name." } // the id clash
          : outcome === 'signed-out'
            ? { form: SIGNED_OUT } // the session ended
            : { form: "We couldn't add the item. Try again." }, // anything else
    )
  }

  /** Runs the confirmed delete and handles its outcome. */
  const confirmDelete = async () => {
    if (busy.current || honor === undefined) return // one request at a time
    busy.current = true // a second click is ignored
    setDeleting(true) // the dialog says so
    const outcome = await onDelete(honor) // the one request
    busy.current = false // free again
    setDeleting(false) // the dialog is back
    if (outcome.kind === 'deleted') return onClose() // gone
    setDeleteError(
      outcome.kind === 'conflict'
        ? `This item has been updated. Latest: ${describeLatest(outcome.latest, currency)}.` // the dialog stays and says what changed
        : outcome.kind === 'built-in'
          ? "Built-in items can't be deleted."
          : outcome.kind === 'signed-out'
            ? SIGNED_OUT
            : "We couldn't delete the item. Try again.",
    ) // why it stayed
  }

  const title = mode === 'edit' ? 'Edit item' : 'Add item' // the heading
  return (
    <>
      {/* The sheet: a modal dialog with one form. */}
      <dialog
        ref={dialog} // opened above
        aria-labelledby="sheet-title" // its name
        onClose={onClose} // Escape closes it natively, and changes nothing
        onClick={(event) => event.target === dialog.current && onClose()} // a tap on the backdrop
        className={SHEET_BOX}
      >
        <form onSubmit={submit} noValidate>
          {/* The title and the Close button. */}
          <div className="flex items-center justify-between gap-2">
            <h2 id="sheet-title" className="text-lg font-bold">
              {title} {/* Edit item or Add item */}
            </h2>
            <button
              type="button" // not a form submit
              aria-label="Close" // an icon only
              onClick={onClose} // changes nothing
              className="bg-bg-soft text-accent focus-visible:outline-focus-ring rounded-pill flex size-11 shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18M6 6l12 12" /> {/* a cross */}
              </svg>
            </button>
          </div>
          {/* The three fields; a line under a field says what to fix. */}
          <div className="mt-3 flex flex-col gap-4">
            {/* The name field and its line. */}
            <div>
              <label htmlFor="item-name" className="mb-1 block text-sm font-medium">
                Name
              </label>
              <input
                id="item-name" // the label points here
                value={name} // controlled
                onChange={(event) => setName(event.target.value)} // every keystroke
                aria-invalid={errors.name !== undefined} // the line below says why
                aria-describedby={errors.name ? 'item-name-error' : undefined} // read with the field
                autoComplete="off" // no history dropdown
                className={`${FIELD_BOX} w-full`}
              />
              {errors.name && (
                <p id="item-name-error" className="text-danger mt-1 text-sm">
                  {errors.name} {/* what to fix */}
                </p>
              )}
            </div>
            {/* The category field and its line. */}
            <div>
              <label htmlFor="item-category" className="mb-1 block text-sm font-medium">
                Category
              </label>
              <select
                id="item-category" // the label points here
                value={category} // controlled
                onChange={(event) => setCategory(event.target.value)} // the pick
                aria-invalid={errors.category !== undefined} // the line below says why
                aria-describedby={errors.category ? 'item-category-error' : undefined} // read with the field
                className={`category-filter ${FIELD_BOX} w-full`} // the site's select styling
              >
                {mode === 'add' && <option value="">Choose a category</option>} {/* an Add starts with none */}
                {categories.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
              {errors.category && (
                <p id="item-category-error" className="text-danger mt-1 text-sm">
                  {errors.category} {/* what to fix */}
                </p>
              )}
            </div>
            {/* The price field and its line. */}
            <div>
              <label htmlFor="item-price" className="mb-1 block text-sm font-medium">
                {`Price (${currencySymbol(currency)})`}
              </label>
              <input
                id="item-price" // the label points here
                value={priceText} // controlled
                onChange={(event) => setPriceText(event.target.value)} // every keystroke
                inputMode="decimal" // a number pad on phones
                aria-invalid={errors.price !== undefined} // the line below says why
                aria-describedby={errors.price ? 'item-price-error' : undefined} // read with the field
                autoComplete="off" // no history dropdown
                className={`${FIELD_BOX} w-full`}
              />
              {errors.price && (
                <p id="item-price-error" className="text-danger mt-1 text-sm">
                  {errors.price} {/* what to fix */}
                </p>
              )}
            </div>
          </div>
          {/* The times of an existing item, or what an Add starts with. */}
          {mode === 'edit' && honor !== undefined ? (
            <p className="text-text-muted mt-4 text-sm">
              <span className="block">{`Created ${formatAdminTime(honor.createdAt)}`}</span> {/* one line each */}
              <span className="block">{`Last changed ${formatAdminTime(honor.modifiedAt)}`}</span>
            </p>
          ) : (
            <p className="text-text-muted mt-4 text-sm">New items start Hidden with 0 in stock.</p>
          )}
          {errors.form && (
            <p role="alert" className="text-danger mt-3">
              {errors.form} {/* why the add failed */}
            </p>
          )}
          {/* The one primary action, and Delete item quietly apart from it. */}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse sm:justify-between">
            <button
              type="submit" // Enter in a field does this
              aria-disabled={adding} // a second click is ignored
              className={`${ACTION_BOX} bg-accent text-on-accent h-13 px-6 font-extrabold! aria-disabled:opacity-60`} // oxblood, the one primary
            >
              {mode === 'edit' ? 'Done' : adding ? 'Adding…' : 'Add item'}
            </button>
            {mode === 'edit' && honor?.clubAdded === true && (
              // Delete item opens the confirmation dialog.
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null)
                  setConfirming(true)
                }}
                className={`${SOFT_BUTTON} text-danger!`}
              >
                Delete item
              </button>
            )}
          </div>
        </form>
      </dialog>
      {confirming && honor !== undefined && (
        <DeleteDialog
          name={honor.name}
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}
