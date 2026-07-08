/* ============================================================
   GIF export — pixels are read once per frame on the main thread
   (WebGL canvases can't move to a worker) and transferred to the
   gifWorker for quantization + encoding. Each frame waits for the
   worker's ack, which doubles as backpressure.
   ============================================================ */

import type { AnimationEncoder } from './exporter'
import type { ExportRenderer } from './renderer'

export function createGifEncoder(
  width: number,
  height: number,
  fps: number,
  transparent: boolean,
): AnimationEncoder {
  const worker = new Worker(new URL('../../workers/gifWorker.ts', import.meta.url), {
    type: 'module',
  })

  let rejectAll: (e: Error) => void = () => {}
  let ackFrame: (() => void) | null = null
  let resolveDone: ((bytes: Uint8Array) => void) | null = null
  // sticky failure: a worker error arriving BETWEEN frames used to hit an
  // already-settled promise and vanish, leaving the export hung on a
  // broken encoder — remember it and fail the next call instead
  let failure: Error | null = null

  const fail = (e: Error) => {
    failure = e
    rejectAll(e)
  }

  worker.onmessage = (ev: MessageEvent<{ type: string; bytes?: Uint8Array; message?: string }>) => {
    if (ev.data.type === 'frame-done') ackFrame?.()
    else if (ev.data.type === 'done' && ev.data.bytes) resolveDone?.(ev.data.bytes)
    else if (ev.data.type === 'error') fail(new Error(ev.data.message ?? 'GIF encoding failed'))
  }
  worker.onerror = (e) => fail(new Error(e.message || 'GIF worker crashed'))

  worker.postMessage({
    type: 'init',
    width,
    height,
    delayMs: Math.round(1000 / fps),
    transparent,
  })

  return {
    addFrame(ex: ExportRenderer) {
      return new Promise<void>((resolve, reject) => {
        if (failure) {
          reject(failure)
          return
        }
        rejectAll = reject
        ackFrame = resolve
        const pixels = ex.readPixels()
        worker.postMessage({ type: 'frame', data: pixels.data }, [pixels.data.buffer])
      })
    },
    finish() {
      return new Promise<{ blob: Blob; extension: string }>((resolve, reject) => {
        if (failure) {
          reject(failure)
          return
        }
        rejectAll = reject
        resolveDone = (bytes) => {
          worker.terminate()
          resolve({ blob: new Blob([bytes as BlobPart], { type: 'image/gif' }), extension: 'gif' })
        }
        worker.postMessage({ type: 'finish' })
      })
    },
    abort() {
      worker.terminate()
    },
  }
}
