/* ============================================================
   Normalization — flips SVG's y-down space to 3D's y-up, centers
   the icon on the origin and (optionally) rescales it so its
   longest side always spans NORMALIZED_SIZE units. Everything
   downstream (extrude depth, bevel size) is expressed in these
   units, so sliders behave consistently across icons.
   ============================================================ */

import type { MultiPolygon } from '../types'

export const NORMALIZED_SIZE = 100

export function normalizeParts(parts: MultiPolygon[], rescale: boolean): MultiPolygon[] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const part of parts)
    for (const poly of part)
      for (const ring of poly)
        for (const [x, y] of ring) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }

  if (!isFinite(minX)) return parts

  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const extent = Math.max(maxX - minX, maxY - minY, 1e-9)
  const scale = rescale ? NORMALIZED_SIZE / extent : 1

  return parts.map((part) =>
    part.map((poly) =>
      poly.map((ring) =>
        // negate y: SVG grows downward, the scene grows upward
        ring.map(([x, y]): [number, number] => [(x - cx) * scale, -(y - cy) * scale]),
      ),
    ),
  )
}
