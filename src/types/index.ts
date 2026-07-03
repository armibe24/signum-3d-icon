/* ============================================================
   Central type definitions for every configurable part of the
   app: icon source, geometry, material, lighting, background,
   animation, export and camera. The full `AppSettings` object is
   what undo history snapshots and JSON presets serialize.
   ============================================================ */

export interface IconSource {
  type: 'lucide' | 'custom'
  /** lucide icon id (kebab-case) or imported file name */
  name: string
  /** raw SVG markup for custom imports */
  svg?: string
}

export type GeometryQuality = 'fast' | 'balanced' | 'high'
export type BevelStyle = 'hard' | 'rounded'
export type ShapeCombine = 'union' | 'separate'

export interface GeometrySettings {
  /** multiplier on the SVG's own stroke width (lucide default: 2/24) */
  strokeWidth: number
  /** extrusion depth, in normalized icon units (icon spans ~100) */
  extrudeDepth: number
  bevelAmount: number
  bevelSegments: number
  bevelStyle: BevelStyle
  /** union everything into one solid vs. keep elements as grouped parts */
  combine: ShapeCombine
  quality: GeometryQuality
  /** rescale icon so its longest side is constant */
  normalizeSize: boolean
  /** overall object scale in the scene */
  scale: number
}

export type MaterialMode =
  | 'solid'
  | 'clay'
  | 'plastic'
  | 'metal'
  | 'chrome'
  | 'soft-metal'
  | 'glass'
  | 'emissive'

export interface MaterialSettings {
  /** id of the active preset, or 'custom' once values are hand-edited */
  preset: string
  mode: MaterialMode
  color: string
  roughness: number
  metalness: number
  opacity: number
  emissiveColor: string
  emissiveIntensity: number
  clearcoat: number
  envIntensity: number
}

export type LightingPresetId = 'studio' | 'softbox' | 'dramatic' | 'top' | 'custom'

export interface LightingSettings {
  preset: LightingPresetId
  ambient: number
  key: number
  fill: number
  rim: number
  /** key light direction, degrees */
  keyAzimuth: number
  keyElevation: number
  shadows: boolean
  softShadows: boolean
}

export type BackgroundMode = 'transparent' | 'checkerboard' | 'solid' | 'gradient' | 'studio'

export interface BackgroundSettings {
  mode: BackgroundMode
  color: string
  /** second stop for gradient mode */
  color2: string
}

export type AnimationPresetId =
  | 'static'
  | 'spin-y'
  | 'spin-x'
  | 'turntable'
  | 'slow-turn'
  | 'wobble'
  | 'float'
  | 'reveal'
  | 'bounce-in'

export type EasingId = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'

export interface Vec3Deg {
  x: number
  y: number
  z: number
}

export interface AnimationSettings {
  preset: AnimationPresetId
  duration: number
  fps: number
  loop: boolean
  /** speed / turns multiplier for spin-type presets, amplitude for wobble */
  speed: number
  direction: 1 | -1
  easing: EasingId
  /** base orientation, degrees — applied to every preset */
  startRotation: Vec3Deg
  /** target orientation for 'reveal', degrees */
  endRotation: Vec3Deg
}

export type StillFormat = 'png' | 'jpg' | 'webp'
export type AnimFormat = 'mp4' | 'webm' | 'gif' | 'png-seq'
export type SizePresetId = '512' | '1024' | '2048' | 'custom'

export interface ExportSettings {
  stillFormat: StillFormat
  animFormat: AnimFormat
  sizePreset: SizePresetId
  width: number
  height: number
}

export interface CameraState {
  position: [number, number, number]
  target: [number, number, number]
  autoRotate: boolean
}

export interface AppSettings {
  version: 1
  icon: IconSource
  geometry: GeometrySettings
  material: MaterialSettings
  lighting: LightingSettings
  background: BackgroundSettings
  animation: AnimationSettings
  export: ExportSettings
  camera: CameraState
}

/* ------------------------------------------------------------
   Defaults
   ------------------------------------------------------------ */

export const DEFAULT_CAMERA: CameraState = {
  position: [1.4, 1.1, 3.9],
  target: [0, 0, 0],
  autoRotate: false,
}

export function defaultSettings(): AppSettings {
  return {
    version: 1,
    icon: { type: 'lucide', name: 'rocket' },
    geometry: {
      strokeWidth: 1,
      extrudeDepth: 14,
      bevelAmount: 2.4,
      bevelSegments: 4,
      bevelStyle: 'rounded',
      combine: 'union',
      quality: 'balanced',
      normalizeSize: true,
      scale: 1,
    },
    material: {
      preset: 'soft-plastic',
      mode: 'plastic',
      color: '#5fc6e8',
      roughness: 0.28,
      metalness: 0,
      opacity: 1,
      emissiveColor: '#46e0ff',
      emissiveIntensity: 0,
      clearcoat: 0.6,
      envIntensity: 1,
    },
    lighting: {
      preset: 'studio',
      ambient: 0.35,
      key: 3,
      fill: 1.1,
      rim: 1.6,
      keyAzimuth: 35,
      keyElevation: 45,
      shadows: true,
      softShadows: true,
    },
    background: { mode: 'checkerboard', color: '#0c2029', color2: '#123240' },
    animation: {
      preset: 'turntable',
      duration: 3,
      fps: 30,
      loop: true,
      speed: 1,
      direction: 1,
      easing: 'linear',
      startRotation: { x: 0, y: 0, z: 0 },
      endRotation: { x: 0, y: 360, z: 0 },
    },
    export: {
      stillFormat: 'png',
      animFormat: 'png-seq',
      sizePreset: '1024',
      width: 1024,
      height: 1024,
    },
    camera: { ...DEFAULT_CAMERA },
  }
}

/* ------------------------------------------------------------
   Shared 2D polygon types used across the SVG pipeline
   ------------------------------------------------------------ */

/** [x, y] */
export type Pair = [number, number]
/** closed ring of points */
export type Ring = Pair[]
/** [exterior, ...holes] */
export type PolygonWithHoles = Ring[]
export type MultiPolygon = PolygonWithHoles[]

/** One independently-extruded piece of the icon */
export interface GeometryPart {
  polygons: MultiPolygon
}

export interface ProcessedIcon {
  parts: GeometryPart[]
  warnings: string[]
}
