// Tests for HomeScreen: the welcome band, the category tiles and the ordering steps, and the emblem trace (outline and canvases) behind the band's text.

import { act, render, screen, within } from '@testing-library/react' // render and query; act wraps the frames that set state
import { afterEach, describe, expect, it, vi } from 'vitest' // test API
import type { CatalogueLoad } from '@/features/catalogue/use-catalogue-data.ts' // the load Home receives
import { HomeScreen } from './HomeScreen.tsx' // code under test

const loading = { state: { status: 'loading' }, showSkeleton: false, retry: () => {} } as CatalogueLoad // nothing loaded yet: the band and steps do not wait

describe('HomeScreen', () => {
  it('shows the headline and line as written', () => {
    // catches: copy drifting from the approved wording
    render(<HomeScreen data={loading} />)
    expect(
      screen.getByRole('heading', { level: 2, name: 'Everything your club needs, in one order' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText("Pick the items, send your details, and we'll email your invoice once we've checked it."),
    ).toBeInTheDocument()
  })

  it('has one Browse the shop link to #/shop whose name has no chevron', () => {
    // catches: the decorative > leaking into the accessible name, or a wrong address
    render(<HomeScreen data={loading} />)
    const links = screen.getAllByRole('link', { name: 'Browse the shop' })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '#/shop')
  })

  it('ends with an Admin link to the live admin, after How ordering works, in the same tab and 44 px tall', () => {
    // catches: a missing way in for the admin, a link that opens a new tab, a target under 44 px, or one placed above the steps
    render(<HomeScreen data={loading} />)
    const admin = screen.getByRole('link', { name: 'Admin' })
    expect(admin).toHaveAttribute('href', 'https://pem-pathfinder-store-admin.pempathfinder.workers.dev/')
    expect(admin).not.toHaveAttribute('target')
    expect(admin).toHaveClass('min-h-11', 'text-text-muted', 'print:hidden')
    const steps = screen.getByRole('heading', { name: 'How ordering works' })
    expect(steps.compareDocumentPosition(admin) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy() // after the steps' heading
    expect(screen.getByRole('list').compareDocumentPosition(admin) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy() // and after the steps themselves
  })

  it('gives the steps card the same 1 px hairline as the shop cards', () => {
    // catches: S7, the white steps block melting into the stone page for want of its edge
    render(<HomeScreen data={loading} />)
    const card = screen.getByRole('list') // the ordered list is the white block
    expect(card).toHaveClass('border', 'border-border-subtle')
  })

  it('lists the three steps in an ordered list, in order', () => {
    // catches: steps out of order or not a list
    render(<HomeScreen data={loading} />)
    const steps = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(steps.map((step) => step.textContent)).toEqual([
      '1Pick your itemsAdd what your club needs to the cart.',
      '2Send your detailsName, email, phone and club. No payment yet.',
      '3Get your invoiceWe check the order and email the final total.',
    ])
    expect(screen.getByRole('list').tagName).toBe('OL')
    expect(screen.getByRole('heading', { name: 'Shop by category' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How ordering works' })).toBeInTheDocument()
  })

  it('has no search box', () => {
    // catches: the catalogue toolbar leaking onto Home
    render(<HomeScreen data={loading} />)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('draws the emblem as a hidden, unfocusable drawing with one path of length 1000 and no letters', () => {
    // catches: a drawing that reads aloud, takes focus, holds text or covers the button
    const { container } = render(<HomeScreen data={loading} />)
    const trace = container.querySelector('[data-testid="emblem-trace"]')!
    expect(trace).toHaveAttribute('aria-hidden', 'true')
    expect(trace.querySelector('text')).toBeNull()
    expect(trace.querySelector('a, button, [tabindex]')).toBeNull()
    expect(trace).toHaveClass('pointer-events-none', 'print:hidden')
    expect(trace.querySelectorAll('path')).toHaveLength(1)
    expect(trace.querySelector('path[pathLength="1000"]')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Browse the shop' })).toBeInTheDocument()
  })
})

describe('HomeScreen layout', () => {
  it('keeps the drawing in the flow under the text on a phone and behind it from 640 px', () => {
    // catches: the drawing sitting under the headline at 375, where the bright head makes the letters unreadable
    const { container } = render(<HomeScreen data={loading} />)
    const trace = container.querySelector('[data-testid="emblem-trace"]')!
    expect(trace.getAttribute('class')).toContain('sm:absolute')
    expect(trace.getAttribute('class')).not.toMatch(/(^|\s)absolute(\s|$)/)
    const text = screen.getByRole('heading', { level: 2, name: /Everything your club/ }).parentElement!
    expect(text.compareDocumentPosition(trace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy() // after the text in the flow
  })

  it('draws the resting outline clearly: a 2 px stroke at 0.55 opacity, the same for Reduce Motion', () => {
    // catches: an outline so faint (1.2 px at 0.3) that nothing is left once the trace has played
    const { container } = render(<HomeScreen data={loading} />)
    const outline = container.querySelector('[data-testid="emblem-trace"] path')!
    expect(outline.getAttribute('stroke-width')).toBe('2')
    expect(outline.getAttribute('stroke-opacity')).toBe('0.55')
  })

  it('stops the text column short of the drawing from 640 px, so no letter ever sits over the outline', () => {
    // catches: text over the 0.55 outline, where stone on the blended band falls to 3.8:1
    render(<HomeScreen data={loading} />)
    const text = screen.getByRole('heading', { level: 2, name: /Everything your club/ }).parentElement!
    expect(text.className).toContain('sm:max-w-[min(36rem,calc(100%-12rem))]')
  })

  it('prints the headline and Browse the shop, hiding only the drawing', () => {
    // catches: the whole band vanishing from paper
    const { container } = render(<HomeScreen data={loading} />)
    const band = screen.getByRole('heading', { level: 2, name: /Everything your club/ }).closest('section')!
    expect(band).not.toHaveClass('print:hidden')
    expect(band).toHaveClass('print:bg-transparent', 'print:text-text-default') // as the header, so stone text never lands on white paper
    expect(container.querySelector('[data-testid="emblem-trace"]')).toHaveClass('print:hidden')
  })
})

describe('emblem trace canvases', () => {
  const getContext = HTMLCanvasElement.prototype.getContext // jsdom's own, put back after each test
  const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth') // jsdom's own sizes
  const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight') // same
  const readFrom: SVGElement[] = [] // the elements whose points were read
  let readCount = 0 // how many points were read
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = getContext // put back the canvas
    if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth) // put back the sizes
    else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth') // none of its own
    if (clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight) // same
    else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight') // same
    vi.useRealTimers() // real clock again
    vi.unstubAllGlobals() // matchMedia and animation frames back
    for (const name of ['--duration-trace', '--color-trace', '--color-trace-bright', '--color-trace-core']) {
      document.documentElement.style.removeProperty(name) // the stylesheet is not loaded in jsdom
    }
    delete (SVGElement.prototype as Partial<SVGGeometryElement>).getPointAtLength // the path method the test added
    delete (SVGElement.prototype as Partial<SVGGeometryElement>).getTotalLength // same
  })

  /**
   * Makes a drawing context that records the calls and the composite modes the loop sets, and a log of its drawing in order.
   * @return the context
   */
  function fakeContext() {
    const modes: string[] = [] // every globalCompositeOperation set
    const log: string[] = [] // clears, strokes (with the cap and mode in force), fills and image copies, in order
    let cap = 'butt' // the cap in force
    let mode = 'source-over' // the composite mode in force
    return {
      modes,
      log,
      clearRect: vi.fn((...box: number[]) => void log.push(`clear ${box.join(',')}`)),
      setTransform: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(() => void log.push(`stroke ${cap} ${mode}`)),
      arc: vi.fn(),
      fill: vi.fn(() => void log.push('fill')),
      drawImage: vi.fn((...args: unknown[]) => void log.push(`drawImage ${args.length}`)), // the source canvas and its box
      set globalCompositeOperation(value: string) {
        modes.push(value) // recorded
        mode = value // in force
      },
      set lineWidth(_value: number) {}, // accepted
      set lineJoin(_value: string) {}, // accepted
      set strokeStyle(_value: string) {}, // accepted
      set fillStyle(_value: string) {}, // accepted
      set lineCap(value: string) {
        cap = value // in force
      },
    }
  }

  /**
   * The log of the last frame a context drew: everything after its last clear.
   * @param log the context's log
   * @return the entries of that frame
   */
  const lastFrame = (log: string[]) => log.slice(log.map((entry) => entry.startsWith('clear')).lastIndexOf(true) + 1)

  /**
   * Gives jsdom what the trace loop needs: one recording context per canvas, a box size, path reading and the style tokens.
   * @param pointAt where the path is at a length along it; a straight line by default
   * @return the main and the bloom canvas's contexts
   */
  function giveCanvas(pointAt: (at: number) => { x: number; y: number } = (at) => ({ x: at / 10, y: 20 })) {
    readFrom.length = 0 // a fresh record
    readCount = 0 // same
    const contexts = { main: fakeContext(), bloom: fakeContext() } // one per canvas
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
      return this.dataset.testid === 'emblem-bloom' ? contexts.bloom : contexts.main // by canvas
    } as never
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 206 }) // the box: the 174 wide SVG box and 16 px each side
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 202 }) // the box: the 170 high SVG box and 16 px each side
    ;(SVGElement.prototype as unknown as SVGGeometryElement).getTotalLength = () => 1000 // the path length
    ;(SVGElement.prototype as unknown as SVGGeometryElement).getPointAtLength = function (
      this: SVGElement,
      at: number,
    ) {
      readFrom.push(this) // which element the loop reads
      readCount += 1 // one more reading
      return pointAt(at) as DOMPoint // the fake path
    }
    document.documentElement.style.setProperty('--duration-trace', '4800ms') // read like the stylesheet's token
    document.documentElement.style.setProperty('--color-trace', '#e8b4bc') // the rose
    document.documentElement.style.setProperty('--color-trace-bright', '#fff3f5') // the bright rose
    document.documentElement.style.setProperty('--color-trace-core', '#ffffff') // the white core
    return contexts
  }

  /**
   * Runs the fake clock inside act, since the loop sets state when it ends.
   * @param ms how long to run
   */
  const run = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

  /** Fake timers for animation frames, and a matchMedia that allows motion. */
  function useMotion() {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
  }

  /**
   * Finds the outline SVG.
   * @param container the rendered Home
   * @return the SVG element
   */
  const svgOf = (container: HTMLElement) => container.querySelector('[data-testid="emblem-outline"]')!

  it('puts both canvases in the SVG box: hidden from assistive tech, ignoring the pointer, off paper', () => {
    // catches: a decorative canvas that a screen reader announces, blocks the button or prints
    const { container } = render(<HomeScreen data={loading} />)
    const boxClasses = container.querySelector('[data-testid="emblem-trace"]')!.getAttribute('class')! // the one box all three sit in
    for (const box of ['h-42.5', 'w-43.5', 'sm:absolute', 'sm:right-0']) expect(boxClasses).toContain(box)
    for (const id of ['emblem-canvas', 'emblem-bloom']) {
      const canvas = container.querySelector(`[data-testid="${id}"]`)!
      expect(canvas.tagName).toBe('CANVAS')
      expect(canvas).toHaveAttribute('aria-hidden', 'true')
      expect(canvas).toHaveClass('pointer-events-none', 'print:hidden')
      expect(canvas).toHaveClass(id)
      expect(canvas.parentElement).toBe(svgOf(container).parentElement) // in the SVG's box
      expect(canvas.getAttribute('class')).toMatch(/(^|\s)absolute(\s|$)/) // out of the flow, so the box keeps 174 x 170
      for (const reach of ['-top-4', '-left-4', 'h-[calc(100%+2rem)]', 'w-[calc(100%+2rem)]']) expect(canvas.getAttribute('class')).toContain(reach) // 16 px beyond the box on every side; a canvas does not stretch between insets, so its size is stated
    }
  })

  it('draws 16 px beyond the SVG box, so the head glow is never cut by a straight edge', () => {
    // catches: a canvas exactly the size of the SVG box, which clips the halo and rays flat while the head is near the top or left edge
    useMotion()
    const { main, bloom } = giveCanvas()
    render(<HomeScreen data={loading} />)
    run(100)
    const matrices = main.setTransform.mock.calls.map((call) => call as number[])
    const path = matrices.find((call) => call[0] !== 1)! // the path-units matrix: scale, then the offset
    expect(path[4]).toBeCloseTo(18, 1) // 16 px margin + the letterbox + the viewBox's 2 units
    expect(path[5]).toBeCloseTo(17.95, 1)
    expect(main.log[0]).toBe('clear 0,0,206,202') // the whole canvas, margin included
    expect(bloom.log[0]).toBe('clear 0,0,103,101') // the half-size copy
  })

  it('shows the SVG outline and never asks for a frame or a context under Reduce Motion', () => {
    // catches: a trace running for people who asked for no motion, or a blank band with no outline
    const contexts = giveCanvas()
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }))
    const frame = vi.fn(() => 1)
    vi.stubGlobal('requestAnimationFrame', frame)
    const { container } = render(<HomeScreen data={loading} />)
    expect(frame).not.toHaveBeenCalled()
    expect(spy).not.toHaveBeenCalled()
    expect(contexts.main.stroke).not.toHaveBeenCalled()
    expect(svgOf(container)).not.toHaveClass('opacity-0')
    spy.mockRestore()
  })

  it('shows the outline and throws nothing without a canvas context', () => {
    // catches: an error, or a blank band, on a browser with no 2D canvas
    giveCanvas() // a readable path and tokens, so only the context is missing
    HTMLCanvasElement.prototype.getContext = (() => null) as never // no context
    const frame = vi.fn(() => 1)
    vi.stubGlobal('requestAnimationFrame', frame)
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
    let container!: HTMLElement
    expect(() => ({ container } = render(<HomeScreen data={loading} />))).not.toThrow()
    expect(frame).not.toHaveBeenCalled()
    expect(svgOf(container)).not.toHaveClass('opacity-0')
  })

  it('shows the outline and throws nothing when the path cannot be read', () => {
    // catches: an error where getPointAtLength is missing (old browsers, jsdom)
    const spy = vi.fn(() => null)
    HTMLCanvasElement.prototype.getContext = spy as never
    const frame = vi.fn(() => 1)
    vi.stubGlobal('requestAnimationFrame', frame)
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
    let container!: HTMLElement
    expect(() => ({ container } = render(<HomeScreen data={loading} />))).not.toThrow()
    expect(frame).not.toHaveBeenCalled()
    expect(spy).not.toHaveBeenCalled() // no context allocated for a drawing that cannot run
    expect(svgOf(container)).not.toHaveClass('opacity-0')
  })

  it('reads its geometry from the one outline path, only the emblem line', () => {
    // catches: a second copy of the path, or reading the Browse the shop chevron
    useMotion()
    giveCanvas()
    render(<HomeScreen data={loading} />)
    expect(readFrom.length).toBeGreaterThan(0)
    for (const element of readFrom) expect(element).toHaveAttribute('pathLength', '1000')
    expect(new Set(readFrom).size).toBe(1) // the same element every time
  })

  it('hides the SVG outline while playing and lights with additive blending, sparks and a bloom copy', () => {
    // catches: the outline showing through the build, a trace that only normal-blends, no sparks or a bloom that never receives the frame
    useMotion()
    const { main, bloom } = giveCanvas()
    const { container } = render(<HomeScreen data={loading} />)
    run(2000)
    expect(svgOf(container)).toHaveClass('opacity-0')
    expect(main.modes).toContain('lighter')
    const afterHead = lastFrame(main.log).slice(lastFrame(main.log).lastIndexOf('fill') + 1) // the strokes after the head's last fill: 4 rays, then the sparks
    expect(afterHead.filter((entry) => entry.startsWith('stroke')).length - 4).toBeGreaterThanOrEqual(8) // at 40 a second living about 0.35 s, a dozen are alive
    const copies = bloom.drawImage.mock.calls.filter(
      ([source]) => (source as HTMLElement).dataset.testid === 'emblem-canvas',
    )
    expect(copies.length).toBeGreaterThan(0)
  })

  it('at 4.8 s stops asking for frames, clears both canvases and shows the outline', () => {
    // catches: motion after 5 s (WCAG 2.2.2), a frozen last frame, or a blank band with no outline
    useMotion()
    const { main, bloom } = giveCanvas()
    const { container } = render(<HomeScreen data={loading} />)
    run(2500)
    expect(vi.getTimerCount()).toBe(1) // still running
    main.log.length = 0 // forget the frames so far: only what the end does counts
    bloom.log.length = 0 // same
    run(2500) // past 4.8 s
    expect(main.log.filter((entry) => entry.startsWith('clear')).length).toBeGreaterThan(0)
    expect(main.log[main.log.length - 1]).toBe('clear 0,0,206,202') // the last thing on the heat canvas is a full clear, with no draw after it
    expect(bloom.log[bloom.log.length - 1]).toBe('clear 0,0,103,101') // same on the bloom
    expect(vi.getTimerCount()).toBe(0) // no pending frame
    expect(svgOf(container)).not.toHaveClass('opacity-0')
    main.stroke.mockClear()
    run(2000)
    expect(main.stroke).not.toHaveBeenCalled()
  })

  it('strokes the covered ground with a butt cap where it meets the warm pieces, round only at true ends', () => {
    // catches: a round cap on the covered line's open end, which overlaps the first warm piece and shines as a bead 1.5 s behind the head
    useMotion()
    const { main } = giveCanvas((at) => (at < 500 ? { x: at / 10, y: 20 } : { x: (at - 500) / 10, y: 60 })) // two subpaths: a pen lift at 500
    render(<HomeScreen data={loading} />)
    run(4000) // the first subpath is long cool, the second still warm at its end
    const covered = lastFrame(main.log).filter((entry) => entry.endsWith('source-over') && entry.startsWith('stroke')) // the covered ground's strokes
    expect(covered).toEqual(['stroke round source-over', 'stroke butt source-over']) // the cool subpath, ends and all; then the open run, cut square
  })

  it('stops requesting frames and draws nothing more once Home is left mid-play', () => {
    // catches: a clean-up that cancels the wrong frame, leaving a loop drawing on a detached canvas for each visit
    useMotion()
    const { main, bloom } = giveCanvas()
    const { unmount } = render(<HomeScreen data={loading} />)
    run(1000)
    expect(main.stroke).toHaveBeenCalled() // it was drawing
    unmount()
    expect(vi.getTimerCount()).toBe(0) // no frame left pending
    main.stroke.mockClear()
    main.clearRect.mockClear()
    bloom.drawImage.mockClear()
    run(4000)
    expect(main.stroke).not.toHaveBeenCalled()
    expect(main.clearRect).not.toHaveBeenCalled()
    expect(bloom.drawImage).not.toHaveBeenCalled()
  })

  it('reads the path once up front, not once per frame', () => {
    // catches: a path walk per piece per frame for a path that never changes
    useMotion()
    giveCanvas()
    render(<HomeScreen data={loading} />)
    run(100) // the first frames
    const early = readCount
    run(1900) // about 115 frames more
    expect(readCount - early).toBeLessThanOrEqual(2000 / 25 + 2) // only sparks' births (40 a second, each read once)
    expect(early).toBeLessThanOrEqual(501 + 5) // the pieces at one sample per 2 units, plus the births so far
  })
})
