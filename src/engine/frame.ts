/* ============================================================
   Render frame math — the single source of truth for how the
   export camera relates to the viewport.

   The *render camera* is fixed: vertical fov BASE_FOV at the
   export aspect ratio. The viewport widens its own fov just
   enough to show the full render region plus a margin, then the
   frame overlay marks the exact crop. Because a perspective
   image scales linearly in tan-space, a centered crop of the
   viewport image is mathematically identical to rendering with
   the smaller fov — so what's inside the frame is exactly what
   exports, regardless of window size.
   ============================================================ */

export const BASE_FOV = 35
/** fraction of the viewport the frame may occupy */
export const FRAME_MARGIN = 0.86

const BASE_TAN = Math.tan((BASE_FOV * Math.PI) / 360)

export interface FrameRect {
  /** frame width / viewport width */
  fw: number
  /** frame height / viewport height */
  fh: number
}

/** Vertical fov (degrees) the viewport camera must use. */
export function viewportFov(viewportAspect: number, exportAspect: number): number {
  const tanV = (BASE_TAN * Math.max(1, exportAspect / viewportAspect)) / FRAME_MARGIN
  return (Math.atan(tanV) * 360) / Math.PI
}

/** Screen-space fractions of the render frame inside the viewport. */
export function frameRect(viewportAspect: number, exportAspect: number): FrameRect {
  const tanV = (BASE_TAN * Math.max(1, exportAspect / viewportAspect)) / FRAME_MARGIN
  const fh = BASE_TAN / tanV
  const fw = (fh * exportAspect) / viewportAspect
  return { fw, fh }
}
