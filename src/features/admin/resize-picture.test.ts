// Tests for the browser-side picture resize with a fake decoder and canvas: the 200 px cap, never scaling up, the encoded type passed on, and the two ways a file is refused.

import { describe, expect, it, vi } from 'vitest' // test API
import { resizePicture } from './resize-picture.ts' // the code under test

/**
 * Builds fake browser pieces.
 * @param size the decoded picture's width and height
 * @param encoded what toBlob hands back: a Blob, or null for a failed encode
 * @return the deps, and the canvas spy that was made
 */
function fakes(size: { width: number; height: number }, encoded: Blob | null) {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toBlob: vi.fn((done: (blob: Blob | null) => void) => done(encoded)),
  } // a canvas that records its size
  const deps = {
    decode: vi.fn(() => Promise.resolve({ ...size, close: vi.fn() } as unknown as ImageBitmap)),
    makeCanvas: vi.fn((width: number, height: number) => {
      canvas.width = width // the size asked for
      canvas.height = height
      return canvas as unknown as HTMLCanvasElement
    }),
  } // the passed-in browser pieces
  return { deps, canvas }
}

const webp = new Blob(['w'], { type: 'image/webp' }) // an encoded WebP
const png = new Blob(['p'], { type: 'image/png' }) // an encoded PNG
const source = new Blob(['x'], { type: 'image/jpeg' }) // the chosen file

describe('resizePicture', () => {
  it.each([
    [1000, 500, 200, 100],
    [300, 300, 200, 200],
    [120, 80, 120, 80],
    [500, 1000, 100, 200],
  ])('turns %i x %i into %i x %i', async (width, height, wantWidth, wantHeight) => {
    // Catches a wrong scale, an upscale of a small picture, or a lost aspect ratio.
    const { deps, canvas } = fakes({ width, height }, webp)
    await resizePicture(source, deps)
    expect([canvas.width, canvas.height]).toEqual([wantWidth, wantHeight])
  })

  it('asks for high smoothing quality before it draws', async () => {
    // Catches a large photo shrunk at the default low quality, which jags fine lines.
    const { deps, canvas } = fakes({ width: 2000, height: 1000 }, webp)
    const context = { imageSmoothingQuality: 'low', drawImage: vi.fn(() => (qualityAtDraw = context.imageSmoothingQuality)) } // records the quality at the draw
    let qualityAtDraw = '' // what the draw saw
    canvas.getContext = () => context as never // the canvas hands out this pen
    await resizePicture(source, deps)
    expect(qualityAtDraw).toBe('high')
  })

  it('sends the WebP the browser made', async () => {
    // Catches a re-labelled or re-encoded WebP.
    const { deps, canvas } = fakes({ width: 400, height: 400 }, webp)
    expect(await resizePicture(source, deps)).toEqual({ kind: 'ok', picture: webp })
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.85)
  })

  it('sends the PNG a Safari-like browser falls back to', async () => {
    // Catches code that insists on WebP and refuses Safari's PNG.
    const { deps } = fakes({ width: 400, height: 400 }, png)
    expect(await resizePicture(source, deps)).toEqual({ kind: 'ok', picture: png })
  })

  it('answers not-a-picture when the file will not decode', async () => {
    // Catches a rejected decode that escapes as an unhandled error.
    const { deps } = fakes({ width: 10, height: 10 }, webp)
    deps.decode.mockRejectedValueOnce(new Error('bad'))
    expect(await resizePicture(source, deps)).toEqual({ kind: 'not-a-picture' })
  })

  it('answers not-a-picture when the encoder gives nothing', async () => {
    // Catches a null blob sent on as a picture.
    const { deps } = fakes({ width: 10, height: 10 }, null)
    expect(await resizePicture(source, deps)).toEqual({ kind: 'not-a-picture' })
  })
})
