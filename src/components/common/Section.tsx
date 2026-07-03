/* Collapsible sidebar section. Listens for store.openSection so
   the top bar (e.g. the Export button) can pop a section open and
   scroll it into view. */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { store, useStore } from '../../store/store'

interface Props {
  id: string
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

export function Section({ id, title, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const ref = useRef<HTMLElement>(null)
  const requested = useStore((s) => s.openSection)

  useEffect(() => {
    if (requested === id) {
      setOpen(true)
      store.setTransient({ openSection: null })
      // wait a tick so the body is rendered before scrolling
      requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }, [requested, id])

  return (
    <section ref={ref} className={`side-section${open ? ' open' : ''}`}>
      <button type="button" className="side-heading" onClick={() => setOpen(!open)}>
        {title}
        <svg className="chev" width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <div className="side-body">{children}</div>
    </section>
  )
}
