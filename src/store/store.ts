/* ============================================================
   App store — a small useSyncExternalStore-based store with
   built-in undo history for `settings`.

   - `settings` is immutable; every change replaces only the
     slices it touches, so React selectors can rely on
     reference equality.
   - Slider drags call beginGesture()/endGesture() so a whole
     drag collapses into a single undo entry.
   - Transient state (playhead, processing flags, export job,
     toasts) is NOT part of undo history or presets.
   ============================================================ */

import { useSyncExternalStore } from 'react'
import type { AppSettings } from '../types'
import { defaultSettings } from '../types'

export interface ExportJobState {
  label: string
  progress: number // 0..1
  cancel: () => void
}

export interface ToastState {
  id: number
  message: string
  kind: 'info' | 'error'
}

/** persisted UI preferences (localStorage, not part of presets/undo) */
export interface UiPrefs {
  showHint: boolean
  /** 'auto' = device pixel ratio (max 2), '1' = performance */
  pixelRatio: 'auto' | '1'
}

const PREFS_KEY = 'signum.prefs'

function loadPrefs(): UiPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<UiPrefs>
    return {
      showHint: typeof raw.showHint === 'boolean' ? raw.showHint : true,
      pixelRatio: raw.pixelRatio === '1' ? '1' : 'auto',
    }
  } catch {
    return { showHint: true, pixelRatio: 'auto' }
  }
}

export interface AppState {
  settings: AppSettings
  /** playhead, seconds */
  time: number
  playing: boolean
  /** geometry pipeline busy */
  processing: boolean
  /** non-blocking warnings from the last geometry build */
  warnings: string[]
  exportJob: ExportJobState | null
  toast: ToastState | null
  /** sidebar section that should open + scroll into view */
  openSection: string | null
  /** active sidebar tab (icon rail) */
  activeTab: string
  /** Electron shell asked to close while there are unsaved changes —
      the in-app Close Window dialog is showing */
  closeRequested: boolean
  /** viewport camera zoom relative to the default distance, percent */
  zoomPct: number
  /** number of disconnected parts in the current geometry (per-part colors) */
  partCount: number
  prefs: UiPrefs
  canUndo: boolean
  canRedo: boolean
}

const HISTORY_LIMIT = 100

let state: AppState = {
  settings: defaultSettings(),
  time: 0,
  // preview never autoplays — the user starts playback explicitly
  playing: false,
  processing: false,
  warnings: [],
  exportJob: null,
  toast: null,
  openSection: null,
  activeTab: 'icon',
  closeRequested: false,
  zoomPct: 100,
  partCount: 1,
  prefs: loadPrefs(),
  canUndo: false,
  canRedo: false,
}

let undoStack: AppSettings[] = []
let redoStack: AppSettings[] = []
/** snapshot taken at gesture start; while set, changes don't push history */
let gestureBase: AppSettings | null = null

const listeners = new Set<() => void>()
let toastId = 0

function emit() {
  for (const l of listeners) l()
}

function pushUndo(snapshot: AppSettings) {
  undoStack.push(snapshot)
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
  redoStack = []
}

function withHistoryFlags(next: Partial<AppState>): void {
  state = {
    ...state,
    ...next,
    canUndo: undoStack.length > 0 || gestureBase !== null,
    canRedo: redoStack.length > 0,
  }
  emit()
}

export const store = {
  get: (): AppState => state,

  subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },

  setTransient(patch: Partial<Omit<AppState, 'settings' | 'canUndo' | 'canRedo'>>) {
    state = { ...state, ...patch }
    emit()
  },

  /** Immutable settings update. Pushes an undo entry unless inside a gesture. */
  updateSettings(fn: (s: AppSettings) => AppSettings) {
    const prev = state.settings
    const next = fn(prev)
    if (next === prev) return
    if (!gestureBase) pushUndo(prev)
    withHistoryFlags({ settings: next })
  },

  /** Replace all settings (preset load / reset). One undo entry. */
  replaceSettings(next: AppSettings) {
    pushUndo(state.settings)
    withHistoryFlags({ settings: next })
  },

  beginGesture() {
    if (!gestureBase) gestureBase = state.settings
  },

  endGesture() {
    if (gestureBase && gestureBase !== state.settings) {
      pushUndo(gestureBase)
      // keep redo cleared by pushUndo
    }
    gestureBase = null
    withHistoryFlags({})
  },

  undo() {
    if (gestureBase) store.endGesture()
    const prev = undoStack.pop()
    if (!prev) return
    redoStack.push(state.settings)
    withHistoryFlags({ settings: prev })
  },

  redo() {
    const next = redoStack.pop()
    if (!next) return
    undoStack.push(state.settings)
    withHistoryFlags({ settings: next })
  },

  resetHistory() {
    undoStack = []
    redoStack = []
    gestureBase = null
    withHistoryFlags({})
  },

  toast(message: string, kind: 'info' | 'error' = 'info') {
    state = { ...state, toast: { id: ++toastId, message, kind } }
    emit()
  },

  requestSection(id: string) {
    // 'background' lives inside the Lighting tab since the sidebar rework
    const tab = id === 'background' ? 'lighting' : id
    state = { ...state, openSection: id, activeTab: tab }
    emit()
  },

  setPrefs(patch: Partial<UiPrefs>) {
    const prefs = { ...state.prefs, ...patch }
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      /* private mode — prefs just don't persist */
    }
    state = { ...state, prefs }
    emit()
  },
}

/* ------------------------------------------------------------
   Convenience slice setters (single undo entry per call unless
   inside a gesture)
   ------------------------------------------------------------ */

type SliceKey = 'icon' | 'geometry' | 'material' | 'lighting' | 'background' | 'animation' | 'export' | 'camera'

export function setSlice<K extends SliceKey>(key: K, patch: Partial<AppSettings[K]>) {
  store.updateSettings((s) => ({ ...s, [key]: { ...s[key], ...patch } }))
}

/* ------------------------------------------------------------
   React hook
   ------------------------------------------------------------ */

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()))
}
