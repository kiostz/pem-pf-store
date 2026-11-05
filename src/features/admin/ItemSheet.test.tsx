// Tests for the Item sheet (Edit and Add): the shown times, what Done hands back, the field errors, one request per Add, and who sees Delete.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react' // rendering and events
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest' // test API
import type { AdminHonor } from '../../../workers/admin/src/admin-types.ts' // the row shape
import { ItemSheet } from './ItemSheet.tsx' // the code under test
import { makeItem, meta, rows } from './item-fixtures.ts' // shared data
import type { PictureOutcome } from './use-admin-honors.ts' // what an upload ends in

const knot = rows[2] // Knot Tying, built in
const shirt = rows[1] // Camp Shirt, Club-added

/**
 * Renders the sheet with spies for every callback.
 * @param props the props that differ from an Edit of Knot Tying
 * @return the spies
 */
function openSheet(props: Partial<React.ComponentProps<typeof ItemSheet>> = {}) {
  const spies = {
    onDone: vi.fn(),
    onAdd: vi.fn(() => Promise.resolve('added' as const)),
    onDelete: vi.fn(() => Promise.resolve({ kind: 'deleted' as const })),
    onPicture: vi.fn<(honor: AdminHonor, picture: Blob) => Promise<PictureOutcome>>(() => Promise.resolve('saved')),
    onClose: vi.fn(),
  } // the callbacks
  const view = render(
    <ItemSheet
      mode="edit"
      honor={knot}
      categories={meta.categories}
      currency={meta.currency}
      defaultPriceCents={meta.defaultPriceCents}
      isNameTaken={() => false}
      {...spies}
      {...props}
    />,
  )
  return { ...spies, rerender: view.rerender } // the spies and a way to re-render with new props
}

describe('Edit sheet', () => {
  it('shows the fields, and Created and Last changed in Malaysia time', () => {
    // Catches UTC times on the sheet, or fields not filled from the row.
    openSheet({
      honor: makeItem({ ...knot, createdAt: '2026-11-01T00:00:00.000Z', modifiedAt: '2026-11-03T09:05:00.000Z' }),
    })
    expect(screen.getByRole('heading', { name: 'Edit item' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Knot Tying')
    expect(screen.getByLabelText('Category')).toHaveValue('Recreation')
    expect(screen.getByLabelText('Price (RM)')).toHaveValue('4.00')
    expect(screen.getByText('Created 1 Nov 2026, 8:00 am')).toBeInTheDocument()
    expect(screen.getByText('Last changed 3 Nov 2026, 5:05 pm')).toBeInTheDocument()
  })

  it('shows no admin email or editor, only the times', () => {
    // Catches an editor name or email appearing on the sheet.
    openSheet()
    expect(document.body.textContent).not.toMatch(/@|edited by|changed by/i)
  })

  it('hands the edited fields to Done and closes, and shows the pending value when reopened', () => {
    // Catches Done that loses an edit, or a reopened sheet that shows the stored value instead of the pending one.
    const spies = openSheet({ pending: { name: 'Knots' } })
    expect(screen.getByLabelText('Name')).toHaveValue('Knots')
    fireEvent.change(screen.getByLabelText('Price (RM)'), { target: { value: '5.5' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Nature' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(spies.onDone).toHaveBeenCalledWith({ name: 'Knots', category: 'Nature', priceCents: 550 })
    expect(spies.onClose).toHaveBeenCalled()
  })

  it('changes nothing when closed with Escape or the Close button', () => {
    // Catches an edit saved by a dismissal.
    const spies = openSheet()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Other' } })
    fireEvent(screen.getByRole('dialog'), new Event('close'))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(spies.onDone).not.toHaveBeenCalled()
    expect(spies.onClose).toHaveBeenCalled()
  })

  it('blocks an empty name, a long name, a duplicate name and a bad price, each with its line', () => {
    // Catches an invalid edit reaching the pending list, where the Worker would refuse the whole save.
    const spies = openSheet({ isNameTaken: (name: string) => name.toLowerCase() === 'knot tying 2' })
    const name = screen.getByLabelText('Name')
    fireEvent.change(name, { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Enter a name.')).toBeInTheDocument()
    fireEvent.change(name, { target: { value: 'x'.repeat(101) } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Names can be up to 100 characters.')).toBeInTheDocument()
    fireEvent.change(name, { target: { value: 'KNOT TYING 2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Another item is already called KNOT TYING 2.')).toBeInTheDocument()
    fireEvent.change(name, { target: { value: 'Knots' } })
    fireEvent.change(screen.getByLabelText('Price (RM)'), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Prices go up to 999.99.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Price (RM)'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Enter a price like 4.50.')).toBeInTheDocument()
    expect(spies.onDone).not.toHaveBeenCalled()
  })

  it('offers Delete item only for Club-added rows', () => {
    // Catches a Delete button on a built-in item, which the Worker refuses.
    openSheet()
    expect(screen.queryByRole('button', { name: 'Delete item' })).not.toBeInTheDocument()
  })

  it('opens the Delete dialog for a Club-added row, and deletes after a confirmation', async () => {
    // Catches a delete with no confirmation, or one that leaves the sheet open after it worked.
    const spies = openSheet({ honor: shirt })
    fireEvent.click(screen.getByRole('button', { name: 'Delete item' }))
    expect(screen.getByRole('heading', { name: 'Delete Camp Shirt?' })).toBeInTheDocument()
    expect(spies.onDelete).not.toHaveBeenCalled()
    const confirm = screen.getAllByRole('button', { name: 'Delete item' }).at(-1)!
    await act(async () => void fireEvent.click(confirm))
    expect(spies.onDelete).toHaveBeenCalledWith(shirt)
    expect(spies.onClose).toHaveBeenCalled()
  })
})

describe('Add sheet', () => {
  it('prefills the price with the default price from /api/meta and says new items start Hidden', () => {
    // Catches a price field that starts empty or at a hard-coded 4.00.
    openSheet({ mode: 'add', honor: undefined })
    expect(screen.getByRole('heading', { name: 'Add item' })).toBeInTheDocument()
    expect(screen.getByLabelText('Price (RM)')).toHaveValue('4.50')
    expect(screen.getByText('New items start Hidden with 0 in stock.')).toBeInTheDocument()
    expect(screen.queryByText(/^Created/)).not.toBeInTheDocument()
  })

  it('sends one request for a double click, then closes', async () => {
    // Catches a double click that adds the item twice.
    let finish: (kind: 'added') => void = () => undefined
    const onAdd = vi.fn(() => new Promise<'added'>((resolve) => (finish = resolve)))
    const spies = openSheet({ mode: 'add', honor: undefined, onAdd })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Camp Hat ' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Shirt' } })
    const add = screen.getByRole('button', { name: 'Add item' })
    fireEvent.click(add)
    fireEvent.click(add)
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith({ name: 'Camp Hat', category: 'Shirt', priceCents: 450 })
    await act(async () => finish('added'))
    expect(spies.onClose).toHaveBeenCalled()
  })

  it('asks for a category before adding', async () => {
    // Catches an Add with no category, which the Worker refuses.
    const spies = openSheet({ mode: 'add', honor: undefined })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Camp Hat' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    expect(screen.getByText('Choose a category.')).toBeInTheDocument()
    expect(spies.onAdd).not.toHaveBeenCalled()
  })

  it('shows the right line for name-taken, id-taken, signed-out and a failure, and stays open', async () => {
    // Catches two different refusals shown with one wrong sentence, or a sheet that closes on a failure.
    for (const [outcome, line] of [
      ['name-taken', 'Another item is already called Camp Hat.'],
      ['id-taken', "Couldn't add this item. Try a slightly different name."],
      ['signed-out', 'Your sign-in has ended. Open this page in a new tab to sign in, then try again.'],
      ['error', "We couldn't add the item. Try again."],
    ] as const) {
      const onAdd = vi.fn(() => Promise.resolve(outcome))
      const spies = openSheet({ mode: 'add', honor: undefined, onAdd })
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Camp Hat' } })
      fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Shirt' } })
      await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Add item' })))
      expect(screen.getByText(line)).toBeInTheDocument()
      expect(spies.onClose).not.toHaveBeenCalled()
      cleanup() // the next round renders afresh
    }
  })
})

describe('Picture section', () => {
  const resized = new Blob(['small'], { type: 'image/webp' }) // what the fake resize hands back
  const pictureDeps = {
    decode: vi.fn(() => Promise.resolve({ width: 10, height: 10, close: vi.fn() } as unknown as ImageBitmap)),
    makeCanvas: () =>
      ({
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (done: (blob: Blob | null) => void) => done(resized),
      }) as unknown as HTMLCanvasElement,
  } // browser pieces jsdom lacks, passed in
  const withPicture = makeItem({ ...knot, image: 'items/knot-tying.webp' }) // a row that has a picture

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:preview-1') // jsdom has no object URLs
    URL.revokeObjectURL = vi.fn()
    pictureDeps.decode.mockClear()
  })
  afterEach(() => cleanup())

  /** Chooses a file in the hidden input and waits for the preview. */
  async function choose() {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement // the hidden input
    fireEvent.change(input, { target: { files: [new File(['x'], 'photo.png', { type: 'image/png' })] } })
    await screen.findByRole('button', { name: 'Save picture' })
  }

  it('shows the current picture from /pictures, or the Category mark when there is none', () => {
    // Catches a picture loaded from the shop's domain in the admin, or a broken image where there is none.
    openSheet({ honor: withPicture, pictureDeps })
    expect(screen.getByText('Picture')).toBeInTheDocument()
    expect(document.querySelector('dialog img')).toHaveAttribute('src', '/pictures/items/knot-tying.webp')
    expect(screen.getByRole('button', { name: 'Replace picture' })).toBeInTheDocument()
    cleanup()
    openSheet({ pictureDeps })
    expect(document.querySelector('dialog img')).toBeNull()
    expect(screen.getByTestId('category-mark')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose picture' })).toBeInTheDocument()
  })

  it('opens the file chooser from Choose picture and Replace picture, but not while a file is being prepared', async () => {
    // Catches a Choose button that does nothing, so no picture can ever be added.
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined) // jsdom has no chooser
    onTestFinished(() => click.mockRestore()) // restored even when an assertion below fails
    openSheet({ pictureDeps })
    fireEvent.click(screen.getByRole('button', { name: 'Choose picture' }))
    expect(click).toHaveBeenCalledTimes(1) // the hidden file input opened
    cleanup()
    openSheet({ honor: withPicture, pictureDeps })
    fireEvent.click(screen.getByRole('button', { name: 'Replace picture' }))
    expect(click).toHaveBeenCalledTimes(2) // Replace opens it too
    const stuck = { ...pictureDeps, decode: vi.fn(() => new Promise<ImageBitmap>(() => undefined)) } // a resize that never ends
    cleanup()
    openSheet({ pictureDeps: stuck })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(['x'], 'photo.png', { type: 'image/png' })] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Choose picture' }))
    expect(click).toHaveBeenCalledTimes(2) // not while Preparing
  })

  it('has no Picture section in Add mode', () => {
    // Catches an upload offered for an item that does not exist yet.
    openSheet({ mode: 'add', honor: undefined, pictureDeps })
    expect(screen.queryByText('Picture')).not.toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('shows the preview with Save picture and Cancel after a file is chosen, and sends nothing yet', async () => {
    // Catches an upload that starts before the admin has seen the result.
    const spies = openSheet({ pictureDeps })
    await choose()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(document.querySelector('dialog img[src="blob:preview-1"]')).not.toBeNull()
    expect(spies.onPicture).not.toHaveBeenCalled()
  })

  it('drops the preview on Cancel and revokes its object URL', async () => {
    // Catches a leaked object URL, or a preview that stays after Cancel.
    openSheet({ pictureDeps })
    await choose()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')
    expect(screen.queryByRole('button', { name: 'Save picture' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose picture' })).toHaveFocus()
  })

  it('sends once for a double click, reading Saving… and disabled meanwhile', async () => {
    // Catches a double click that uploads two objects.
    let finish: (outcome: PictureOutcome) => void = () => undefined
    const onPicture = vi.fn(() => new Promise<PictureOutcome>((resolve) => (finish = resolve)))
    openSheet({ pictureDeps, onPicture })
    await choose()
    const save = screen.getByRole('button', { name: 'Save picture' })
    fireEvent.click(save)
    fireEvent.click(save)
    expect(onPicture).toHaveBeenCalledTimes(1)
    expect(onPicture).toHaveBeenCalledWith(knot, resized)
    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveAttribute('aria-disabled', 'true')
    await act(async () => finish('saved'))
  })

  it('says Picture saved. and shows the new picture after a save', async () => {
    // Catches a save with no confirmation, or a sheet that keeps showing the old picture.
    const spies = openSheet({ pictureDeps, honor: withPicture })
    await choose()
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Save picture' })))
    expect(screen.getByRole('status')).toHaveTextContent('Picture saved.')
    spies.rerender(
      <ItemSheet
        mode="edit"
        honor={{ ...withPicture, image: 'items/knot-tying-1a2b3c4d.webp' }}
        categories={meta.categories}
        currency={meta.currency}
        defaultPriceCents={meta.defaultPriceCents}
        onDone={spies.onDone}
        onAdd={spies.onAdd}
        onDelete={spies.onDelete}
        onPicture={spies.onPicture}
        onClose={spies.onClose}
        pictureDeps={pictureDeps}
      />,
    ) // the screen hands the saved row down
    expect(document.querySelector('dialog img')).toHaveAttribute('src', '/pictures/items/knot-tying-1a2b3c4d.webp')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')
    expect(screen.getByRole('button', { name: 'Replace picture' })).toHaveFocus()
  })

  it('shows the failure with Try again, which sends the same picture again', async () => {
    // Catches a failed upload that loses the picture, or one that fails silently.
    const onPicture = vi.fn(() => Promise.resolve('error' as PictureOutcome))
    openSheet({ pictureDeps, onPicture })
    await choose()
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Save picture' })))
    expect(screen.getByRole('alert')).toHaveTextContent("The picture wasn't saved.")
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Try again' })))
    expect(onPicture).toHaveBeenCalledTimes(2)
    expect(onPicture.mock.calls[1]).toEqual([knot, resized])
  })

  it('says This item has been updated. on a conflict and drops the preview', async () => {
    // Catches a refused upload shown as saved.
    openSheet({ pictureDeps, onPicture: vi.fn(() => Promise.resolve('conflict' as PictureOutcome)) })
    await choose()
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Save picture' })))
    expect(screen.getByRole('status')).toHaveTextContent('This item has been updated.')
    expect(screen.queryByRole('button', { name: 'Save picture' })).not.toBeInTheDocument()
  })

  it('shows the sign-in line when the session has ended', async () => {
    // Catches an expired session reported as a plain failure with a Try again that cannot work.
    openSheet({ pictureDeps, onPicture: vi.fn(() => Promise.resolve('signed-out' as PictureOutcome)) })
    await choose()
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Save picture' })))
    expect(screen.getByRole('alert')).toHaveTextContent('Your sign-in has ended.')
  })

  it('explains a file that will not open and sends nothing', async () => {
    // Catches a text file renamed x.png reaching the Worker.
    pictureDeps.decode.mockRejectedValueOnce(new Error('bad'))
    const spies = openSheet({ pictureDeps })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['not a picture'], 'x.png', { type: 'image/png' })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This file can't be used as a picture. Choose a PNG, JPEG or WebP file.",
    )
    expect(spies.onPicture).not.toHaveBeenCalled()
  })

  it('survives the sheet closing mid-save', async () => {
    // Catches a state update or thrown error after unmount, and a leaked object URL.
    let finish: (outcome: PictureOutcome) => void = () => undefined
    const onPicture = vi.fn(() => new Promise<PictureOutcome>((resolve) => (finish = resolve)))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined) // React warns on a late update
    openSheet({ pictureDeps, onPicture })
    await choose()
    fireEvent.click(screen.getByRole('button', { name: 'Save picture' }))
    cleanup() // the sheet goes mid-save
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')
    await act(async () => finish('saved'))
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })
})
