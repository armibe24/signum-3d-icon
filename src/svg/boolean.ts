/* ============================================================
   Boolean operations — thin isolation layer over the
   `polygon-clipping` library (MIT, pure JS, browser-safe) so the
   engine can swap in a different boolean backend later without
   touching the pipeline.

   All entry points degrade gracefully: if the exact union fails
   (robustness issues on degenerate input) we fall back to
   incrementally unioning what we can and finally to returning the
   raw pieces, reporting a warning instead of throwing.
   ============================================================ */

import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, PolygonWithHoles, Ring } from '../types'
import { bufferPolyline } from './outline'

type PcGeom = Parameters<typeof polygonClipping.union>[0]

function ringsToPolygons(rings: Ring[]): PolygonWithHoles[] {
  return rings.map((r) => [r])
}

export interface UnionResult {
  polygons: MultiPolygon
  /** true when the result is exact; false when a fallback kicked in */
  clean: boolean
}

/** Union a set of simple rings into one MultiPolygon. */
export function unionRings(rings: Ring[]): UnionResult {
  return unionPolygons(ringsToPolygons(rings))
}

/** Union a set of polygons (with holes) into one MultiPolygon. */
export function unionPolygons(polys: PolygonWithHoles[]): UnionResult {
  if (polys.length === 0) return { polygons: [], clean: true }
  if (polys.length === 1) return { polygons: [polys[0]], clean: true }

  // 1) one-shot sweep union — fastest and exact
  try {
    const result = polygonClipping.union(
      polys[0] as PcGeom,
      ...(polys.slice(1) as PcGeom[]),
    ) as MultiPolygon
    return { polygons: result, clean: true }
  } catch {
    /* fall through to incremental */
  }

  // 2) incremental union, skipping pieces that break the sweep
  let acc: MultiPolygon = [polys[0]]
  let dropped = 0
  for (let i = 1; i < polys.length; i++) {
    try {
      acc = polygonClipping.union(acc as PcGeom, polys[i] as PcGeom) as MultiPolygon
    } catch {
      dropped++
    }
  }
  if (dropped < polys.length - 1) {
    return { polygons: acc, clean: dropped === 0 }
  }

  // 3) last resort: no boolean at all — overlapping pieces stay separate
  return { polygons: polys, clean: false }
}

/**
 * Robust polygon erosion (inward offset): P ⊖ disk(d), computed as
 * P minus a buffer of P's boundary. Unlike naive per-vertex bisector
 * offsetting (what ExtrudeGeometry's bevel does), this can never fold or
 * self-intersect — thin features simply erode away, acute corners round
 * off. Returns [] when the polygon erodes to nothing (or the boolean
 * backend fails), which callers treat as "inset not feasible".
 */
export function erodePolygons(mp: MultiPolygon, distance: number, circleSegments: number): MultiPolygon {
  if (distance <= 0 || mp.length === 0) return mp
  const pieces: Ring[] = []
  for (const poly of mp) {
    for (const ring of poly) {
      pieces.push(
        ...bufferPolyline(ring, true, distance * 2, { circleSegments, simplifyEpsilon: 0 }),
      )
    }
  }
  const boundary = unionRings(pieces)
  try {
    return polygonClipping.difference(mp as PcGeom, boundary.polygons as PcGeom) as MultiPolygon
  } catch {
    return []
  }
}

/** Boolean difference wrapper (same isolation reasoning as union). */
export function differencePolygons(subject: MultiPolygon, clip: MultiPolygon): MultiPolygon {
  if (!subject.length) return []
  if (!clip.length) return subject
  try {
    return polygonClipping.difference(subject as PcGeom, clip as PcGeom) as MultiPolygon
  } catch {
    return subject
  }
}
