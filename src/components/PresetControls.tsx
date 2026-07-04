/* Preset actions — save/load the full parameter state as JSON and
   project reset. Triggered from the top bar (no sidebar duplicates);
   camera state is captured live from the engine on save. */

import { store } from '../store/store'
import { parsePreset, serializePreset } from '../utils/presets'
import { downloadBlob, pickFile, readFileText, safeFileName } from '../utils/file'
import { sceneManager } from '../engine/SceneManager'
import { defaultSettings } from '../types'

export async function savePresetFile(): Promise<void> {
  const settings = { ...store.get().settings, camera: sceneManager.getCameraState() }
  const json = serializePreset(settings)
  downloadBlob(new Blob([json], { type: 'application/json' }), `${safeFileName(settings.icon.name)}-preset.json`)
  store.toast('Preset saved')
}

export async function loadPresetFile(): Promise<void> {
  const file = await pickFile('.json,application/json')
  if (!file) return
  try {
    const settings = parsePreset(await readFileText(file))
    store.replaceSettings(settings)
    sceneManager.setCameraState(settings.camera)
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
  store.toast('New project')
}

