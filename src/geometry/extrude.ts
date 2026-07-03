/* ============================================================
   Extrusion — converts normalized 2D polygons into a single
   THREE.BufferGeometry: triangulated caps, extruded walls and a
   configurable bevel.

   Robustness measures (the bevel is where extrusion breaks):
   - Ring sanitation: polygon-clipping emits CLOSED rings (last
     point repeats the first) and can leave near-duplicate
     vertices. Both create zero-length segments that turn into
     degenerate triangles and bevel spikes, so rings are cleaned
     before triangulation.
   - Adaptive bevel clamp: ExtrudeGeometry offsets the outline
     naively; when the offset exceeds half the narrowest feature
     the inset outline self-intersects and triangles explode.
     The narrowest feature width is estimated per polygon with
     the 2·Area/Perimeter "ribbon width" heuristic and the bevel
     is clamped below it (and below half the depth).
   - `bevelOffset = -bevelSize` keeps the icon silhouette exactly
     the size of the 2D outline.
   - Creased normal recomputation after building (smooth rounded
     rims, crisp hard edges).
   - Separate parts get a microscopic depth offset so coplanar
     caps never z-fight.

   Bevel styles: none (clean straight extrusion), hard (single
   45° chamfer), rounded (multi-segment soft rim).
   ============================================================ */

import * as THREE from 'three'
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import type { GeometrySettings, MultiPolygon, Ring } from '../types'
import { NORMALIZED_SIZE } from '../svg/normalize'

const WELD_EPS = 1e-4

/** Drop the closing duplicate + consecutive near-duplicate points. */
function sanitizeRing(ring: Ring): Ring {
  const out: Ring = []
  for (const [x, y] of ring) {
    const last = out[out.length - 1]
    if (last && Math.abs(last[0] - x) < WELD_EPS && Math.abs(last[1] - y) < WELD_EPS) continue
    out.push([x, y])
  }
  // strip the closing point (Shape.closePath adds its own segment)
  while (out.length > 1) {
    const [fx, fy] = out[0]
    const [lx, ly] = out[out.length - 1]
    if (Math.abs(fx - lx) < WELD_EPS && Math.abs(fy - ly) < WELD_EPS) out.pop()
    else break
  }
  return out
}

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

/**
 * Estimate the narrowest feature width across all polygons. For ribbon-like
 * shapes (outlined strokes — the common case) width ≈ 2·Area/Perimeter.
 * Holes shrink the effective area, making the estimate conservative.
 */
function estimateMinFeatureWidth(parts: MultiPolygon[]): number {
  let minW = Infinity
  for (const part of parts) {
    for (const poly of part) {
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
  }
  return isFinite(minW) ? minW : NORMALIZED_SIZE * 0.05
}

function polygonsToShapes(polygons: MultiPolygon): THREE.Shape[] {
  const shapes: THREE.Shape[] = []
  for (const poly of polygons) {
    if (!poly.length) continue
    const outer = sanitizeRing(poly[0])
    if (outer.length < 3) continue
    const shape = new THREE.Shape()
    shape.setFromPoints(outer.map(([x, y]) => new THREE.Vector2(x, y)))
    shape.closePath()
    for (let h = 1; h < poly.length; h++) {
      const ring = sanitizeRing(poly[h])
      if (ring.length < 3) continue
      const hole = new THREE.Path()
      hole.setFromPoints(ring.map(([x, y]) => new THREE.Vector2(x, y)))
      hole.closePath()
      shape.holes.push(hole)
    }
    shapes.push(shape)
  }
  return shapes
}

export function extrudeParts(parts: MultiPolygon[], g: GeometrySettings): THREE.BufferGeometry {
  const depth = Math.max(g.extrudeDepth, 0.1)

  // resolve the effective bevel: user amount, clamped so the inset outline
  // can never collapse (half the narrowest ribbon) nor pierce the caps
  let bevel = 0
  if (g.bevelStyle !== 'none' && g.bevelAmount > 0.01) {
    const maxByFeature = estimateMinFeatureWidth(parts) * 0.42
    const maxByDepth = depth * 0.49
    bevel = Math.min(g.bevelAmount, maxByFeature, maxByDepth)
  }
  const bevelSegments = g.bevelStyle === 'hard' ? 1 : Math.max(1, Math.round(g.bevelSegments))

  const geometries: THREE.BufferGeometry[] = []

  parts.forEach((polygons, index) => {
    const shapes = polygonsToShapes(polygons)
    if (!shapes.length) return
    // tiny per-part depth jitter kills z-fighting between coplanar caps
    const jitter = parts.length > 1 ? 1 + index * 0.0015 : 1
    const geo = new THREE.ExtrudeGeometry(shapes, {
      depth: depth * jitter,
      curveSegments: 1, // rings are already sampled polylines
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: -bevel,
      bevelSegments,
    })
    geo.translate(0, 0, (-depth * jitter) / 2)
    geometries.push(geo)
  })

  if (!geometries.length) return new THREE.BufferGeometry()

  let merged =
    geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false) ?? geometries[0]

  // ExtrudeGeometry emits per-face normals (fully faceted). Re-crease so the
  // rounded bevel shades smoothly while hard/none edges stay crisp.
  const creaseAngle = THREE.MathUtils.degToRad(g.bevelStyle === 'rounded' ? 40 : 16)
  const creased = toCreasedNormals(merged, creaseAngle)
  if (creased !== merged) merged.dispose()
  merged = creased

  merged.center()

  // scale into world units: NORMALIZED_SIZE icon units → 2.4 world units
  const worldScale = 2.4 / NORMALIZED_SIZE
  merged.scale(worldScale, worldScale, worldScale)
  merged.computeBoundingBox()
  merged.computeBoundingSphere()
  return merged
}

/** Sanity check used by the build orchestrator to warn instead of
    silently rendering broken output. */
export function geometryLooksValid(geometry: THREE.BufferGeometry): boolean {
  const pos = geometry.getAttribute('position')
  if (!pos || pos.count < 3) return false
  for (let i = 0; i < pos.count * 3; i++) {
    if (!isFinite((pos.array as ArrayLike<number>)[i])) return false
  }
  const r = geometry.boundingSphere?.radius ?? 0
  return isFinite(r) && r > 1e-4 && r < 1e4
}
