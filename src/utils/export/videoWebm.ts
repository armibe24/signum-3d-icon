/* ============================================================
   WebM export — WebCodecs VP9 + webm-muxer. Same deterministic
   frame timing as MP4. Chrome's VideoEncoder cannot keep an alpha
   channel, so WebM exports are opaque as well.
   ============================================================ */

import { Muxer, ArrayBufferTarget } from 'webm-muxer'
import type { AnimationEncoder } from './exporter'
import type { ExportRenderer } from './renderer'
import { encodeMp4Frame } from './videoMp4'

export async function createWebmEncoder(
  width: number,
  height: number,
  fps: number,
): Promise<AnimationEncoder> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('WebM export needs WebCodecs (Chrome). Try PNG sequence or GIF instead.')
  }
  const config: VideoEncoderConfig = {
    codec: 'vp09.00.10.08',
    width,
    height,
    bitrate: Math.min(Math.round(width * height * fps * 0.12), 30_000_000),
    framerate: fps,
  }
  const support = await VideoEncoder.isConfigSupported(config)
  if (!support.supported) {
    throw new Error('VP9 encoding is not available in this browser. Try GIF or PNG sequence.')
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'V_VP9', width, height, frameRate: fps },
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
      const blob = new Blob([muxer.target.buffer], { type: 'video/webm' })
      return { blob, extension: 'webm' }
    },
  }
}
