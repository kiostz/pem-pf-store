// Shrinks a chosen picture to 200 px in the browser before it is uploaded, so the Admin Worker only ever stores small WebP (or PNG, in Safari) files.

const MAX_SIDE = 200 // the longest side a stored picture may have
const QUALITY = 0.85 // WebP quality

// The browser pieces jsdom lacks, passed in so tests can fake them.
export type ResizeDeps = {
  decode: (file: Blob) => Promise<ImageBitmap> // opens the file
  makeCanvas: (width: number, height: number) => HTMLCanvasElement // a canvas of that size
}
// What a resize ends in.
export type ResizeResult = { kind: 'ok'; picture: Blob } | { kind: 'not-a-picture' } // the picture, or a refusal

// The real browser pieces.
export const browserResizeDeps: ResizeDeps = {
  decode: (file) => createImageBitmap(file), // applies the photo's rotation
  makeCanvas: (width, height) => {
    const canvas = document.createElement('canvas') // an off-screen canvas
    canvas.width = width // its size
    canvas.height = height // the same for the height
    return canvas // ready to draw on
  },
}

/**
 * Resizes a picture so its longest side is at most 200 px, keeping the aspect ratio and transparency.
 * @param file the chosen file
 * @param deps the decoder and the canvas factory
 * @return the encoded picture (WebP, or PNG where WebP is not offered), or not-a-picture when the file will not open or encode
 */
export async function resizePicture(file: Blob, deps: ResizeDeps): Promise<ResizeResult> {
  let bitmap: ImageBitmap // the opened picture
  try {
    bitmap = await deps.decode(file) // opens the file
  } catch {
    return { kind: 'not-a-picture' } // a text file, a broken image
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height)) // never scales up
  const width = Math.max(1, Math.round(bitmap.width * scale)) // the new width
  const height = Math.max(1, Math.round(bitmap.height * scale)) // the new height
  const canvas = deps.makeCanvas(width, height) // the drawing surface
  const context = canvas.getContext('2d') // its pen
  if (context === null) return { kind: 'not-a-picture' } // no canvas support
  context.imageSmoothingQuality = 'high' // a big photo shrunk in one step keeps its fine lines
  context.drawImage(bitmap, 0, 0, width, height) // the shrunken picture
  bitmap.close?.() // frees the decoded pixels
  const picture = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY)) // PNG comes back where WebP is not offered
  if (picture === null || (picture.type !== 'image/webp' && picture.type !== 'image/png')) return { kind: 'not-a-picture' } // an encode that failed or gave another type
  return { kind: 'ok', picture } // ready to upload
}
