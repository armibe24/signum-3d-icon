/* Settings — small, real preferences (persisted to localStorage).
   Rendered via portal for the same backdrop-filter reason as About. */

import { createPortal } from 'react-dom'
import { Icon } from './common/Icon'
import { Toggle } from './common/Toggle'
import { Select } from './common/Select'
import { store, useStore } from '../store/store'
import { sceneManager } from '../engine/SceneManager'

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const prefs = useStore((s) => s.prefs)

  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button type="button" className="iconbtn" onClick={onClose} title="Close">
            <Icon name="x" size={13} strokeWidth={2.2} />
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-subhead">Viewport</p>
          <div className="side-rows">
            <Select
              label="Render resolution"
              value={prefs.pixelRatio}
              options={[
                { value: 'auto', label: 'Auto (device pixel ratio)' },
                { value: '1', label: '1× (performance)' },
              ]}
              onChange={(v) => {
                store.setPrefs({ pixelRatio: v })
                sceneManager.setPixelRatioMode(v)
              }}
            />
            <Toggle
              label="Show viewport hint"
              checked={prefs.showHint}
              onChange={(v) => store.setPrefs({ showHint: v })}
            />
          </div>
          <p className="modal-note" style={{ marginTop: 14 }}>
            Preferences are stored locally in this browser. Project state lives in presets.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
