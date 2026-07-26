/* ============================================================
   Bundled studio environments — procedural HDRIs generated
   locally at runtime (no external URLs, nothing to download).
   Each preset composes real product-photography elements on an
   equirectangular float texture: softboxes with soft falloff,
   thin light strips, broad gradients and dark flags, with true
   HDR ranges (lights well above 1.0) so tone mapping and PBR
   reflections behave like they would with a shot HDRI.

   The textures are float equirects with
   EquirectangularReflectionMapping — every renderer PMREM-
   converts them internally per GL context, so the SAME texture
   serves the viewport and the export renderer. A small cache
   keys on (preset, contrast); evicted entries are disposed.
   ============================================================ */

import * as THREE from 'three'
import type { EnvPresetId } from '../types'

const W = 512
const H = 256

interface RectLight {
  /** azimuth center, degrees (0 = +z toward the default camera) */
  az: number
  /** elevation center, degrees (0 = horizon, 90 = zenith) */
  el: number
  /** angular size, degrees */
  width: number
  height: number
  /** linear intensity (HDR — softboxes are typically 3..10) */
  intensity: number
  /** edge softness, degrees */
  soft: number
  /** slight color tint, defaults to neutral white */
  tint?: [number, number, number]
}

interface EnvDef {
  /** base gradient: zenith / horizon / floor linear luminance */
  sky: [number, number, number]
  lights: RectLight[]
  /** dark flags — subtract light in these rects (product-photo negative fill) */
  flags?: RectLight[]
}

/** smoothstep on angular distance from a rect edge */
function rectFalloff(dAz: number, dEl: number, light: RectLight): number {
  const sx = Math.min(Math.max((light.width / 2 + light.soft - Math.abs(dAz)) / light.soft, 0), 1)
  const sy = Math.min(Math.max((light.height / 2 + light.soft - Math.abs(dEl)) / light.soft, 0), 1)
  const fx = sx * sx * (3 - 2 * sx)
  const fy = sy * sy * (3 - 2 * sy)
  return fx * fy
}

const ENV_DEFS: Record<Exclude<EnvPresetId, 'custom'>, EnvDef> = {
  // one huge frontal-top softbox + gentle side fill — the classic all-rounder
  'soft-studio': {
    sky: [0.10, 0.055, 0.02],
    lights: [
      { az: 0, el: 48, width: 130, height: 62, intensity: 3.4, soft: 34 },
      { az: -105, el: 12, width: 55, height: 70, intensity: 1.1, soft: 30 },
      { az: 128, el: 8, width: 34, height: 60, intensity: 0.75, soft: 24 },
    ],
    flags: [{ az: 55, el: -4, width: 46, height: 60, intensity: 0.75, soft: 26 }],
  },
  // high-key: bright wrap, floor bounce, crisp twin side strips
  'bright-product': {
    sky: [0.55, 0.34, 0.22],
    lights: [
      { az: 0, el: 55, width: 170, height: 70, intensity: 4.2, soft: 40 },
      { az: -78, el: 6, width: 16, height: 95, intensity: 5.2, soft: 8 },
      { az: 78, el: 6, width: 16, height: 95, intensity: 5.2, soft: 8 },
      { az: 0, el: -62, width: 190, height: 46, intensity: 1.15, soft: 34 },
    ],
  },
  // low-key: near-black world, one narrow overhead box + a thin kicker
  'dark-studio': {
    sky: [0.012, 0.007, 0.003],
    lights: [
      { az: -12, el: 58, width: 60, height: 24, intensity: 5.5, soft: 14 },
      { az: 148, el: 6, width: 9, height: 75, intensity: 3.4, soft: 6 },
    ],
  },
  // hard boxes against deep black flags — maximum reflection drama
  'high-contrast': {
    sky: [0.05, 0.03, 0.012],
    lights: [
      { az: -55, el: 34, width: 42, height: 58, intensity: 7.0, soft: 6 },
      { az: 62, el: 18, width: 30, height: 74, intensity: 5.0, soft: 5 },
      { az: 178, el: 40, width: 44, height: 30, intensity: 2.6, soft: 8 },
    ],
    flags: [
      { az: 4, el: 6, width: 52, height: 80, intensity: 0.95, soft: 10 },
      { az: -130, el: 0, width: 60, height: 90, intensity: 0.9, soft: 14 },
    ],
  },
  // vertical strip array — the liquid-metal look
  'light-strips': {
    sky: [0.035, 0.022, 0.01],
    lights: [
      { az: -96, el: 8, width: 8, height: 105, intensity: 6.0, soft: 5 },
      { az: -48, el: 8, width: 8, height: 105, intensity: 6.0, soft: 5 },
      { az: 0, el: 8, width: 8, height: 105, intensity: 6.0, soft: 5 },
      { az: 48, el: 8, width: 8, height: 105, intensity: 6.0, soft: 5 },
      { az: 96, el: 8, width: 8, height: 105, intensity: 6.0, soft: 5 },
      { az: 0, el: 74, width: 360, height: 18, intensity: 1.2, soft: 12 },
    ],
  },
  // dark front, luminous back edges — strong silhouettes
  'rim-light': {
    sky: [0.02, 0.012, 0.006],
    lights: [
      { az: 152, el: 14, width: 26, height: 95, intensity: 5.2, soft: 12 },
      { az: -152, el: 14, width: 26, height: 95, intensity: 5.2, soft: 12 },
      { az: 180, el: 62, width: 90, height: 30, intensity: 2.2, soft: 20 },
      { az: 0, el: 30, width: 90, height: 40, intensity: 0.5, soft: 30 },
    ],
  },
}

export const ENV_PRESET_OPTIONS: { value: EnvPresetId; label: string }[] = [
  { value: 'soft-studio', label: 'Soft Studio' },
  { value: 'bright-product', label: 'Bright Product' },
  { value: 'dark-studio', label: 'Dark Studio' },
  { value: 'high-contrast', label: 'High Contrast' },
  { value: 'light-strips', label: 'Light Strips' },
  { value: 'rim-light', label: 'Soft Rim Light' },
  { value: 'custom', label: 'Custom (HDR / EXR / image)…' },
]

function generate(def: EnvDef, contrast: number): THREE.DataTexture {
  const data = new Float32Array(W * H * 4)
  const [zenith, horizon, floor] = def.sky
  for (let y = 0; y < H; y++) {
    // v = 1 at top of the texture = zenith
    const el = 90 - (y / (H - 1)) * 180
    for (let x = 0; x < W; x++) {
      const az = (x / W) * 360 - 180
      // base gradient
      let r: number, g: number, b: number
      const t = el / 90
      let base: number
      if (t >= 0) base = horizon + (zenith - horizon) * t
      else base = horizon + (floor - horizon) * -t
      r = base
      g = base
      b = base * 1.04 // faint cool cast, like a real studio

      for (const light of def.lights) {
        let dAz = az - light.az
        if (dAz > 180) dAz -= 360
        if (dAz < -180) dAz += 360
        const f = rectFalloff(dAz, el - light.el, light)
        if (f > 0) {
          const tint = light.tint ?? [1, 1, 1]
          r += light.intensity * f * tint[0]
          g += light.intensity * f * tint[1]
          b += light.intensity * f * tint[2]
        }
      }
      for (const flag of def.flags ?? []) {
        let dAz = az - flag.az
        if (dAz > 180) dAz -= 360
        if (dAz < -180) dAz += 360
        const f = rectFalloff(dAz, el - flag.el, flag) * flag.intensity
        if (f > 0) {
          const k = 1 - Math.min(f, 0.98)
          r *= k
          g *= k
          b *= k
        }
      }

      // reflection contrast: power curve around mid-grey, HDR-safe
      if (contrast !== 1) {
        r = Math.pow(r / 0.18, contrast) * 0.18
        g = Math.pow(g / 0.18, contrast) * 0.18
        b = Math.pow(b / 0.18, contrast) * 0.18
      }

      const i = (y * W + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 1
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.LinearSRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

/* small cache: switching presets/contrast disposes what falls out */
const cache = new Map<string, THREE.DataTexture>()
const CACHE_LIMIT = 3

export function getPresetEnvironment(preset: Exclude<EnvPresetId, 'custom'>, contrast: number): THREE.DataTexture {
  const key = `${preset}:${contrast.toFixed(2)}`
  let tex = cache.get(key)
  if (!tex) {
    tex = generate(ENV_DEFS[preset], Math.min(Math.max(contrast, 0.25), 3))
    cache.set(key, tex)
    if (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value as string
      cache.get(oldest)?.dispose()
      cache.delete(oldest)
    }
  }
  return tex
}
