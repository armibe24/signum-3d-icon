/* Preset section — save/load the full parameter state as JSON.
   Camera state is captured live from the engine on save. */

import { store, useStore } from '../store/store'
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
  store.setTransient({ time: 0 })
  store.toast('New project')
}

export function PresetControls() {
  const iconName = useStore((s) => s.settings.icon.name)

  return (
    <div className="side-rows">
      <div className="export-btns">
        <button type="button" className="btn btn--sm" onClick={savePresetFile}>
          Save preset
        </button>
        <button type="button" className="btn btn--sm" onClick={loadPresetFile}>
          Load preset
        </button>
      </div>
      <p className="export-note">
        Presets store every parameter — icon (<b>{iconName}</b>), geometry, material, lighting,
        background, animation, camera and export settings — as a portable JSON file.
      </p>
      <button
        type="button"
        className="btn btn--sm"
        style={{ justifyContent: 'center' }}
        onClick={resetProject}
      >
        New project / reset all
      </button>
    </div>
  )
}
