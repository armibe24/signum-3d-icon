/* Number input with custom steppers (native spinners are hidden
   globally). Commits on blur / Enter, clamps to range. */

import { useEffect, useState } from 'react'

interface Props {
  value: number
  min: number
  max: number
  step?: number
  disabled?: boolean
  onChange: (v: number) => void
}

export function NumField({ value, min, max, step = 1, disabled, onChange }: Props) {
  const [draft, setDraft] = useState(String(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(String(value))
  }, [value, focused])

  const clamp = (n: number) => Math.min(Math.max(n, min), max)
  const commit = () => {
    const n = parseFloat(draft)
    if (isFinite(n)) onChange(clamp(n))
    else setDraft(String(value))
  }
  const nudge = (dir: 1 | -1) => onChange(clamp(Math.round((value + dir * step) / step) * step))

  return (
    <div className={`numfield${disabled ? ' disabled' : ''}`}>
      <input
        value={draft}
        disabled={disabled}
        inputMode="decimal"
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          commit()
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'ArrowUp') nudge(1)
          if (e.key === 'ArrowDown') nudge(-1)
          e.stopPropagation()
        }}
      />
      <div className="numfield-steppers">
        <button type="button" tabIndex={-1} onClick={() => nudge(1)} aria-label="increase">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 5 4 2.5 6.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" tabIndex={-1} onClick={() => nudge(-1)} aria-label="decrease">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 3 4 5.5 6.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
