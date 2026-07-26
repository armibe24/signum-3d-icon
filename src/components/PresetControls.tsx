/* Preset actions — save/load the full parameter state as JSON and
   project reset. Triggered from the top bar (no sidebar duplicates);
   camera state is captured live from the engine on save. */

import { store } from '../store/store'
import { parsePreset, serializePreset } from '../utils/presets'
import { downloadBlob, pickFile, readFileText, safeFileName } from '../utils/file'
import { markClean } from '../utils/dirty'
import { sceneManager } from '../engine/SceneManager'
import { defaultSettings } from '../types'

/** default name offered in the Save Preset dialog */
export function defaultPresetName(): string {
  return `${safeFileName(store.get().settings.icon.name)}-preset`
}

export function savePresetAs(name: string): void {
  const settings = { ...store.get().settings, camera: sceneManager.getCameraState() }
  const json = serializePreset(settings)
  const file = safeFileName(name.trim() || defaultPresetName())
  downloadBlob(new Blob([json], { type: 'application/json' }), `${file}.json`)
  markClean()
  store.toast(`Preset "${file}" saved`)
}

export async function loadPresetFile(): Promise<void> {
  const file = await pickFile('.json,application/json')
  if (!file) return
  try {
    const settings = parsePreset(await readFileText(file))
    store.replaceSettings(settings)
    sceneManager.setCameraState(settings.camera)
    markClean()
    store.toast(`Preset "${file.name}" loaded`)
  } catch (e) {
    store.toast(e instanceof Error ? e.message : 'Preset could not be loaded.', 'error')
  }
}

export function resetProject(): void {
  const fresh = defaultSettings()
  store.replaceSettings(fresh)
  sceneManager.setCameraState(fresh.camera)
  store.setTransient({ time: 0, playing: false })
  markClean()
  store.toast('New project')
}

