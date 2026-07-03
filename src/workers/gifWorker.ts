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

self.onmessage = (ev: MessageEvent<InMsg>) => {
  const msg = ev.data
  try {
    if (msg.type === 'init') {
      gif = GIFEncoder()
      width = msg.width
      height = msg.height
      delayMs = msg.delayMs
      transparent = msg.transparent
      return
    }

    if (msg.type === 'frame') {
      if (!gif) throw new Error('GIF encoder not initialized')
      const rgba = new Uint8Array(msg.data.buffer)

      // rgba4444 keeps a 4-bit alpha channel through quantization
      const format = transparent ? 'rgba4444' : 'rgb444'
      const maxColors = transparent ? 255 : 256
      const palette = quantize(rgba, maxColors, { format })
      const index = applyPalette(rgba, palette, format)

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
