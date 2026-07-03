/* Color control — styled swatch (hiding the native picker input)
   plus a validating hex field, matching the app design. */

import { useEffect, useState } from 'react'
import { store } from '../../store/store'

interface Props {
  label: string
  value: string
  disabled?: boolean
  onChange: (hex: string) => void
}

const HEX_RE = /^#?([0-9a-fA-F]{6})$/

export function ColorField({ label, value, disabled, onChange }: Props) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(value)
  }, [value, focused])

  const valid = HEX_RE.test(draft)

  const commit = (text: string) => {
    const m = HEX_RE.exec(text)
    if (m) onChange(`#${m[1].toLowerCase()}`)
  }

  return (
    <div className={`control${disabled ? ' disabled' : ''}`}>
      <div className="control-head">
        <span className="control-label">{label}</span>
      </div>
      <div className="colorfield-body">
        <span className="color-swatch" style={{ background: value }}>
          <input
            type="color"
            value={value}
            disabled={disabled}
            onPointerDown={() => store.beginGesture()}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => store.endGesture()}
            aria-label={label}
          />
        </span>
        <input
          className={`colorfield-hexinput${valid ? '' : ' invalid'}`}
          value={draft}
          disabled={disabled}
          spellCheck={false}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            commit(draft)
          }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            e.stopPropagation()
          }}
        />
      </div>
    </div>
  )
}
