/* Top bar — Sonitus-style: brand on the left, then icon-only action
   groups separated by divider lines, settings + about on the right.
   Every button has a tooltip + aria-label since there are no text
   labels. */

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { store, useStore } from '../store/store'
import { savePresetFile, loadPresetFile, resetProject } from './PresetControls'
import { AboutModal } from './AboutModal'
import { SettingsModal } from './SettingsModal'
import { Icon } from './common/Icon'
import { isDirty } from '../utils/dirty'
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

/** blocking confirm shown before actions that discard unsaved changes */
function UnsavedModal({ label, onSave, onDiscard, onCancel }: {
  label: string
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}) {
  return createPortal(
    <div className="overlay" onClick={onCancel}>
      <div className="modal-panel" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Unsaved changes</h2>
          <button type="button" className="iconbtn" onClick={onCancel} title="Close">
            <Icon name="x" size={13} strokeWidth={2.2} />
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-note">
            Your current adjustments are not saved as a preset. {label}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="button" className="btn btn--sm btn--cyan" onClick={onSave}>
              <Icon name="save" size={12} strokeWidth={2.2} />
              Save preset
            </button>
            <button type="button" className="btn btn--sm" onClick={onDiscard}>
              Continue without saving
            </button>
            <button type="button" className="btn btn--sm" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function TopBar() {
  const canUndo = useStore((s) => s.canUndo)
  const canRedo = useStore((s) => s.canRedo)
  const [showAbout, setShowAbout] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [pending, setPending] = useState<null | { label: string; run: () => void }>(null)

  /** run immediately when clean, otherwise ask first */
  const guarded = (label: string, run: () => void) => () => {
    if (isDirty()) setPending({ label, run })
    else run()
  }

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
        <IconAction icon="file-plus-2" label="New project (reset all)"
          onClick={guarded('Starting a new project will replace them.', resetProject)} />
        <IconAction icon="folder-open" label="Load preset…"
          onClick={guarded('Loading a preset will replace them.', () => void loadPresetFile())} />
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
      {pending && (
        <UnsavedModal
          label={pending.label}
          onSave={async () => {
            await savePresetFile()
            setPending(null)
            pending.run()
          }}
          onDiscard={() => {
            setPending(null)
            pending.run()
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </header>
  )
}
