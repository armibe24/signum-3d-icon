/* ============================================================
   Export orchestrator — stills and animations.

   Frame generation is deterministic: frame i is rendered at
   t = i / fps via the same evaluatePose used by the preview.
   The loop yields to the event loop between frames so the UI
   (progress bar, cancel button) stays live; encoders apply
   backpressure where needed (VideoEncoder queue, gif worker ack).

   Alpha support by format
   ─ png / png-seq : full 8-bit alpha              ✔ reliable
   ─ gif           : 1-bit alpha (gifenc)          ✔ with hard edges
   ─ mp4 / webm    : no alpha in Chrome's encoders ✘ — transparent
     backgrounds are baked over the studio backdrop instead, and
     the UI says so. MOV+alpha has no browser-only encoder; the
     format switch below is where it would slot in later.
   ============================================================ */

import type { AppSettings, BackgroundSettings } from '../../types'
import { backgroundHasAlpha } from '../../engine/background'
import { normalizePlayTime } from '../../engine/animation'
import { store } from '../../store/store'
import { downloadBlob, safeFileName } from '../file'
import { ExportRenderer } from './renderer'
import { encodeMp4Frame, createMp4Encoder } from './videoMp4'
import { createWebmEncoder } from './videoWebm'
import { createGifEncoder } from './gif'
import { createPngSequenceCollector } from './pngSequence'

const STILL_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** mp4/webm cannot carry alpha — fall back to the studio backdrop */
function videoSafeBackground(b: BackgroundSettings): BackgroundSettings {
  if (backgroundHasAlpha(b)) return { ...b, mode: 'studio' }
  return b
}

export async function exportStill(settings: AppSettings): Promise<void> {
  const { width, height, stillFormat } = settings.export
  const ex = new ExportRenderer(width, height)
  try {
    // JPG has no alpha either — bake the studio backdrop
    const bg =
      stillFormat === 'jpg' ? videoSafeBackground(settings.background) : settings.background
    const time = normalizePlayTime(settings.animation, store.get().time)
    ex.renderFrame(bg, settings.animation, time)
    const blob = await ex.toBlob(STILL_MIME[stillFormat], stillFormat === 'png' ? undefined : 0.92)
    downloadBlob(blob, `${safeFileName(settings.icon.name)}-${width}x${height}.${stillFormat}`)
    store.toast(`Exported ${stillFormat.toUpperCase()} (${width}×${height})`)
  } finally {
    ex.dispose()
  }
}

export async function exportAnimation(settings: AppSettings): Promise<void> {
  const { animFormat } = settings.export
  // H.264 requires even dimensions
  const width = settings.export.width & ~1
  const height = settings.export.height & ~1
  const { fps, duration } = settings.animation
  const frameCount = Math.max(1, Math.round(fps * duration))
  const name = safeFileName(settings.icon.name)

  const aborter = new AbortController()
  const setProgress = (p: number, label: string) =>
    store.setTransient({ exportJob: { label, progress: p, cancel: () => aborter.abort() } })

  const ex = new ExportRenderer(width, height)
  const alpha = backgroundHasAlpha(settings.background)
  const bg =
    animFormat === 'mp4' || animFormat === 'webm'
      ? videoSafeBackground(settings.background)
      : settings.background

  try {
    setProgress(0, `Rendering ${animFormat.toUpperCase()}…`)

    const encoder = await (async () => {
      switch (animFormat) {
        case 'mp4':
          return createMp4Encoder(width, height, fps)
        case 'webm':
          return createWebmEncoder(width, height, fps)
        case 'gif':
          return createGifEncoder(width, height, fps, alpha)
        case 'png-seq':
          return createPngSequenceCollector()
      }
    })()

    for (let i = 0; i < frameCount; i++) {
      if (aborter.signal.aborted) throw new Error('cancelled')
      const t = i / fps
      ex.renderFrame(bg, settings.animation, normalizePlayTime(settings.animation, t))
      await encoder.addFrame(ex, i)
      setProgress(((i + 1) / frameCount) * 0.92, `Rendering ${animFormat.toUpperCase()}…`)
      // breathe: let React paint the progress bar and process input
      if (i % 2 === 1) await sleep(0)
    }

    if (aborter.signal.aborted) throw new Error('cancelled')
    setProgress(0.95, 'Finalizing…')
    const { blob, extension } = await encoder.finish()
    downloadBlob(blob, `${name}-${width}x${height}.${extension}`)
    store.toast(`Exported ${animFormat.toUpperCase()} — ${frameCount} frames`)
  } catch (e) {
    if (e instanceof Error && e.message === 'cancelled') {
      store.toast('Export cancelled')
    } else {
      store.toast(e instanceof Error ? e.message : 'Export failed', 'error')
    }
  } finally {
    ex.dispose()
    store.setTransient({ exportJob: null })
  }
}

export interface AnimationEncoder {
  addFrame(ex: ExportRenderer, index: number): Promise<void>
  finish(): Promise<{ blob: Blob; extension: string }>
}

export { encodeMp4Frame }
