/* Custom dropdown matching the app's .select styling. Closes on
   outside click / Escape; keyboard accessible via the trigger. */

import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

export interface SelectOption<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  label?: string
  value: T
  options: SelectOption<T>[]
  disabled?: boolean
  onChange: (v: T) => void
}

export function Select<T extends string>({ label, value, options, disabled, onChange }: Props<T>) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
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

  const current = options.find((o) => o.value === value)

  const body = (
    <div className={`select${disabled ? ' disabled' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`select-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen(!open)}
        disabled={disabled}
      >
        <span className="select-value">{current?.label ?? value}</span>
        <Icon className="select-chevron" name="chevron-down" size={11} strokeWidth={2.4} />
      </button>
      {open && (
        <div className="select-menu">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`select-option${o.value === value ? ' selected' : ''}`}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              <span>{o.label}</span>
              {o.value === value && <Icon name="check" size={11} strokeWidth={2.6} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  if (!label) return body
  return (
    <div className="control">
      <div className="control-head">
        <span className="control-label">{label}</span>
      </div>
      {body}
    </div>
  )
}
