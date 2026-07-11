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

const base = { opacity: 1, emissiveColor: '#46e0ff', emissiveIntensity: 0, clearcoat: 0, envIntensity: 1 }

export const MATERIAL_PRESETS: MaterialPresetDef[] = [
  { id: 'black-metal', label: 'Black Metal', values: { ...base, mode: 'metal', color: '#1b1e23', roughness: 0.34, metalness: 1 } },
  { id: 'silver-metal', label: 'Silver Metal', values: { ...base, mode: 'metal', color: '#d8dde2', roughness: 0.16, metalness: 1, envIntensity: 1.2 } },
  { id: 'gold-metal', label: 'Gold Metal', values: { ...base, mode: 'metal', color: '#e8b54b', roughness: 0.22, metalness: 1, envIntensity: 1.2 } },
  { id: 'white-clay', label: 'White Clay', values: { ...base, mode: 'clay', color: '#f1f1ec', roughness: 0.92, metalness: 0 } },
  { id: 'soft-plastic', label: 'Soft Plastic', values: { ...base, mode: 'plastic', color: '#5fc6e8', roughness: 0.28, metalness: 0, clearcoat: 0.6 } },
  { id: 'neon-glow', label: 'Neon Glow', values: { ...base, mode: 'emissive', color: '#0a2733', roughness: 0.5, metalness: 0, emissiveColor: '#46e0ff', emissiveIntensity: 2.4 } },
  { id: 'dark-glossy', label: 'Dark Glossy', values: { ...base, mode: 'plastic', color: '#14171c', roughness: 0.1, metalness: 0, clearcoat: 1 } },
  { id: 'warm-matte', label: 'Warm Matte', values: { ...base, mode: 'clay', color: '#e09a68', roughness: 0.8, metalness: 0 } },
]

export function createIconMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial()
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
  // map presence and uv channel are baked into the compiled shader program.
  // Track the state PER MATERIAL (per-part materials share one cached
  // texture — comparing against the texture's own channel would mark only
  // the first material dirty and leave the others on a stale program).
  const mapState = mat.map ? mat.map.channel : -1
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
