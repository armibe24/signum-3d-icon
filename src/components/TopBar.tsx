/* Top bar — Sonitus-style: brand on the left, then icon-only action
   groups separated by divider lines, settings + about on the right.
   Every button has a tooltip + aria-label since there are no text
   labels.

   Destructive/file actions run through the Sonitus dialog set:
   - New Project  → ConfirmModal (always; with "Save preset first"
     shortcut when there are unsaved changes)
   - Load preset  → ConfirmModal only when there are unsaved changes
   - Save preset  → NameModal (names the .json preset file)
   All dialogs are custom in-app modals — never native windows. */

import { useState } from 'react'
import { store, useStore } from '../store/store'
import { savePresetAs, defaultPresetName, loadPresetFile, resetProject } from './PresetControls'
import { AboutModal } from './AboutModal'
import { SettingsModal } from './SettingsModal'
import { ConfirmModal } from './common/ConfirmModal'
import { NameModal } from './common/NameModal'
import { Icon } from './common/Icon'
import { isDirty } from '../utils/dirty'
import { Logo } from './common/Logo'

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

type DialogState =
  | null
  | { kind: 'new' }
  | { kind: 'load' }
  /** save-preset dialog; `next` continues a pending action afterwards */
  | { kind: 'save'; next?: () => void }

export function TopBar() {
  const canUndo = useStore((s) => s.canUndo)
  const canRedo = useStore((s) => s.canRedo)
  const [showAbout, setShowAbout] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-logo">
          <Logo size={20} />
        </span>
        SIGNUM
      </div>

      <div className="topbar-sep" />
      <div className="topbar-group">
        <IconAction icon="file-plus-2" label="New project (reset all)"
          onClick={() => setDialog({ kind: 'new' })} />
        <IconAction icon="folder-open" label="Load preset…"
          onClick={() => (isDirty() ? setDialog({ kind: 'load' }) : void loadPresetFile())} />
      </div>

      <div className="topbar-sep" />
      <div className="topbar-group">
        <IconAction icon="save" label="Save preset" onClick={() => setDialog({ kind: 'save' })} />
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

      {dialog?.kind === 'new' && (
        <ConfirmModal
          title="New Project"
          message={
            <>
              This resets everything to a clean default state: the icon, geometry, materials,
              lighting, animation and camera.
              {isDirty() && (
                <>
                  {' '}
                  You have <b>unsaved changes</b> — save a preset first if you want to keep them.
                </>
              )}
            </>
          }
          confirmLabel="Reset everything"
          onConfirm={resetProject}
          secondaryLabel={isDirty() ? 'Save preset first' : undefined}
          onSecondary={isDirty() ? () => setDialog({ kind: 'save', next: resetProject }) : undefined}
          onClose={() => setDialog((d) => (d?.kind === 'new' ? null : d))}
        />
      )}

      {dialog?.kind === 'load' && (
        <ConfirmModal
          title="Load Preset"
          message={
            <>
              Loading a preset replaces your current adjustments. You have <b>unsaved changes</b> —
              save a preset first if you want to keep them.
            </>
          }
          confirmLabel="Load preset"
          onConfirm={() => void loadPresetFile()}
          secondaryLabel="Save preset first"
          onSecondary={() => setDialog({ kind: 'save', next: () => void loadPresetFile() })}
          onClose={() => setDialog((d) => (d?.kind === 'load' ? null : d))}
        />
      )}

      {dialog?.kind === 'save' && (
        <NameModal
          title="Save Preset"
          note={
            <>
              Name your preset. It is saved as a <b>.json</b> file containing the full project
              state and can be loaded back anytime.
            </>
          }
          ctaLabel="Save Preset"
          placeholder={defaultPresetName()}
          initial={defaultPresetName()}
          onSave={(name) => {
            const next = dialog.next
            savePresetAs(name)
            next?.()
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </header>
  )
}
