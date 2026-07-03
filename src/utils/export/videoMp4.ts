/* ============================================================
   MP4 export — WebCodecs VideoEncoder (hardware H.264 in Chrome)
   muxed with mp4-muxer. Frame-exact: each canvas becomes a
   VideoFrame with an explicit timestamp, so export FPS never
   depends on realtime playback. No alpha (H.264 limitation).
   ============================================================ */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import type { AnimationEncoder } from './exporter'
import type { ExportRenderer } from './renderer'

function avcCodecFor(width: number, height: number): string {
  // pick an H.264 level that covers the frame size
  const mb = Math.ceil(width / 16) * Math.ceil(height / 16)
  if (mb <= 3600) return 'avc1.640028' // level 4.0 — up to ~1920×1080
  if (mb <= 8192) return 'avc1.640032' // level 5.0
  return 'avc1.640033' // level 5.1 — up to 4096×2304
}

export async function createMp4Encoder(
  width: number,
  height: number,
  fps: number,
): Promise<AnimationEncoder> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('MP4 export needs WebCodecs (Chrome). Try PNG sequence or GIF instead.')
  }
  const config: VideoEncoderConfig = {
    codec: avcCodecFor(width, height),
    width,
    height,
    bitrate: Math.min(Math.round(width * height * fps * 0.14), 40_000_000),
    framerate: fps,
  }
  const support = await VideoEncoder.isConfigSupported(config)
  if (!support.supported) {
    throw new Error('H.264 encoding is not available in this browser build. Try WebM, GIF or PNG sequence.')
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    fastStart: 'in-memory',
  })

  let encoderError: Error | null = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e))
    },
  })
  encoder.configure(config)

  return {
    async addFrame(ex: ExportRenderer, index: number) {
      if (encoderError) throw encoderError
      await encodeMp4Frame(encoder, ex.canvas, index, fps)
    },
    async finish() {
      await encoder.flush()
      encoder.close()
      if (encoderError) throw encoderError
      muxer.finalize()
      const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' })
      return { blob, extension: 'mp4' }
    },
  }
}

export async function encodeMp4Frame(
  encoder: VideoEncoder,
  canvas: HTMLCanvasElement,
  index: number,
  fps: number,
): Promise<void> {
  // backpressure: don't let the encode queue grow unbounded
  while (encoder.encodeQueueSize > 4) {
    await new Promise((r) => setTimeout(r, 2))
  }
  const frame = new VideoFrame(canvas, {
    timestamp: Math.round((index * 1e6) / fps),
    duration: Math.round(1e6 / fps),
  })
  encoder.encode(frame, { keyFrame: index % (fps * 2) === 0 })
  frame.close()
}
