/* ============================================================
   UI icon component — renders lucide icons from the local
   package (the same bundled data the 3D pipeline uses; no remote
   assets). Icons inherit `currentColor` and default to the
   14px / 2px-stroke look used across the Sonitus-style chrome.
   ============================================================ */

import { useMemo } from 'react'
import { lucideSvg } from '../../icons/lucide'

interface Props {
  /** lucide icon id, e.g. "undo-2" */
  name: string
  size?: number
  strokeWidth?: number
  className?: string
}

export function Icon({ name, size = 14, strokeWidth = 2, className }: Props) {
  const html = useMemo(() => {
    const svg = lucideSvg(name, 'currentColor', { size, strokeWidth })
    if (!svg && import.meta.env.DEV) console.warn(`[Icon] unknown lucide icon "${name}"`)
    return svg ?? ''
  }, [name, size, strokeWidth])

  if (!html) return null
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', flexShrink: 0, lineHeight: 0 }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
