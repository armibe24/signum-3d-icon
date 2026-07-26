/* Font dropdown — same .select styling as the generic Select, plus a
   search field at the top of the menu and every option rendered in its
   own typeface (bundled webfonts render via their @font-face families;
   system fonts resolve against the machine's installed families). */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'

export interface FontOption {
  value: string
  label: string
  /** CSS font-family the option (and trigger) is rendered in */
  family: string
  bold?: boolean
}

interface Props {
  value: string
  options: FontOption[]
  onChange: (v: string) => void
}

export function FontSelect({ value, options, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    // focus the search as soon as the menu opens
    requestAnimationFrame(() => searchRef.current?.focus())
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
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  return (
    <div className="select" ref={rootRef}>
      <button
        type="button"
        className={`select-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span
          className="select-value"
          style={{ fontFamily: current ? `"${current.family}"` : undefined, fontWeight: current?.bold ? 700 : undefined }}
        >
          {current?.label ?? value}
        </span>
        <Icon className="select-chevron" name="chevron-down" size={11} strokeWidth={2.4} />
      </button>
      {open && (
        <div className="select-menu fontselect-menu">
          <div className="fontselect-search">
            <Icon name="search" size={11} strokeWidth={2.4} />
            <input
              ref={searchRef}
              placeholder="Search fonts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filtered.length) {
                  onChange(filtered[0].value)
                  setOpen(false)
                }
                e.stopPropagation()
              }}
            />
          </div>
          {filtered.length === 0 && <div className="fontselect-empty">No font matches “{query.trim()}”</div>}
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`select-option${o.value === value ? ' selected' : ''}`}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              <span
                className="fontselect-sample"
                style={{ fontFamily: `"${o.family}"`, fontWeight: o.bold ? 700 : 400 }}
              >
                {o.label}
              </span>
              {o.value === value && <Icon name="check" size={11} strokeWidth={2.6} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
