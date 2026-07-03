import { useState } from 'react'
import { store, useStore } from '../store/store'
import { savePresetFile, loadPresetFile, resetProject } from './PresetControls'
import { AboutModal } from './AboutModal'
import { Icon } from './common/Icon'

export function TopBar() {
  const canUndo = useStore((s) => s.canUndo)
  const canRedo = useStore((s) => s.canRedo)
  const [showAbout, setShowAbout] = useState(false)

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-logo">
          <Icon name="box" size={20} strokeWidth={2} />
        </span>
        SIGNUM <span className="sub">3D ICON STUDIO</span>
      </div>

      <div className="topbar-sep" />
      <div className="topbar-group">
        <button type="button" className="topbtn" onClick={resetProject} title="New project — resets all settings">
          <Icon name="file-plus-2" size={12} strokeWidth={2.2} />
          New
        </button>
        <button type="button" className="iconbtn" disabled={!canUndo} onClick={() => store.undo()} title="Undo (Ctrl+Z)">
          <Icon name="undo-2" size={14} strokeWidth={2.2} />
        </button>
        <button type="button" className="iconbtn" disabled={!canRedo} onClick={() => store.redo()} title="Redo (Ctrl+Shift+Z)">
          <Icon name="redo-2" size={14} strokeWidth={2.2} />
        </button>
      </div>

      <div className="topbar-sep" />
      <div className="topbar-group">
        <button type="button" className="topbtn" onClick={savePresetFile} title="Save all settings as a JSON preset">
          <Icon name="save" size={12} strokeWidth={2.2} />
          Save preset
        </button>
        <button type="button" className="topbtn" onClick={loadPresetFile} title="Load a JSON preset">
          <Icon name="folder-open" size={12} strokeWidth={2.2} />
          Load preset
        </button>
      </div>

      <div className="topbar-spacer" />

      <button type="button" className="iconbtn" onClick={() => setShowAbout(true)} title="About & shortcuts">
        <Icon name="info" size={14} strokeWidth={2.2} />
      </button>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </header>
  )
}
