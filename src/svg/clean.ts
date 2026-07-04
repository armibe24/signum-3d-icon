/* ============================================================
   Post-boolean polygon cleanup — the key to design-tool-clean
   extrusion.

   The boolean union of many small buffer pieces (quads + join
   circles) leaves debris on its output rings:
   - chains of collinear / near-collinear points along straight
     edges (from circles tangent to quad edges) — these become
     T-junction vertices that break smooth wall shading,
   - micro stair-steps and notches from numerically near-tangent
     intersections — these become random spikes,
   - dust polygons and hairline slivers with ~zero area.

   This pass simplifies every ring (closed RDP) and drops rings
   whose area or mean width is negligible, so triangulation and
   bevelling downstream get smooth, minimal outlines.
   ============================================================ */

import type { MultiPolygon, Ring } from '../types'
import { simplifyPolyline } from './outline'

function ringArea(ring: Ring): number {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

function ringPerimeter(ring: Ring): number {
  let p = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    p += Math.hypot(x2 - x1, y2 - y1)
  }
  return p
}

/** Simplify a CLOSED ring with RDP (the shared endpoint is anchored). */
function simplifyRing(ring: Ring, eps: number): Ring {
  // strip an explicit closing duplicate first
  let r = ring
  while (r.length > 1) {
    const [fx, fy] = r[0]
    const [lx, ly] = r[r.length - 1]
    if (Math.abs(fx - lx) < 1e-9 && Math.abs(fy - ly) < 1e-9) r = r.slice(0, -1)
    else break
  }
  if (r.length < 4) return r
  const closed = [...r, r[0]]
  const simplified = simplifyPolyline(closed, eps)
  return simplified.slice(0, -1)
}

/**
 * Estimate the narrowest feature width of a polygon set. For ribbon-like
 * shapes (outlined strokes — the common case) width ≈ 2·Area/Perimeter.
 * Holes shrink the effective area, making the estimate conservative.
 * Used to clamp bevel insets below what the shape can absorb.
 */
export function estimateMinFeatureWidth(mp: MultiPolygon, fallback: number): number {
  let minW = Infinity
  for (const poly of mp) {
    if (!poly.length || poly[0].length < 3) continue
    let area = Math.abs(ringArea(poly[0]))
    let perim = ringPerimeter(poly[0])
    for (let h = 1; h < poly.length; h++) {
      area -= Math.abs(ringArea(poly[h]))
      perim += ringPerimeter(poly[h])
    }
    if (perim <= 0 || area <= 0) continue
    const w = (2 * area) / perim
    if (w < minW) minW = w
  }
  return isFinite(minW) ? minW : fallback
}

/**
 * Clean a MultiPolygon in place-independent fashion.
 * @param eps      RDP tolerance (same units as the polygons)
 * @param minArea  rings smaller than this are dust and get dropped
 */
export function cleanMultiPolygon(mp: MultiPolygon, eps: number, minArea: number): MultiPolygon {
  const out: MultiPolygon = []
  for (const poly of mp) {
    if (!poly.length) continue

    const outer = simplifyRing(poly[0], eps)
    if (outer.length < 3) continue
    const outerArea = Math.abs(ringArea(outer))
    const outerPerim = ringPerimeter(outer)
    // dust or hairline sliver (mean width = 2·A/P below tolerance)?
    if (outerArea < minArea || (outerPerim > 0 && (2 * outerArea) / outerPerim < eps)) continue

    const rings: Ring[] = [outer]
    for (let h = 1; h < poly.length; h++) {
      const hole = simplifyRing(poly[h], eps)
      if (hole.length < 3) continue
      const a = Math.abs(ringArea(hole))
      const p = ringPerimeter(hole)
      if (a < minArea || (p > 0 && (2 * a) / p < eps)) continue
      rings.push(hole)
    }
    out.push(rings)
  }
  return out
}
