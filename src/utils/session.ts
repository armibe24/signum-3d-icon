/* ============================================================
   Session persistence — the current settings are continuously
   autosaved to localStorage and restored on the next launch, so
   a tab crash, an accidental reload or closing the window never
   loses the user's adjustments. (Exports at large sizes can, in
   the worst case, crash the browser's GPU process — Chrome then
   reloads the tab. The export pipeline minimizes that risk, but
   this is the safety net that makes it harmless.)

   The payload IS the preset JSON — restore goes through the same
   defensive parsePreset validation as a user-loaded preset file,
   so a corrupt/stale autosave degrades to defaults, never to a
   broken app.
   ============================================================ */

import { store } from '../store/store'
import { parsePreset, serializePreset } from './presets'
import { sceneManager } from '../engine/SceneManager'

const SESSION_KEY = 'signum.session.v1'

/** Restore the autosaved session, if any. Call once at startup,
    before the first geometry build. */
export function restoreSession(): boolean {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(SESSION_KEY)
  } catch {
    return false // storage blocked (rare embedded contexts)
  }
  if (!raw) return false
  try {
    const settings = parsePreset(raw)
    store.replaceSettings(settings)
    store.resetHistory() // restoring is the new baseline, not an undo step
    sceneManager.setCameraState(settings.camera)
    return true
  } catch {
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
    return false
  }
}

/** Start autosaving: debounced on every settings change, plus a final
    flush when the page is hidden or unloading (catches camera-only
    orbiting, which lives outside `settings`). */
export function startSessionAutosave(): void {
  const write = () => {
    const settings = { ...store.get().settings, camera: sceneManager.getCameraState() }
    try {
      localStorage.setItem(SESSION_KEY, serializePreset(settings))
    } catch {
      // localStorage quota (~5 MB) — usually a large loaded image/HDRI.
      // Persist everything EXCEPT the big assets rather than nothing.
      try {
        const slim = {
          ...settings,
          background: { ...settings.background, image: '', imageName: '' },
          lighting: { ...settings.lighting, envMap: '', envMapName: '' },
          material: { ...settings.material, textureMap: '', textureName: '' },
        }
        localStorage.setItem(SESSION_KEY, serializePreset(slim))
      } catch {
        /* private mode / still over quota — autosave just doesn't persist */
      }
    }
  }

  let timer: number | null = null
  let prev = store.get().settings
  store.subscribe(() => {
    const s = store.get().settings
    if (s === prev) return
    prev = s
    if (timer !== null) window.clearTimeout(timer)
    timer = window.setTimeout(write, 400)
  })

  window.addEventListener('pagehide', write)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') write()
  })
}
