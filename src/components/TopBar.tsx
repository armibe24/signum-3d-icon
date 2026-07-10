/* Top bar — Sonitus-style: brand on the left, then icon-only action
   groups separated by divider lines, settings + about on the right.
   Every button has a tooltip + aria-label since there are no text
   labels. */

import { useState } from 'react'
import { store, useStore } from '../store/store'
import { savePresetFile, loadPresetFile, resetProject } from './PresetControls'
import { AboutModal } from './AboutModal'
import { SettingsModal } from './SettingsModal'
import { Icon } from './common/Icon'
import logoUrl from '../../branding/logo.svg'

interface Action {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
}

function IconAction({ icon, label, onClick, disabled }: Action) {
  return (
    <button
      type="button"
      className="iconbtn"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <Icon name={icon} size={14} strokeWidth={2} />
    </button>
  )
}

export function TopBar() {
  const canUndo = useStore((s) => s.canUndo)
  const canRedo = useStore((s) => s.canRedo)
  const [showAbout, setShowAbout] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-logo">
          <img src={logoUrl} alt="" width={22} height={22} style={{ display: 'block', borderRadius: 5 }} />
        </span>
        SIGNUM
      </div>

      <div className="topbar-sep" />
      <div className="topbar-group">
        <IconAction icon="file-plus-2" label="New project (reset all)" onClick={resetProject} />
        <IconAction icon="folder-open" label="Load preset…" onClick={loadPresetFile} />
      </div>

      <div className="topbar-sep" />
      <div className="topbar-group">
        <IconAction icon="save" label="Save preset" onClick={savePresetFile} />
      </div>

      <div className="topbar-sep" />
      <div className="topbar-group">
        <IconAction icon="undo-2" label="Undo (Ctrl+Z)" onClick={() => store.undo()} disabled={!canUndo} />
        <IconAction icon="redo-2" label="Redo (Ctrl+Shift+Z)" onClick={() => store.redo()} disabled={!canRedo} />
      </div>

      <div className="topbar-spacer" />

      <div className="topbar-group">
        <IconAction icon="settings" label="Settings" onClick={() => setShowSettings(true)} />
        <IconAction icon="info" label="About & shortcuts" onClick={() => setShowAbout(true)} />
      </div>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </header>
  )
}
