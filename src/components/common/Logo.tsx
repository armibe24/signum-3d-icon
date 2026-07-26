/* App logo symbol — the uploaded branding/signum.svg inlined with its
   fixed fill (#e6f2f6) rewritten to currentColor, so the mark follows
   the active theme's ink color (dark themes → light mark, light themes
   → dark mark). Swap branding/signum.svg to rebrand. */

import { useMemo } from 'react'
import raw from '../../../branding/signum.svg?raw'

interface Props {
  size?: number
  className?: string
}

const inlined = raw
  .replace(/fill="#e6f2f6"/gi, 'fill="currentColor"')
  .replace(/width="[^"]*"\s+height="[^"]*"/, 'width="100%" height="100%"')

export function Logo({ size = 22, className }: Props) {
  const html = useMemo(() => inlined, [])
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{ width: size, height: size, display: 'inline-flex', flexShrink: 0, lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
