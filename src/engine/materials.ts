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
  values: Omit<MaterialSettings, 'preset'>
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

export function applyMaterialSettings(mat: THREE.MeshPhysicalMaterial, m: MaterialSettings): void {
  mat.color.set(m.color)
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
