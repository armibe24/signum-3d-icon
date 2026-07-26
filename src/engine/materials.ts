/* ============================================================
   Material system — one MeshPhysicalMaterial driven entirely by
   MaterialSettings. Modes define parameter families; presets are
   complete, named value sets (mode + values + color). Hand-editing
   a value flips the preset to "custom" in the UI layer.
   ============================================================ */

import * as THREE from 'three'
import type { MaterialMode, MaterialSettings } from '../types'

export interface MaterialModeDef {
  id: MaterialMode
  label: string
  /** partial settings applied when the mode is picked */
  values: Partial<MaterialSettings>
}

export const MATERIAL_MODES: MaterialModeDef[] = [
  { id: 'solid', label: 'Solid Color', values: { roughness: 0.55, metalness: 0, clearcoat: 0, emissiveIntensity: 0, opacity: 1 } },
  { id: 'clay', label: 'Matte Clay', values: { roughness: 0.92, metalness: 0, clearcoat: 0, emissiveIntensity: 0, opacity: 1 } },
  { id: 'plastic', label: 'Glossy Plastic', values: { roughness: 0.22, metalness: 0, clearcoat: 0.7, emissiveIntensity: 0, opacity: 1 } },
  { id: 'metal', label: 'Metal', values: { roughness: 0.35, metalness: 1, clearcoat: 0, emissiveIntensity: 0, opacity: 1 } },
  { id: 'chrome', label: 'Chrome', values: { roughness: 0.06, metalness: 1, clearcoat: 0, emissiveIntensity: 0, opacity: 1, envIntensity: 1.4 } },
  { id: 'soft-metal', label: 'Soft Metallic', values: { roughness: 0.5, metalness: 0.85, clearcoat: 0.15, emissiveIntensity: 0, opacity: 1 } },
  { id: 'liquid', label: 'Liquid Metal', values: { roughness: 0.12, metalness: 1, clearcoat: 0.55, emissiveIntensity: 0, opacity: 1, envIntensity: 1.4 } },
  { id: 'glass', label: 'Glassy', values: { roughness: 0.08, metalness: 0, clearcoat: 1, opacity: 0.45, emissiveIntensity: 0 } },
  { id: 'emissive', label: 'Emissive', values: { roughness: 0.6, metalness: 0, clearcoat: 0, emissiveIntensity: 2.2, opacity: 1 } },
]

export interface MaterialPresetDef {
  id: string
  label: string
  /** presets set the shared surface values; per-part color overrides and
      the loaded texture persist */
  values: Omit<MaterialSettings, 'preset' | 'partColors' | 'textureMap' | 'textureName' | 'textureScale' | 'textureMapping'>
}

const base = {
  opacity: 1,
  emissiveColor: '#46e0ff',
  emissiveIntensity: 0,
  clearcoat: 0,
  envIntensity: 1,
  liquidAmount: 0.65,
  liquidScale: 1.4,
}

export const MATERIAL_PRESETS: MaterialPresetDef[] = [
  { id: 'black-metal', label: 'Black Metal', values: { ...base, mode: 'metal', color: '#1b1e23', roughness: 0.34, metalness: 1 } },
  { id: 'silver-metal', label: 'Silver Metal', values: { ...base, mode: 'metal', color: '#d8dde2', roughness: 0.16, metalness: 1, envIntensity: 1.2 } },
  { id: 'gold-metal', label: 'Gold Metal', values: { ...base, mode: 'metal', color: '#e8b54b', roughness: 0.22, metalness: 1, envIntensity: 1.2 } },
  { id: 'white-clay', label: 'White Clay', values: { ...base, mode: 'clay', color: '#f1f1ec', roughness: 0.92, metalness: 0 } },
  { id: 'soft-plastic', label: 'Soft Plastic', values: { ...base, mode: 'plastic', color: '#5fc6e8', roughness: 0.28, metalness: 0, clearcoat: 0.6 } },
  { id: 'neon-glow', label: 'Neon Glow', values: { ...base, mode: 'emissive', color: '#0a2733', roughness: 0.5, metalness: 0, emissiveColor: '#46e0ff', emissiveIntensity: 2.4 } },
  { id: 'dark-glossy', label: 'Dark Glossy', values: { ...base, mode: 'plastic', color: '#14171c', roughness: 0.1, metalness: 0, clearcoat: 1 } },
  { id: 'warm-matte', label: 'Warm Matte', values: { ...base, mode: 'clay', color: '#e09a68', roughness: 0.8, metalness: 0 } },
  { id: 'liquid-metal', label: 'Liquid Metal', values: { ...base, mode: 'liquid', color: '#eef2f5', roughness: 0.12, metalness: 1, clearcoat: 0.55, envIntensity: 1.4 } },
]

export function createIconMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial()
}

/* ------------------------------------------------------------
   Liquid-metal surface — a STATIC, seamless FBM value-noise
   normal map (generated once, no time uniform, no animation).
   Applied as a standard PBR normal map, it survives every
   pipeline the app has: per-part material arrays, environment
   switches, image/video export, and 3D model export (GLB embeds
   it as a regular texture). Distortion amount = normalScale,
   feature scale = texture repeat on the aspect-true UV channel.
   ------------------------------------------------------------ */

const LIQUID_SIZE = 512
const LIQUID_PERIOD = 8 // lattice cells per edge — guarantees seamless tiling

let liquidTexture: THREE.DataTexture | null = null

/** deterministic lattice hash → smooth tileable value noise */
function latticeValue(ix: number, iy: number, period: number): number {
  const x = ((ix % period) + period) % period
  const y = ((iy % period) + period) % period
  let h = x * 374761393 + y * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  h = h ^ (h >> 16)
  return (h >>> 0) / 4294967295
}

function tileableFbm(u: number, v: number): number {
  // two smooth octaves only — liquid surfaces are broad flowing waves, not
  // grain; more octaves read as sand/chalk under sharp reflections
  let sum = 0
  let amp = 0.62
  let freq = LIQUID_PERIOD
  for (let o = 0; o < 2; o++) {
    const x = u * freq
    const y = v * freq
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const fx = x - ix
    const fy = y - iy
    const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    const a = latticeValue(ix, iy, freq)
    const b = latticeValue(ix + 1, iy, freq)
    const c = latticeValue(ix, iy + 1, freq)
    const d = latticeValue(ix + 1, iy + 1, freq)
    sum += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * amp
    amp *= 0.5
    freq *= 2
  }
  return sum
}

/** the shared, lazily generated liquid normal map (tangent space) */
export function getLiquidNormalMap(): THREE.DataTexture {
  if (liquidTexture) return liquidTexture
  const S = LIQUID_SIZE
  // height field first, then finite-difference normals (wraps seamlessly)
  const h = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      h[y * S + x] = tileableFbm(x / S, y / S)
    }
  }
  const data = new Uint8Array(S * S * 4)
  const strength = 5.5 // baked slope steepness; user amount scales via normalScale
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const xm = h[y * S + ((x - 1 + S) % S)]
      const xp = h[y * S + ((x + 1) % S)]
      const ym = h[((y - 1 + S) % S) * S + x]
      const yp = h[((y + 1) % S) * S + x]
      let nx = (xm - xp) * strength
      let ny = (ym - yp) * strength
      let nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len
      ny /= len
      nz /= len
      const i = (y * S + x) * 4
      data[i] = Math.round((nx * 0.5 + 0.5) * 255)
      data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255)
      data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255)
      data[i + 3] = 255
    }
  }
  liquidTexture = new THREE.DataTexture(data, S, S, THREE.RGBAFormat)
  liquidTexture.wrapS = THREE.RepeatWrapping
  liquidTexture.wrapT = THREE.RepeatWrapping
  liquidTexture.magFilter = THREE.LinearFilter
  liquidTexture.minFilter = THREE.LinearMipmapLinearFilter
  liquidTexture.generateMipmaps = true
  // aspect-true UV channel: noise blobs stay round on any icon shape
  liquidTexture.channel = 1
  liquidTexture.needsUpdate = true
  return liquidTexture
}

/* ------------------------------------------------------------
   user-loaded color textures — cached by data URL. The mesh has
   planar 0..1 UVs across its bounding box (see geometry/mesh.ts),
   so repeat = textureScale tiles the image across the icon.
   ------------------------------------------------------------ */

const textureCache = new Map<string, THREE.Texture>()
const TEXTURE_CACHE_LIMIT = 4

function iconTexture(dataUrl: string): THREE.Texture {
  let tex = textureCache.get(dataUrl)
  if (!tex) {
    tex = new THREE.TextureLoader().load(dataUrl)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = 4
    textureCache.set(dataUrl, tex)
    if (textureCache.size > TEXTURE_CACHE_LIMIT) {
      const oldest = textureCache.keys().next().value as string
      textureCache.get(oldest)?.dispose()
      textureCache.delete(oldest)
    }
  }
  return tex
}

/**
 * Apply the shared material settings, then the per-part color override for
 * `partIndex` (empty/missing entries keep the base color). Every part shares
 * everything except color, so multi-part icons still read as one material.
 */
export function applyMaterialSettings(mat: THREE.MeshPhysicalMaterial, m: MaterialSettings, partIndex = 0): void {
  mat.color.set(m.partColors?.[partIndex] || m.color)

  // color texture (multiplies with the color above — white shows it as-is)
  if (m.textureMap) {
    mat.map = iconTexture(m.textureMap)
    const s = Math.min(Math.max(m.textureScale || 1, 0.05), 20)
    mat.map.repeat.set(s, s)
    // uv placement — the mesh carries all three UV sets (geometry/mesh.ts):
    // channel 0 = stretch (uv), 1 = keep aspect (uv1), 2 = per part (uv2)
    mat.map.channel = m.textureMapping === 'aspect' ? 1 : m.textureMapping === 'part' ? 2 : 0
  } else {
    mat.map = null
  }
  // liquid-metal: static seamless noise normal map (no animation — the
  // surface is fixed unless a setting changes)
  if (m.mode === 'liquid') {
    mat.normalMap = getLiquidNormalMap()
    const amount = Math.min(Math.max(m.liquidAmount ?? 0.65, 0), 2)
    mat.normalScale.set(amount, amount)
    const scale = Math.min(Math.max(m.liquidScale ?? 2.2, 0.25), 10)
    mat.normalMap.repeat.set(scale, scale)
  } else {
    mat.normalMap = null
  }

  // map/normalMap presence and uv channels are baked into the compiled
  // shader program. Track the state PER MATERIAL (per-part materials share
  // cached textures — comparing against the texture's own state would mark
  // only the first material dirty and leave the others on a stale program).
  const mapState = `${mat.map ? mat.map.channel : -1}|${mat.normalMap ? 1 : 0}`
  if (mat.userData.mapState !== mapState) {
    mat.userData.mapState = mapState
    mat.needsUpdate = true
  }
  mat.roughness = m.roughness
  mat.metalness = m.metalness
  mat.clearcoat = m.clearcoat
  mat.clearcoatRoughness = 0.15
  mat.emissive.set(m.emissiveColor)
  mat.emissiveIntensity = m.emissiveIntensity
  mat.envMapIntensity = m.envIntensity

  const translucent = m.opacity < 0.999
  mat.opacity = m.opacity
  mat.transparent = translucent
  mat.depthWrite = !translucent || m.opacity > 0.6
  // cheap glass: transmission-free translucency stays fast on any GPU;
  // glass mode additionally raises ior/clearcoat via its mode values
  mat.side = THREE.FrontSide
  mat.needsUpdate = false
}
