/* ============================================================
   Background handling — resolves BackgroundSettings into what the
   renderer actually does, identically for viewport and export:

   - transparent / checkerboard → alpha-clear (checker pattern is
     a CSS layer behind the canvas, preview-only by design)
   - solid → clear color
   - gradient / studio → a CanvasTexture (CPU-backed, so the same
     texture object works in both the viewport renderer and the
     separate export renderer)
   ============================================================ */

import * as THREE from 'three'
import type { BackgroundSettings } from '../types'

export interface ResolvedBackground {
  /** null → transparent clear */
  texture: THREE.Texture | null
  clearColor: THREE.Color | null
  alpha: number
}

let cachedKey = ''
let cachedTexture: THREE.CanvasTexture | null = null

function gradientTexture(top: string, bottom: string, studio: boolean): THREE.CanvasTexture {
  const key = `${top}|${bottom}|${studio}`
  if (cachedTexture && cachedKey === key) return cachedTexture
  cachedTexture?.dispose()

  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 512
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height)
  if (studio) {
    // fixed neutral studio sweep: bright horizon fading down to dark floor
    grad.addColorStop(0, '#3a4148')
    grad.addColorStop(0.55, '#22262b')
    grad.addColorStop(1, '#101215')
  } else {
    grad.addColorStop(0, top)
    grad.addColorStop(1, bottom)
  }
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  cachedKey = key
  cachedTexture = tex
  return tex
}

/* ------------------------------------------------------------
   user-loaded backdrop images — cached by data URL. The image
   decodes asynchronously; `onReady` fires once so callers can
   re-apply (the render loop shows it as soon as it's decoded).
   ------------------------------------------------------------ */

const imageCache = new Map<string, THREE.Texture>()
const IMAGE_CACHE_LIMIT = 4

function imageTexture(dataUrl: string, onReady?: () => void): THREE.Texture {
  let tex = imageCache.get(dataUrl)
  if (!tex) {
    tex = new THREE.TextureLoader().load(dataUrl, () => onReady?.())
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    imageCache.set(dataUrl, tex)
    if (imageCache.size > IMAGE_CACHE_LIMIT) {
      const oldest = imageCache.keys().next().value as string
      imageCache.get(oldest)?.dispose()
      imageCache.delete(oldest)
    }
  }
  return tex
}

/**
 * CSS `background-size: cover` for a scene-background texture — crop via
 * repeat/offset so the image fills the view without distortion — plus the
 * user's zoom (imageScale ≥ 1) and pan (imageX/imageY in -1..1, mapped to
 * the currently croppable range so the image always keeps covering the
 * view). Safe to call every frame — it's a handful of property writes.
 */
export function applyBackgroundCover(texture: THREE.Texture, viewAspect: number, b?: BackgroundSettings): void {
  const img = texture.image as { width?: number; height?: number } | undefined
  if (!img?.width || !img.height) return
  const imageAspect = img.width / img.height
  let rx = 1
  let ry = 1
  if (imageAspect > viewAspect) rx = viewAspect / imageAspect
  else ry = imageAspect / viewAspect

  const scale = Math.min(Math.max(b?.imageScale ?? 1, 1), 8)
  rx /= scale
  ry /= scale

  const panX = Math.min(Math.max(b?.imageX ?? 0, -1), 1)
  const panY = Math.min(Math.max(b?.imageY ?? 0, -1), 1)
  texture.repeat.set(rx, ry)
  texture.offset.set(
    (1 - rx) / 2 + (panX * (1 - rx)) / 2,
    (1 - ry) / 2 - (panY * (1 - ry)) / 2,
  )
}

export function resolveBackground(b: BackgroundSettings, onImageReady?: () => void): ResolvedBackground {
  switch (b.mode) {
    case 'transparent':
    case 'checkerboard':
      return { texture: null, clearColor: null, alpha: 0 }
    case 'solid':
      return { texture: null, clearColor: new THREE.Color(b.color), alpha: 1 }
    case 'gradient':
      return { texture: gradientTexture(b.color, b.color2, false), clearColor: null, alpha: 1 }
    case 'studio':
      return { texture: gradientTexture(b.color, b.color2, true), clearColor: null, alpha: 1 }
    case 'image':
      // no image loaded yet → behave like solid color
      if (!b.image) return { texture: null, clearColor: new THREE.Color(b.color), alpha: 1 }
      return { texture: imageTexture(b.image, onImageReady), clearColor: null, alpha: 1 }
  }
}

/** true when this mode exports with an alpha channel */
export function backgroundHasAlpha(b: BackgroundSettings): boolean {
  return b.mode === 'transparent' || b.mode === 'checkerboard'
}

/** true when the mode draws a texture that must be cover-cropped */
export function backgroundIsImage(b: BackgroundSettings): boolean {
  return b.mode === 'image' && !!b.image
}
