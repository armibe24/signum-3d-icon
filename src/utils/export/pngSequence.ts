/* ============================================================
   PNG sequence export — one transparent-capable PNG per frame,
   packed into a ZIP. fflate's async `zip` runs compression in its
   own internal workers; PNGs are stored uncompressed (level 0)
   since they are already deflated.
   ============================================================ */

import { zip } from 'fflate'
import type { AnimationEncoder } from './exporter'
import type { ExportRenderer } from './renderer'

export function createPngSequenceCollector(): AnimationEncoder {
  let files: Record<string, Uint8Array> = {}

  return {
    async addFrame(ex: ExportRenderer, index: number) {
      const blob = await ex.toBlob('image/png')
      const name = `frame_${String(index + 1).padStart(4, '0')}.png`
      files[name] = new Uint8Array(await blob.arrayBuffer())
    },
    abort() {
      files = {} // drop the retained frames so GC can reclaim them now
    },
    finish() {
      return new Promise<{ blob: Blob; extension: string }>((resolve, reject) => {
        zip(files, { level: 0 }, (err, data) => {
          if (err) reject(err)
          else resolve({ blob: new Blob([data as BlobPart], { type: 'application/zip' }), extension: 'zip' })
        })
      })
    },
  }
}
