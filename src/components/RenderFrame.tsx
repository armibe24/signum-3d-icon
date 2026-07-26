/* ============================================================
   Render frame overlay — marks the exact region of the viewport
   that export will produce (see engine/frame.ts for the math).
   Pure CSS overlay: never intercepts pointer events, so orbit
   controls work straight through it.
   ============================================================ */

import { useEffect, useState, type RefObject } from 'react'
import { frameRect } from '../engine/frame'
import { useStore } from '../store/store'

export function RenderFrame({ viewportRef }: { viewportRef: RefObject<HTMLDivElement> }) {
  const exportW = useStore((s) => s.settings.export.width)
  const exportH = useStore((s) => s.settings.export.height)
  const [vp, setVp] = useState({ w: 1, h: 1 })

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => setVp({ w: el.clientWidth || 1, h: el.clientHeight || 1 })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [viewportRef])

  const { fw, fh } = frameRect(vp.w / vp.h, exportW / Math.max(exportH, 1))

  return (
    <div
      className="render-frame"
      style={{ width: `${fw * 100}%`, height: `${fh * 100}%` }}
    >
      <span className="render-frame-label">
        {exportW} × {exportH}
      </span>
      <i className="rf-corner tl" />
      <i className="rf-corner tr" />
      <i className="rf-corner bl" />
      <i className="rf-corner br" />
    </div>
  )
}
