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

export function resolveBackground(b: BackgroundSettings): ResolvedBackground {
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
  }
}

/** true when this mode exports with an alpha channel */
export function backgroundHasAlpha(b: BackgroundSettings): boolean {
  return b.mode === 'transparent' || b.mode === 'checkerboard'
}
