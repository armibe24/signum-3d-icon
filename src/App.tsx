/* ============================================================
   App shell — layout plus the glue between the store and the
   engine:
   - store → engine: material / lighting / background / scale are
     applied imperatively (cheap, no geometry rebuild, no React
     re-render of the canvas)
   - geometry builder: watches icon + geometry settings, debounced
   - playback: engine rAF advances store.time while playing
   - global keyboard shortcuts (suppressed while typing)
   ============================================================ */

import { useEffect } from 'react'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { Viewport3D } from './components/Viewport3D'
import { Timeline } from './components/Timeline'
import { Toast } from './components/Toast'
import { sceneManager } from './engine/SceneManager'
import { geometryBuilder } from './geometry/build'
import { store } from './store/store'
import { normalizePlayTime } from './engine/animation'
import { restoreSession, startSessionAutosave } from './utils/session'

let wired = false

/** one-time store→engine wiring (module-level so StrictMode double-mount is safe) */
function wireEngine() {
  if (wired) return
  wired = true

  // bring back the last session BEFORE the first build, so a crash or
  // reload never costs the user their adjustments
  restoreSession()
  startSessionAutosave()

  geometryBuilder.onGeometry(({ geometry }) => {
    sceneManager.setGeometry(geometry)
  })
  geometryBuilder.start()

  sceneManager.onZoomChange = (pct) => {
    if (store.get().zoomPct !== pct) store.setTransient({ zoomPct: pct })
  }
  sceneManager.onEnvError = (msg) => store.toast(msg, 'error')

  // apply non-geometry settings imperatively whenever their slice changes
  let prev = store.get().settings
  const applyAll = (s = store.get().settings) => {
    sceneManager.applyMaterial(s.material)
    sceneManager.applyLighting(s.lighting)
    sceneManager.applyBackground(s.background)
    sceneManager.setUserScale(s.geometry.scale)
    sceneManager.setExportAspect(s.export.width / Math.max(s.export.height, 1))
  }
  applyAll()
  store.subscribe(() => {
    const s = store.get().settings
    if (s === prev) return
    if (s.material !== prev.material) sceneManager.applyMaterial(s.material)
    if (s.lighting !== prev.lighting) sceneManager.applyLighting(s.lighting)
    if (s.background !== prev.background) sceneManager.applyBackground(s.background)
    if (s.geometry.scale !== prev.geometry.scale) sceneManager.setUserScale(s.geometry.scale)
    if (s.export !== prev.export)
      sceneManager.setExportAspect(s.export.width / Math.max(s.export.height, 1))
    prev = s
  })

  // playback: advance time & apply the pose every rendered frame
  sceneManager.onFrame = (dt) => {
    const state = store.get()
    const anim = state.settings.animation
    let time = state.time
    if (state.playing && anim.preset !== 'static') {
      time += dt
      if (!anim.loop && time >= anim.duration) {
        time = anim.duration
        store.setTransient({ time, playing: false })
      } else {
        store.setTransient({ time: normalizePlayTime(anim, time) })
      }
    }
    sceneManager.applyPose(anim, normalizePlayTime(anim, time))
  }
}

/**
 * True only for elements where typing/shortcut keys belong to the element
 * itself. Range sliders, checkboxes and buttons are NOT typing targets —
 * they keep focus after a click, and undo must still work then.
 */
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type
    return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset'].includes(type)
  }
  return false
}

export default function App() {
  useEffect(() => {
    wireEngine()

    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const mod = e.ctrlKey || e.metaKey

      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        store.undo()
      } else if ((mod && e.shiftKey && e.key.toLowerCase() === 'z') || (mod && e.key.toLowerCase() === 'y')) {
        e.preventDefault()
        store.redo()
      } else if (e.key === ' ') {
        e.preventDefault()
        store.setTransient({ playing: !store.get().playing })
      } else if (e.key.toLowerCase() === 'f') {
        sceneManager.fitCamera()
      } else if (e.key === '0') {
        sceneManager.resetCamera()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <TopBar />
      <div className="app-main">
        <Viewport3D />
        <Sidebar />
      </div>
      <Timeline />
      <Toast />
    </div>
  )
}
