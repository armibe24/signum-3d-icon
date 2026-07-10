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

import type { AnimFormat, AppSettings, BackgroundSettings } from '../../types'
import { backgroundHasAlpha } from '../../engine/background'
import { normalizePlayTime } from '../../engine/animation'
import { store } from '../../store/store'
import { downloadBlob, safeFileName } from '../file'
import { acquireExportRenderer, releaseExportRenderer, type ExportRenderer } from './renderer'
import { sceneManager } from '../../engine/SceneManager'
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

/** Exports right after a parameter change should capture the REBUILT
    icon — wait briefly for a running geometry rebuild to settle. */
async function waitForGeometry(maxMs = 6000): Promise<void> {
  const t0 = performance.now()
  while (store.get().processing && performance.now() - t0 < maxMs) {
    await sleep(100)
  }
}

/**
 * Memory guardrail. GIF and PNG-sequence exports retain data proportional
 * to width·height·frames (quantization buffers / encoded frames); without
 * a cap, large sizes × long durations exhaust tab memory and crash the
 * page mid-export. Video encoders only retain the compressed stream, so
 * their budget is much higher.
 */
const PIXEL_BUDGET: Record<AnimFormat, number> = {
  gif: 6.5e8, //  e.g. 1024² ≈ 20s @ 30fps
  'png-seq': 1.6e9, // e.g. 2048² ≈ 12s @ 30fps
  mp4: 8e9,
  webm: 8e9,
}

function checkExportBudget(format: AnimFormat, width: number, height: number, frames: number): string | null {
  const load = width * height * frames
  if (load <= PIXEL_BUDGET[format]) return null
  const maxFrames = Math.max(1, Math.floor(PIXEL_BUDGET[format] / (width * height)))
  return (
    `This ${format.toUpperCase()} export (${frames} frames at ${width}×${height}) would exhaust browser memory. ` +
    `At this size, keep it under ~${maxFrames} frames — lower the duration/FPS or the export size.`
  )
}

/** mp4/webm cannot carry alpha — fall back to the studio backdrop */
function videoSafeBackground(b: BackgroundSettings): BackgroundSettings {
  if (backgroundHasAlpha(b)) return { ...b, mode: 'studio' }
  return b
}

export async function exportStill(settings: AppSettings): Promise<void> {
  const { width, height, stillFormat } = settings.export
  await waitForGeometry()
  sceneManager.setRenderPaused(true)
  try {
    const ex = acquireExportRenderer(width, height)
    // JPG has no alpha either — bake the studio backdrop
    const bg =
      stillFormat === 'jpg' ? videoSafeBackground(settings.background) : settings.background
    const time = normalizePlayTime(settings.animation, store.get().time)
    ex.renderFrame(bg, settings.animation, time)
    const blob = await ex.toBlob(STILL_MIME[stillFormat], stillFormat === 'png' ? undefined : 0.92)
    downloadBlob(blob, `${safeFileName(settings.icon.name)}-${width}x${height}.${stillFormat}`)
    store.toast(`Exported ${stillFormat.toUpperCase()} (${width}×${height})`)
  } finally {
    releaseExportRenderer()
    sceneManager.setRenderPaused(false)
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

  // memory guardrail BEFORE any resources are allocated
  const budgetError = checkExportBudget(animFormat, width, height, frameCount)
  if (budgetError) {
    store.toast(budgetError, 'error')
    return
  }

  await waitForGeometry()

  const aborter = new AbortController()
  const setProgress = (p: number, label: string) =>
    store.setTransient({ exportJob: { label, progress: p, cancel: () => aborter.abort() } })

  // the export renderer owns the GPU for the duration — pausing the
  // viewport halves peak GPU load (the #1 cause of mid-export tab crashes)
  sceneManager.setRenderPaused(true)
  let ex: ExportRenderer
  try {
    ex = acquireExportRenderer(width, height)
  } catch (e) {
    sceneManager.setRenderPaused(false)
    store.toast(e instanceof Error ? e.message : 'Could not create the export renderer.', 'error')
    return
  }
  const alpha = backgroundHasAlpha(settings.background)
  const bg =
    animFormat === 'mp4' || animFormat === 'webm'
      ? videoSafeBackground(settings.background)
      : settings.background

  let encoder: AnimationEncoder | null = null
  let finished = false
  try {
    setProgress(0, `Rendering ${animFormat.toUpperCase()}…`)

    encoder = await (async () => {
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
    finished = true
    downloadBlob(blob, `${name}-${width}x${height}.${extension}`)
    store.toast(`Exported ${animFormat.toUpperCase()} — ${frameCount} frames`)
  } catch (e) {
    if (e instanceof Error && e.message === 'cancelled') {
      store.toast('Export cancelled')
    } else {
      console.warn('[export] animation export failed:', e)
      store.toast(e instanceof Error ? e.message : 'Export failed', 'error')
    }
  } finally {
    // release encoder resources on cancel/failure — leaked VideoEncoders
    // and workers accumulating across attempts eventually crash the tab
    if (!finished && encoder) {
      try {
        encoder.abort()
      } catch {
        /* already gone */
      }
    }
    releaseExportRenderer()
    sceneManager.setRenderPaused(false)
    store.setTransient({ exportJob: null })
  }
}

export interface AnimationEncoder {
  addFrame(ex: ExportRenderer, index: number): Promise<void>
  finish(): Promise<{ blob: Blob; extension: string }>
  /** release all resources without producing output (cancel / failure) */
  abort(): void
}

export { encodeMp4Frame }
