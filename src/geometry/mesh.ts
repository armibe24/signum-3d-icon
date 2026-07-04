/* ============================================================
   Icon mesh builder — replaces THREE.ExtrudeGeometry entirely.

   Why: ExtrudeGeometry generates bevels by moving each contour
   vertex along its corner bisector ("getBevelVec") with no
   self-intersection handling. At acute corners the offset grows
   by 1/sin(θ/2) and vertices cross over, folding the cap
   triangulation into the overlapping/flipped planes seen with
   stroke-outlined icons. No parameter clamp can fix that.

   Here every bevel ring is a *robustly eroded polygon* computed
   with boolean ops in the worker, and the mesh is assembled from
   regions that are valid by construction:

     back cap ─ back bevel bands ─ straight walls ─ front bands ─ front cap

   - walls: quads along the exact base outline (silhouette is
     preserved — the bevel cuts inward, never inflates)
   - bevel band k: the 2D annulus between erosion level k and k+1,
     triangulated flat, then each vertex lifted to its ring's z
     (outer boundary → z_k, inner boundary → z_{k+1}) — this works
     even when erosion splits or consumes thin features, which
     simply receive lower rounded tops
   - caps: the deepest erosion level, triangulated at ±depth/2

   Every surface is emitted exactly once → no duplicate/coplanar
   faces, no z-fighting, no folds, no spikes. Degenerate rings are
   dropped before triangulation and failures are counted so the
   caller can warn instead of silently rendering broken output.
   ============================================================ */

import * as THREE from 'three'
import { mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import type { BevelPartData, GeometrySettings, MultiPolygon, Ring, ShadingMode } from '../types'
import { NORMALIZED_SIZE } from '../svg/normalize'

const WELD_EPS = 1e-4

export interface AssembledGeometry {
  geometry: THREE.BufferGeometry
  warnings: string[]
}

/* ------------------------------------------------------------------ */
/* ring helpers                                                        */
/* ------------------------------------------------------------------ */

/** Drop the closing duplicate + consecutive near-duplicate points. */
function sanitizeRing(ring: Ring): Ring {
  const out: Ring = []
  for (const [x, y] of ring) {
    const last = out[out.length - 1]
    if (last && Math.abs(last[0] - x) < WELD_EPS && Math.abs(last[1] - y) < WELD_EPS) continue
    out.push([x, y])
  }
  while (out.length > 1) {
    const [fx, fy] = out[0]
    const [lx, ly] = out[out.length - 1]
    if (Math.abs(fx - lx) < WELD_EPS && Math.abs(fy - ly) < WELD_EPS) out.pop()
    else break
  }
  return out
}

function signedArea(ring: Ring): number {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

/** Enforce sanitized rings with exterior CCW and holes CW. */
function orientPolygons(mp: MultiPolygon): MultiPolygon {
  const out: MultiPolygon = []
  for (const poly of mp) {
    if (!poly.length) continue
    const outer = sanitizeRing(poly[0])
    if (outer.length < 3) continue
    const rings: Ring[] = [signedArea(outer) < 0 ? [...outer].reverse() : outer]
    for (let h = 1; h < poly.length; h++) {
      const hole = sanitizeRing(poly[h])
      if (hole.length < 3) continue
      rings.push(signedArea(hole) > 0 ? [...hole].reverse() : hole)
    }
    out.push(rings)
  }
  return out
}

/* ------------------------------------------------------------------ */
/* surface emitters (positions only, non-indexed)                      */
/* ------------------------------------------------------------------ */

class MeshSink {
  positions: number[] = []
  failedFaces = 0

  tri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) {
    this.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz)
  }
}

/** Flat cap at a single z. `flip` reverses winding (back faces). */
function emitCap(sink: MeshSink, mp: MultiPolygon, z: number, flip: boolean) {
  for (const poly of orientPolygons(mp)) {
    const contour = poly[0].map(([x, y]) => new THREE.Vector2(x, y))
    const holes = poly.slice(1).map((r) => r.map(([x, y]) => new THREE.Vector2(x, y)))
    let faces: number[][]
    try {
      faces = THREE.ShapeUtils.triangulateShape(contour, holes)
    } catch {
      sink.failedFaces++
      continue
    }
    const verts = [contour, ...holes].flat()
    for (const [a, b, c] of faces) {
      const A = verts[a], B = verts[b], C = verts[c]
      if (!A || !B || !C) continue
      if (flip) sink.tri(A.x, A.y, z, C.x, C.y, z, B.x, B.y, z)
      else sink.tri(A.x, A.y, z, B.x, B.y, z, C.x, C.y, z)
    }
  }
}

/**
 * Bevel band: the annulus between two erosion levels, triangulated in 2D,
 * with each vertex lifted to the z of the ring it lies on. Vertices belonging
 * to the inner (deeper-eroded) boundary are recognized by exact coordinate
 * membership — boolean difference reuses input coordinates verbatim.
 */
function emitBand(
  sink: MeshSink,
  band: MultiPolygon,
  innerSet: Set<string>,
  zOuter: number,
  zInner: number,
  flip: boolean,
) {
  const zOf = (v: THREE.Vector2) => (innerSet.has(coordKey(v.x, v.y)) ? zInner : zOuter)
  for (const poly of orientPolygons(band)) {
    const contour = poly[0].map(([x, y]) => new THREE.Vector2(x, y))
    const holes = poly.slice(1).map((r) => r.map(([x, y]) => new THREE.Vector2(x, y)))
    let faces: number[][]
    try {
      faces = THREE.ShapeUtils.triangulateShape(contour, holes)
    } catch {
      sink.failedFaces++
      continue
    }
    const verts = [contour, ...holes].flat()
    for (const [a, b, c] of faces) {
      const A = verts[a], B = verts[b], C = verts[c]
      if (!A || !B || !C) continue
      if (flip) sink.tri(A.x, A.y, zOf(A), C.x, C.y, zOf(C), B.x, B.y, zOf(B))
      else sink.tri(A.x, A.y, zOf(A), B.x, B.y, zOf(B), C.x, C.y, zOf(C))
    }
  }
}

/** Straight side walls along every ring of the base outline. */
function emitWalls(sink: MeshSink, mp: MultiPolygon, z0: number, z1: number) {
  for (const poly of orientPolygons(mp)) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const [ax, ay] = ring[i]
        const [bx, by] = ring[(i + 1) % ring.length]
        // CCW exterior / CW holes both yield outward-facing walls here
        sink.tri(ax, ay, z0, bx, by, z0, bx, by, z1)
        sink.tri(ax, ay, z0, bx, by, z1, ax, ay, z1)
      }
    }
  }
}

function coordKey(x: number, y: number): string {
  return `${x.toFixed(6)}|${y.toFixed(6)}`
}

function vertexSet(mp: MultiPolygon): Set<string> {
  const set = new Set<string>()
  for (const poly of mp) for (const ring of poly) for (const [x, y] of ring) set.add(coordKey(x, y))
  return set
}

/* ------------------------------------------------------------------ */
/* part assembly                                                       */
/* ------------------------------------------------------------------ */

/** z of bevel step k (0 = wall top … S = cap plane) for half-depth h2 */
function stepZ(style: GeometrySettings['bevelStyle'], b: number, S: number, k: number, h2: number): number {
  if (k <= 0) return h2 - b
  if (style === 'hard') return h2
  return h2 - b + b * Math.sin(((k / S) * Math.PI) / 2)
}

function emitPart(sink: MeshSink, part: BevelPartData, g: GeometrySettings, zScale: number) {
  const h2 = (Math.max(g.extrudeDepth, 0.1) / 2) * zScale
  const S = part.levels.length
  const b = S > 0 ? part.bevel * zScale : 0
  const wallTop = h2 - b

  emitWalls(sink, part.base, -wallTop, wallTop)

  if (S === 0) {
    emitCap(sink, part.base, h2, false)
    emitCap(sink, part.base, -h2, true)
    return
  }

  const seq: MultiPolygon[] = [part.base, ...part.levels]
  for (let k = 0; k < S; k++) {
    const innerSet = vertexSet(seq[k + 1])
    const zo = stepZ(g.bevelStyle, b, S, k, h2)
    const zi = stepZ(g.bevelStyle, b, S, k + 1, h2)
    emitBand(sink, part.bands[k], innerSet, zo, zi, false)
    emitBand(sink, part.bands[k], innerSet, -zo, -zi, true)
  }

  const cap = part.levels[S - 1]
  emitCap(sink, cap, h2, false)
  emitCap(sink, cap, -h2, true)
}

/* ------------------------------------------------------------------ */
/* shading                                                             */
/* ------------------------------------------------------------------ */

/**
 * Normal generation, applied AFTER assembly (no geometry rebuild needed
 * beyond re-running this stage):
 * - flat: per-face normals (crisp facets)
 * - smooth: weld everything, average normals across all edges
 * - angle: smooth only edges flatter than the threshold (silhouette
 *   edges stay hard) via toCreasedNormals
 */
function applyShading(geo: THREE.BufferGeometry, mode: ShadingMode, angleDeg: number): THREE.BufferGeometry {
  if (mode === 'flat') {
    geo.computeVertexNormals() // non-indexed → face normals
    return geo
  }
  if (mode === 'smooth') {
    const merged = mergeVertices(geo, WELD_EPS)
    merged.computeVertexNormals()
    geo.dispose()
    return merged
  }
  const creased = toCreasedNormals(geo, THREE.MathUtils.degToRad(Math.min(Math.max(angleDeg, 1), 180)))
  if (creased !== geo) geo.dispose()
  return creased
}

/* ------------------------------------------------------------------ */
/* entry point                                                         */
/* ------------------------------------------------------------------ */

export function assembleIconGeometry(parts: BevelPartData[], g: GeometrySettings): AssembledGeometry {
  const sink = new MeshSink()

  parts.forEach((part, index) => {
    // tiny per-part depth offset kills z-fighting between coplanar caps
    const zScale = parts.length > 1 ? 1 + index * 0.0015 : 1
    emitPart(sink, part, g, zScale)
  })

  const warnings: string[] = []
  if (sink.failedFaces > 0) {
    warnings.push(`Geometry cleanup skipped ${sink.failedFaces} invalid face group(s).`)
  }

  let geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(sink.positions, 3))
  geo = applyShading(geo, g.shading, g.shadingAngle)

  geo.center()
  const worldScale = 2.4 / NORMALIZED_SIZE
  geo.scale(worldScale, worldScale, worldScale)
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return { geometry: geo, warnings }
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
