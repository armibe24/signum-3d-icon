/* Confirmation dialog — ported from the Sonitus reference. */

import type { ReactNode } from 'react'
import { Modal } from './Modal'

interface ConfirmModalProps {
  title: string
  message: ReactNode
  /** Label of the destructive/confirming button. */
  confirmLabel: string
  onConfirm: () => void
  /** Optional middle action (e.g. "Save preset first" next to "Discard"). */
  secondaryLabel?: string
  onSecondary?: () => void
  onClose: () => void
}

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  secondaryLabel,
  onSecondary,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="modal-note">{message}</p>
      <div className="modal-actions modal-actions--confirm">
        <button type="button" className="btn btn--sm" onClick={onClose} autoFocus>
          Cancel
        </button>
        {secondaryLabel && onSecondary && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              onSecondary()
              onClose()
            }}
          >
            {secondaryLabel}
          </button>
        )}
        <button
          type="button"
          className="btn btn--sm btn--teal"
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
