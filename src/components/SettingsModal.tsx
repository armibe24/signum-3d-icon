/* Settings — UI style (theme) picker with the Sonitus style set,
   custom-CSS file loading, plus viewport preferences. All persisted
   to localStorage. Rendered via portal (the topbar's backdrop-filter
   would otherwise trap the fixed overlay). */

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './common/Icon'
import { Toggle } from './common/Toggle'
import { Select } from './common/Select'
import { store, useStore } from '../store/store'
import { sceneManager } from '../engine/SceneManager'
import {
  UI_STYLES,
  applyUiStyle,
  clearCustomCss,
  loadCustomCss,
  loadUiStyle,
  saveCustomCss,
  type UiStyleId,
} from '../themes/uiStyles'
import { pickFile, readFileText } from '../utils/file'

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const prefs = useStore((s) => s.prefs)
  const [uiStyle, setUiStyle] = useState<UiStyleId>(() => loadUiStyle())
  const [customCssSize, setCustomCssSize] = useState(() => loadCustomCss().length)

  const selectStyle = (id: UiStyleId) => {
    setUiStyle(id)
    applyUiStyle(id)
  }

  const loadCssFile = async () => {
    const file = await pickFile('.css,text/css')
    if (!file) return
    const css = await readFileText(file)
    saveCustomCss(css)
    setCustomCssSize(css.length)
    selectStyle('custom')
    store.toast(`Custom CSS "${file.name}" loaded`)
  }

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
          <p className="modal-subhead">UI style</p>
          <div className="style-grid">
            {UI_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                className={`style-card${uiStyle === style.id ? ' selected' : ''}`}
                onClick={() => selectStyle(style.id)}
              >
                <span className="style-card-head">
                  {style.label}
                  {uiStyle === style.id && <Icon name="check" size={11} strokeWidth={2.6} />}
                </span>
                <span className="style-card-desc">{style.description}</span>
              </button>
            ))}
          </div>

          <div className="customcss">
            <p className="modal-subhead">Custom CSS</p>
            <p className="modal-note">
              Load a local <code>.css</code> file to restyle the app on top of the default look.
              It is cached in this browser and applied whenever the <b>Custom CSS</b> style is
              selected. Design tokens live on <code>:root</code> (e.g.{' '}
              <code>--accent</code>, <code>--paper</code>, <code>--font-mono</code>).
            </p>
            <div className="customcss-actions">
              <button type="button" className="btn btn--sm" onClick={loadCssFile}>
                <Icon name="file-up" size={12} strokeWidth={2.2} />
                Load CSS file…
              </button>
              <button
                type="button"
                className="btn btn--sm"
                disabled={customCssSize === 0}
                onClick={() => {
                  clearCustomCss()
                  setCustomCssSize(0)
                  if (uiStyle === 'custom') applyUiStyle('custom', '')
                  store.toast('Custom CSS cleared')
                }}
              >
                <Icon name="trash-2" size={12} strokeWidth={2.2} />
                Clear
              </button>
            </div>
            <p className="modal-note customcss-status">
              {customCssSize > 0
                ? `${(customCssSize / 1024).toFixed(1)} KB of custom CSS stored.`
                : 'No custom CSS loaded yet.'}
            </p>
          </div>

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
