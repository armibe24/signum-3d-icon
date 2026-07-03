import { useState } from 'react'
import { store, useStore } from '../store/store'
import { savePresetFile, loadPresetFile, resetProject } from './PresetControls'
import { AboutModal } from './AboutModal'

function Logo() {
  return (
    <span className="topbar-logo">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    </span>
  )
}

export function TopBar() {
  const canUndo = useStore((s) => s.canUndo)
  const canRedo = useStore((s) => s.canRedo)
  const [showAbout, setShowAbout] = useState(false)

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <Logo />
        SIGNUM <span className="sub">3D ICON STUDIO</span>
      </div>

      <div className="topbar-sep" />
      <div className="topbar-group">
        <button type="button" className="topbtn" onClick={resetProject} title="New project — resets all settings">
          New
        </button>
        <button type="button" className="iconbtn" disabled={!canUndo} onClick={() => store.undo()} title="Undo (Ctrl+Z)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
          </svg>
        </button>
        <button type="button" className="iconbtn" disabled={!canRedo} onClick={() => store.redo()} title="Redo (Ctrl+Shift+Z)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
          </svg>
        </button>
      </div>

      <div className="topbar-sep" />
      <div className="topbar-group">
        <button type="button" className="topbtn" onClick={savePresetFile} title="Save all settings as a JSON preset">
          Save preset
        </button>
        <button type="button" className="topbtn" onClick={loadPresetFile} title="Load a JSON preset">
          Load preset
        </button>
      </div>

      <div className="topbar-spacer" />

      <button
        type="button"
        className="topbtn topbtn--primary"
        onClick={() => store.requestSection('export')}
        title="Open export options"
      >
        Export
      </button>
      <button type="button" className="iconbtn" onClick={() => setShowAbout(true)} title="Shortcuts & info">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </header>
  )
}
