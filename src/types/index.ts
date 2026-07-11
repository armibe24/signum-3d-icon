/* ============================================================
   Central type definitions for every configurable part of the
   app: icon source, geometry, material, lighting, background,
   animation, export and camera. The full `AppSettings` object is
   what undo history snapshots and JSON presets serialize.
   ============================================================ */

/** bundled font id, or `system:<postscript-name>` for a font installed on
    the user's machine (Local Font Access API) */
export type TextFontId = string
export type BundledFontId = 'dm-sans' | 'dm-sans-bold' | 'jetbrains-mono' | 'jetbrains-mono-bold'

export interface IconSource {
  type: 'lucide' | 'custom' | 'text'
  /** lucide icon id (kebab-case), imported file name, or text label */
  name: string
  /** raw SVG markup for custom imports */
  svg?: string
  /** the text to extrude (type 'text') */
  text?: string
  /** bundled local font for text (type 'text') */
  fontId?: TextFontId
}

export type GeometryQuality = 'fast' | 'balanced' | 'high'
export type BevelStyle = 'none' | 'hard' | 'rounded'
export type ShadingMode = 'flat' | 'smooth' | 'angle'
export type ShapeCombine = 'union' | 'separate'

export interface GeometrySettings {
  /** multiplier on the SVG's own stroke width (lucide default: 2/24) */
  strokeWidth: number
  /** extrusion depth, in normalized icon units (icon spans ~100) */
  extrudeDepth: number
  bevelAmount: number
  bevelSegments: number
  bevelStyle: BevelStyle
  /** normal smoothing: flat faces, all-smooth, or smooth below an angle */
  shading: ShadingMode
  /** crease threshold for 'angle' shading, degrees */
  shadingAngle: number
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
  /** per-part color overrides, indexed by disconnected-part (largest part
      first); missing or empty ('') entries fall back to `color` */
  partColors: string[]
  roughness: number
  metalness: number
  opacity: number
  emissiveColor: string
  emissiveIntensity: number
  clearcoat: number
  envIntensity: number
  /** image used as the color texture of the object (data URL); multiplies
      with the base color, so white areas show the color unchanged */
  textureMap: string
  textureName: string
  /** tiling: 1 = the image spans the icon once, 2 = tiled twice, … */
  textureScale: number
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
  /** custom image-based lighting: equirectangular .hdr or LDR image as a
      data URL; empty = the built-in procedural studio environment */
  envMap: string
  envMapName: string
  /** 'hdr' = Radiance RGBE file, 'ldr' = plain image (png/jpg/webp) */
  envMapType: 'hdr' | 'ldr'
}

export type BackgroundMode = 'transparent' | 'checkerboard' | 'solid' | 'gradient' | 'studio' | 'image'

export interface BackgroundSettings {
  mode: BackgroundMode
  color: string
  /** second stop for gradient mode */
  color2: string
  /** user-loaded backdrop for 'image' mode (data URL, cover-cropped) */
  image: string
  imageName: string
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
  /** GIF only: ordered dithering to smooth the ≤256-color banding */
  gifDither: boolean
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
      shading: 'angle',
      shadingAngle: 45,
      combine: 'union',
      quality: 'balanced',
      normalizeSize: true,
      scale: 1,
    },
    material: {
      preset: 'soft-plastic',
      mode: 'plastic',
      color: '#5fc6e8',
      partColors: [],
      roughness: 0.28,
      metalness: 0,
      opacity: 1,
      emissiveColor: '#46e0ff',
      emissiveIntensity: 0,
      clearcoat: 0.6,
      envIntensity: 1,
      textureMap: '',
      textureName: '',
      textureScale: 1,
    },
    lighting: {
      preset: 'studio',
      ambient: 0.35,
      key: 3,
      fill: 1.1,
      rim: 1.6,
      keyAzimuth: 35,
      keyElevation: 45,
      // performance-friendly defaults: shadows are opt-in
      shadows: false,
      softShadows: true,
      envMap: '',
      envMapName: '',
      envMapType: 'ldr',
    },
    background: { mode: 'checkerboard', color: '#0c2029', color2: '#123240', image: '', imageName: '' },
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
      gifDither: false,
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

