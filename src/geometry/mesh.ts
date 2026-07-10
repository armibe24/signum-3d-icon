/* ============================================================
   Icon mesh builder — THREE.ExtrudeGeometry, following the
   proven "SVG Extruder" reference construction:

     1. take the clean 2D solid polygons from the worker
        (stroke outlining + boolean union already done there)
     2. clean every contour the way the reference does — drop
        near-duplicate points (< 0.05% of the bbox diagonal) and
        near-collinear points. This is the critical step: the
        Three.js bevel routine self-intersects into spiky fans
        when two contour points sit within a sub-unit distance
        of each other; cleaned contours bevel correctly.
     3. THREE.ExtrudeGeometry with the reference's parameters:
        bevelThickness = bevelSize = bevel amount,
        bevelOffset = 0 (bevel grows outward, like the reference
        default), bevelSegments = 1 for the classic hard chamfer
        or the user's segment count for the rounded style.
     4. normals per the selected shading mode.

   The SVG-side pipeline (parse → stroke outline → union →
   cleanup → normalize) is unchanged.
   ============================================================ */

import * as THREE from 'three'
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import type { GeometrySettings, MultiPolygon, Ring } from '../types'
import { NORMALIZED_SIZE } from '../svg/normalize'

export interface AssembledGeometry {
  geometry: THREE.BufferGeometry
  warnings: string[]
  /** number of disconnected parts (= material groups) in the geometry */
  partCount: number
}

/** Per-part colors drive one material per group; cap the group count so a
    pathological icon can't spawn hundreds of draw calls. Parts beyond the
    cap share the last group. */
export const MAX_PART_MATERIALS = 32

/* ------------------------------------------------------------------ */
/* contour cleaning — ported from the reference implementation         */
/* ------------------------------------------------------------------ */

/**
 * Remove near-duplicate and near-collinear points from a contour. The
 * Three.js bevel routine self-intersects when two points sit within a
 * sub-unit distance of each other, which produces the spiky fan artifact.
 * Cleaning the points fixes it without visibly changing the silhouette.
 */
function cleanPoints(pts: THREE.Vector2[], minDist: number, collinearEps: number): THREE.Vector2[] {
  if (pts.length < 3) return pts
  // 1) drop points closer than minDist to the previous kept point
  let out: THREE.Vector2[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (out.length === 0) {
      out.push(p)
      continue
    }
    const q = out[out.length - 1]
    if (Math.hypot(p.x - q.x, p.y - q.y) >= minDist) out.push(p)
  }
  // close-loop dedupe (first vs last)
  if (out.length > 2) {
    const a = out[0]
    const b = out[out.length - 1]
    if (Math.hypot(a.x - b.x, a.y - b.y) < minDist) out.pop()
  }
  // 2) drop points that are collinear with neighbours (flatten redundant verts)
  if (out.length > 3) {
    const keep: THREE.Vector2[] = []
    const n = out.length
    for (let i = 0; i < n; i++) {
      const prev = out[(i - 1 + n) % n]
      const cur = out[i]
      const next = out[(i + 1) % n]
      const v1x = cur.x - prev.x
      const v1y = cur.y - prev.y
      const v2x = next.x - cur.x
      const v2y = next.y - cur.y
      const cross = v1x * v2y - v1y * v2x
      const scale = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1
      if (Math.abs(cross / scale) > collinearEps) keep.push(cur) // not collinear → keep
    }
    if (keep.length >= 3) out = keep
  }
  return out
}

/* ------------------------------------------------------------------ */
/* polygons → cleaned THREE.Shapes                                     */
/* ------------------------------------------------------------------ */

function toVectors(ring: Ring): THREE.Vector2[] {
  return ring.map(([x, y]) => new THREE.Vector2(x, y))
}

function polygonsToShapes(parts: MultiPolygon[]): THREE.Shape[] {
  // tolerance scaled exactly like the reference: ~0.05% of the bbox diagonal
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const part of parts)
    for (const poly of part)
      for (const ring of poly)
        for (const [x, y] of ring) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
  const diag = isFinite(minX) ? Math.hypot(maxX - minX, maxY - minY) || 1 : 1
  const minDist = diag * 0.0005 // ~0.05% of bbox diagonal
  const collinearEps = 0.0015 // angular flatness threshold

  const entries: { shape: THREE.Shape; area: number }[] = []
  for (const part of parts) {
    for (const poly of part) {
      if (!poly.length) continue
      const outer = cleanPoints(toVectors(poly[0]), minDist, collinearEps)
      if (outer.length < 3) continue
      const shape = new THREE.Shape(outer)
      for (let h = 1; h < poly.length; h++) {
        const hole = cleanPoints(toVectors(poly[h]), minDist, collinearEps)
        if (hole.length >= 3) shape.holes.push(new THREE.Path(hole))
      }
      entries.push({ shape, area: Math.abs(THREE.ShapeUtils.area(outer)) })
    }
  }
  // largest part first — gives every disconnected part a stable index that
  // per-part colors can address across rebuilds (sort is stable, so equal
  // areas keep their contour order)
  entries.sort((a, b) => b.area - a.area)
  return entries.map((e) => e.shape)
}

/* ------------------------------------------------------------------ */
/* shading                                                             */
/* ------------------------------------------------------------------ */

/** Copy a vertex range of a non-indexed geometry into its own geometry. */
function sliceRange(geo: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position')
  const arr = new Float32Array(count * 3)
  arr.set((pos.array as Float32Array).subarray(start * 3, (start + count) * 3))
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
  return out
}

/**
 * Normals per the selected shading mode, applied after extrusion.
 *
 * The front/back caps and the side/bevel surfaces are shaded SEPARATELY,
 * using the vertex groups ExtrudeGeometry itself emits (group 0 = caps,
 * group 1 = walls + bevel). Smoothing the whole mesh at once lets the
 * cap-edge vertices average with the adjacent bevel normals (the dihedral
 * angle at that seam is far below any useful threshold), which tilts the
 * cap normals and paints diagonal creases across the flat face — the
 * exact artifact the reference avoids by never smoothing. Splitting the
 * groups keeps caps mathematically flat in every mode.
 */
function applyShading(geo: THREE.BufferGeometry, g: GeometrySettings): THREE.BufferGeometry {
  // flat: exactly what the reference does — per-face normals everywhere
  if (g.shading === 'flat' || !geo.groups.length) {
    geo.computeVertexNormals()
    return geo
  }

  const parts: THREE.BufferGeometry[] = []
  for (const group of geo.groups) {
    const part = sliceRange(geo, group.start, group.count)
    if (group.materialIndex === 0) {
      // caps: coplanar triangles → computeVertexNormals is exactly (0,0,±1)
      part.computeVertexNormals()
      parts.push(part)
    } else if (g.shading === 'smooth') {
      const welded = mergeVertices(part, 1e-4)
      welded.computeVertexNormals()
      part.dispose()
      parts.push(welded.toNonIndexed())
      welded.dispose()
    } else {
      let angle = Math.min(Math.max(g.shadingAngle, 1), 180)
      // Hard bevel: the wall↔chamfer dihedral is EXACTLY 45°. A threshold
      // at/near 45° sits on the floating-point boundary, merging some seam
      // vertices and not others — the patchy smears along the chamfer.
      // Snap thresholds in the ambiguous band below the seam angle so the
      // chamfer edges stay uniformly crisp (matching the reference look);
      // explicitly higher thresholds still smooth across on purpose.
      if (g.bevelStyle === 'hard' && angle >= 41 && angle <= 49) angle = 40
      const creased = toCreasedNormals(part, THREE.MathUtils.degToRad(angle))
      if (creased !== part) part.dispose()
      parts.push(creased)
    }
  }
  geo.dispose()
  const merged = mergeGeometries(parts, false) ?? parts[0]
  for (const p of parts) if (p !== merged) p.dispose()
  return merged
}

/* ------------------------------------------------------------------ */
/* entry point                                                         */
/* ------------------------------------------------------------------ */

export function assembleIconGeometry(parts: MultiPolygon[], g: GeometrySettings): AssembledGeometry {
  const warnings: string[] = []
  const shapes = polygonsToShapes(parts)
  if (!shapes.length) {
    return { geometry: new THREE.BufferGeometry(), warnings: ['No usable contours to extrude.'], partCount: 0 }
  }

  const depth = Math.max(g.extrudeDepth, 0.1)
  const bevelEnabled = g.bevelStyle !== 'none' && g.bevelAmount > 0.01
  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth,
    curveSegments: 1, // contours are already sampled polylines
    bevelEnabled,
  }
  if (bevelEnabled) {
    // reference parameters: thickness/size from the amount, outward bevel
    const amount = Math.min(g.bevelAmount, depth * 0.49)
    extrudeSettings.bevelThickness = amount
    extrudeSettings.bevelSize = amount
    extrudeSettings.bevelOffset = 0
    extrudeSettings.bevelSegments =
      g.bevelStyle === 'rounded'
        ? Math.min(Math.max(Math.round(g.bevelSegments), 1), 16) // multiple segments = rounded
        : 1 // single segment = classic chamfer
  }

  // one geometry per shape (like the reference's one mesh per shape).
  // Shading runs PER SHAPE — it needs the cap/side vertex groups, which
  // a merge would discard — then everything is merged so the rest of the
  // app keeps its single-mesh contract. Each shape IS one disconnected
  // part, so the merge re-adds one group per shape: that group's
  // materialIndex is the part's slot in the per-part color list.
  const geometries: THREE.BufferGeometry[] = []
  for (const shape of shapes) {
    try {
      const shaded = applyShading(new THREE.ExtrudeGeometry(shape, extrudeSettings), g)
      shaded.clearGroups() // drop ExtrudeGeometry's cap/side groups — parts are the unit now
      geometries.push(shaded)
    } catch {
      warnings.push('A contour could not be extruded and was skipped.')
    }
  }
  if (!geometries.length) {
    return { geometry: new THREE.BufferGeometry(), warnings: ['Extrusion failed for every contour.'], partCount: 0 }
  }

  const geo =
    geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, true) ?? geometries[0]
  if (!geo.groups.length) {
    geo.addGroup(0, geo.getAttribute('position').count, 0)
  }
  for (const group of geo.groups) {
    group.materialIndex = Math.min(group.materialIndex ?? 0, MAX_PART_MATERIALS - 1)
  }
  const partCount = Math.max(...geo.groups.map((gr) => (gr.materialIndex ?? 0) + 1))
  geo.userData.partCount = partCount // travels with the geometry through the cache

  geo.center()
  const worldScale = 2.4 / NORMALIZED_SIZE
  geo.scale(worldScale, worldScale, worldScale)
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return { geometry: geo, warnings, partCount }
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
