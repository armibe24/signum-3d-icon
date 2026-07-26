/* Color control — styled swatch that opens the app's custom picker
   popover (see ColorPicker.tsx), plus a validating inline hex field.
   Used for material, emissive and background colors. */

import { useEffect, useRef, useState } from 'react'
import { ColorPicker } from './ColorPicker'

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
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!focused) setDraft(value)
  }, [value, focused])

  // close on outside pointerdown / Escape — drags inside the picker use
  // pointer capture, so they can never reach this listener mid-drag
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

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
        <span className="cpick-anchor" ref={anchorRef}>
          <button
            type="button"
            className={`color-swatch${open ? ' open' : ''}`}
            style={{ background: value }}
            disabled={disabled}
            aria-label={`${label} — open color picker`}
            title="Open color picker"
            onClick={() => setOpen(!open)}
          />
          {open && <ColorPicker value={value} onChange={onChange} />}
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
