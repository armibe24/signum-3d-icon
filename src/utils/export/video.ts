/* ============================================================
   MP4 / WebM export — Mediabunny (the maintained successor of
   mp4-muxer / webm-muxer by the same author). Mediabunny drives
   WebCodecs internally: CanvasSource captures the export canvas
   per frame with explicit timestamps, so export FPS never depends
   on realtime playback, and `await source.add()` provides encoder
   + writer backpressure. No alpha (browser encoder limitation),
   same as before.
   ============================================================ */

import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  canEncodeVideo,
  type VideoCodec,
} from 'mediabunny'
import type { AnimationEncoder } from './exporter'
import type { ExportRenderer } from './renderer'

interface VideoKind {
  codec: VideoCodec
  extension: 'mp4' | 'webm'
  mime: string
  /** bits per pixel per second — matches the previous encoders' budgets */
  bppFactor: number
  maxBitrate: number
  unsupportedHint: string
}

const KINDS: Record<'mp4' | 'webm', VideoKind> = {
  mp4: {
    codec: 'avc',
    extension: 'mp4',
    mime: 'video/mp4',
    bppFactor: 0.14,
    maxBitrate: 40_000_000,
    unsupportedHint: 'H.264 encoding is not available in this browser build. Try WebM, GIF or PNG sequence.',
  },
  webm: {
    codec: 'vp9',
    extension: 'webm',
    mime: 'video/webm',
    bppFactor: 0.12,
    maxBitrate: 30_000_000,
    unsupportedHint: 'VP9 encoding is not available in this browser. Try GIF or PNG sequence.',
  },
}

async function createVideoEncoder(
  kindId: 'mp4' | 'webm',
  width: number,
  height: number,
  fps: number,
): Promise<AnimationEncoder> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error(`${kindId.toUpperCase()} export needs WebCodecs (Chrome). Try PNG sequence or GIF instead.`)
  }
  const kind = KINDS[kindId]
  const bitrate = Math.min(Math.round(width * height * fps * kind.bppFactor), kind.maxBitrate)
  if (!(await canEncodeVideo(kind.codec, { width, height, bitrate }))) {
    throw new Error(kind.unsupportedHint)
  }

  const output = new Output({
    format: kindId === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  })
  // the canvas only exists once the first frame arrives — lazy-init then
  let source: CanvasSource | null = null

  return {
    async addFrame(ex: ExportRenderer, index: number) {
      if (!source) {
        source = new CanvasSource(ex.canvas, {
          codec: kind.codec,
          bitrate,
          keyFrameInterval: 2, // seconds — matches the previous encoders
        })
        output.addVideoTrack(source, { frameRate: fps })
        await output.start()
      }
      // awaiting respects encoder + muxer backpressure
      await source.add(index / fps, 1 / fps)
    },
    async finish() {
      source?.close()
      await output.finalize()
      const buffer = (output.target as BufferTarget).buffer
      if (!buffer) throw new Error(`${kindId.toUpperCase()} encoding produced no data.`)
      return { blob: new Blob([buffer], { type: kind.mime }), extension: kind.extension }
    },
    abort() {
      void output.cancel().catch(() => {})
    },
  }
}

export function createMp4Encoder(width: number, height: number, fps: number): Promise<AnimationEncoder> {
  return createVideoEncoder('mp4', width, height, fps)
}

export function createWebmEncoder(width: number, height: number, fps: number): Promise<AnimationEncoder> {
  return createVideoEncoder('webm', width, height, fps)
}
