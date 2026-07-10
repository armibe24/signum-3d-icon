/* ============================================================
   Custom image-based lighting — loads a user-provided
   equirectangular environment (Radiance .hdr via RGBELoader, or
   any LDR image) into a texture with equirect mapping. Renderers
   PMREM-convert equirect environments internally per GL context,
   so the SAME texture serves both the viewport renderer and the
   separate export renderer.

   Loading is async; `onEnvironmentChanged` lets the scene re-apply
   once decoding finishes. When no custom map is set (or while one
   is still loading), callers fall back to the built-in procedural
   RoomEnvironment.
   ============================================================ */

import * as THREE from 'three'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'

let current: THREE.Texture | null = null
let currentKey = ''
let loadId = 0

/** fires after an async environment load finishes (or is cleared) */
export let onEnvironmentChanged: (() => void) | null = null
export function setEnvironmentChangedListener(fn: () => void): void {
  onEnvironmentChanged = fn
}

/** the currently loaded custom environment, or null for the built-in one */
export function getCustomEnvironment(): THREE.Texture | null {
  return current
}

/**
 * Load (or clear) the custom environment. `dataUrl` is the image as a data
 * URL; `type` distinguishes real HDR (.hdr RGBE) from plain LDR images.
 * Repeated calls with the same map are no-ops.
 */
export function setCustomEnvironment(dataUrl: string, type: 'hdr' | 'ldr', onError?: (msg: string) => void): void {
  const key = dataUrl ? `${type}:${dataUrl.length}:${dataUrl.slice(-64)}` : ''
  if (key === currentKey) return
  currentKey = key
  const id = ++loadId

  if (!dataUrl) {
    current?.dispose()
    current = null
    onEnvironmentChanged?.()
    return
  }

  const finish = (tex: THREE.Texture) => {
    if (id !== loadId) {
      tex.dispose() // superseded while loading
      return
    }
    tex.mapping = THREE.EquirectangularReflectionMapping
    current?.dispose()
    current = tex
    onEnvironmentChanged?.()
  }
  const fail = () => {
    if (id !== loadId) return
    currentKey = ''
    onError?.('This file could not be loaded as an environment map.')
  }

  if (type === 'hdr') {
    new RGBELoader().load(dataUrl, finish, undefined, fail)
  } else {
    new THREE.TextureLoader().load(
      dataUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        finish(tex)
      },
      undefined,
      fail,
    )
  }
}
