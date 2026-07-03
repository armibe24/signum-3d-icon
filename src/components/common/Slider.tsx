/* Labeled range slider with a numeric readout that can be clicked
   and edited. Drags are wrapped in a history gesture so a whole
   drag is one undo entry. */

import { useEffect, useRef, useState } from 'react'
import { store } from '../../store/store'

interface Props {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  decimals?: number
  disabled?: boolean
  onChange: (v: number) => void
}

export function Slider({ label, value, min, max, step = 0.01, unit, decimals = 2, disabled, onChange }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const display = Number.isInteger(step) ? String(Math.round(value)) : value.toFixed(decimals)

  const commitDraft = () => {
    setEditing(false)
    const n = parseFloat(draft)
    if (isFinite(n)) onChange(Math.min(Math.max(n, min), max))
  }

  return (
    <div className={`control${disabled ? ' disabled' : ''}`}>
      <div className="control-head">
        <span className="control-label">{label}</span>
        <div className="control-valuebox">
          {editing ? (
            <input
              ref={inputRef}
              className="control-valueinput"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitDraft()
                if (e.key === 'Escape') setEditing(false)
                e.stopPropagation()
              }}
            />
          ) : (
            <button
              className="control-value"
              onClick={() => {
                setDraft(display)
                setEditing(true)
              }}
              title="Click to type a value"
            >
              {display}
              {unit && <span className="control-unit">{unit}</span>}
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onPointerDown={() => store.beginGesture()}
        onPointerUp={() => store.endGesture()}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  )
}
