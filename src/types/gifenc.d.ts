declare module 'gifenc' {
  export interface WriteFrameOpts {
    palette?: number[][]
    delay?: number
    transparent?: boolean
    transparentIndex?: number
    dispose?: number
    repeat?: number
    first?: boolean
  }
  export interface GifEncoderInstance {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: WriteFrameOpts): void
    finish(): void
    bytes(): Uint8Array
    reset(): void
  }
  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): GifEncoderInstance
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: { format?: 'rgb565' | 'rgb444' | 'rgba4444'; oneBitAlpha?: boolean | number; clearAlpha?: boolean },
  ): number[][]
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: 'rgb565' | 'rgb444' | 'rgba4444',
  ): Uint8Array
}
