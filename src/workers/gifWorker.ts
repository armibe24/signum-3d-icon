/* ============================================================
   GIF encoding worker — streams frames through gifenc so the
   main thread never blocks on palette quantization. Supports
   1-bit transparency: fully transparent pixels map to a reserved
   palette slot and frames use disposal mode 2 (restore to bg).
   ============================================================ */

import { GIFEncoder, quantize, applyPalette } from 'gifenc'

interface InitMsg {
  type: 'init'
  width: number
  height: number
  delayMs: number
  transparent: boolean
  dither: boolean
}
interface FrameMsg {
  type: 'frame'
  data: Uint8ClampedArray
}
interface FinishMsg {
  type: 'finish'
}
type InMsg = InitMsg | FrameMsg | FinishMsg

let gif: ReturnType<typeof GIFEncoder> | null = null
let width = 0
let height = 0
let delayMs = 100
let transparent = false
let dither = false

/* ------------------------------------------------------------------ */
/* ordered (Bayer 8×8) dithering                                       */
/*                                                                     */
/* gifenc has no dithering of its own — colors snap to the nearest     */
/* palette entry, which bands smooth material/lighting gradients.      */
/* An ordered threshold matrix is the right choice for ANIMATED GIFs:  */
/* it is a pure function of pixel position, so the pattern is rock     */
/* steady across frames (error-diffusion like Floyd–Steinberg re-      */
/* distributes per frame and makes gradients crawl/shimmer).           */
/* ------------------------------------------------------------------ */

// classic 8×8 Bayer matrix, values 0..63
const BAYER8 = [
   0, 32,  8, 40,  2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44,  4, 36, 14, 46,  6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
   3, 35, 11, 43,  1, 33,  9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47,  7, 39, 13, 45,  5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
]

/**
 * Returns a dithered copy of `rgba`: each color channel is offset by a
 * position-dependent threshold spanning ±half a quantization step
 * (gifenc's rgb444/rgba4444 formats bucket channels to 4 bits → step 17).
 * The palette is still built from the ORIGINAL pixels, so dithering only
 * changes which of the true colors each pixel snaps to. Alpha untouched.
 */
function orderedDither(rgba: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(rgba.length)
  const STEP = 17 // 255 / 15, one 4-bit quantization step
  for (let y = 0; y < h; y++) {
    const row = (y & 7) << 3
    for (let x = 0; x < w; x++) {
      const t = ((BAYER8[row | (x & 7)] + 0.5) / 64 - 0.5) * STEP
      const p = (y * w + x) * 4
      const r = rgba[p] + t
      const g = rgba[p + 1] + t
      const b = rgba[p + 2] + t
      out[p] = r < 0 ? 0 : r > 255 ? 255 : r
      out[p + 1] = g < 0 ? 0 : g > 255 ? 255 : g
      out[p + 2] = b < 0 ? 0 : b > 255 ? 255 : b
      out[p + 3] = rgba[p + 3]
    }
  }
  return out
}

self.onmessage = (ev: MessageEvent<InMsg>) => {
  const msg = ev.data
  try {
    if (msg.type === 'init') {
      gif = GIFEncoder()
      width = msg.width
      height = msg.height
      delayMs = msg.delayMs
      transparent = msg.transparent
      dither = msg.dither
      return
    }

    if (msg.type === 'frame') {
      if (!gif) throw new Error('GIF encoder not initialized')
      const rgba = new Uint8Array(msg.data.buffer)

      // rgba4444 keeps a 4-bit alpha channel through quantization
      const format = transparent ? 'rgba4444' : 'rgb444'
      const maxColors = transparent ? 255 : 256
      const palette = quantize(rgba, maxColors, { format })
      const mapped = dither ? orderedDither(rgba, width, height) : rgba
      const index = applyPalette(mapped, palette, format)

      let transparentIndex = 0
      if (transparent) {
        // reserve one palette slot for fully-transparent pixels
        transparentIndex = palette.length
        palette.push([0, 0, 0, 0])
        for (let i = 0, p = 3; i < index.length; i++, p += 4) {
          if (rgba[p] < 128) index[i] = transparentIndex
        }
      }

      gif.writeFrame(index, width, height, {
        palette,
        delay: delayMs,
        transparent,
        transparentIndex,
        // disposal 2 = clear to background between frames (needed for alpha)
        dispose: transparent ? 2 : -1,
      })
      self.postMessage({ type: 'frame-done' })
      return
    }

    if (msg.type === 'finish') {
      if (!gif) throw new Error('GIF encoder not initialized')
      gif.finish()
      const bytes = gif.bytes()
      gif = null
      self.postMessage({ type: 'done', bytes }, { transfer: [bytes.buffer] })
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}
