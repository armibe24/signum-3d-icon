/* Name-input dialog (save preset flow) — ported from the Sonitus
   reference. */

import { useState } from 'react'
import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { Icon } from './Icon'

interface NameModalProps {
  title: string
  note: ReactNode
  ctaLabel: string
  placeholder: string
  initial?: string
  onSave: (name: string) => void
  onClose: () => void
}

export function NameModal({ title, note, ctaLabel, placeholder, initial, onSave, onClose }: NameModalProps) {
  const [name, setName] = useState(initial ?? '')

  const save = () => {
    onSave(name)
    onClose()
  }

  return (
    <Modal title={title} onClose={onClose}>
      <p className="modal-note">{note}</p>
      <input
        type="text"
        className="preset-name-input"
        value={name}
        autoFocus
        maxLength={64}
        placeholder={placeholder}
        aria-label={`${title} name`}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          e.stopPropagation()
        }}
      />
      <div className="modal-actions">
        <button type="button" className="btn btn--sm btn--teal" onClick={save}>
          <Icon name="save" size={13} strokeWidth={2.2} /> {ctaLabel}
        </button>
      </div>
    </Modal>
  )
}
