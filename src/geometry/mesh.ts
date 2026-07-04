/* ============================================================
   Icon mesh builder — replaces THREE.ExtrudeGeometry entirely.

   Why: ExtrudeGeometry generates bevels by moving each contour
   vertex along its corner bisector ("getBevelVec") with no
   self-intersection handling. At acute corners the offset grows
   by 1/sin(θ/2) and vertices cross over, folding the cap
   triangulation into overlapping/flipped planes.

   Here every bevel ring is a *robustly eroded polygon* computed
   with boolean ops in the worker, and the mesh is assembled from
   regions that are valid by construction:

     back cap ─ back bevel bands ─ straight walls ─ front bands ─ front cap

   - walls: quads along the exact base outline (silhouette is
     preserved — the bevel cuts inward, never inflates)
   - bevel band k: the 2D annulus between erosion level k and k+1,
     triangulated flat, then each vertex lifted to its ring's z —
     this works even when erosion splits or consumes thin features
   - caps: ONLY the deepest erosion level (no full-size face hides
     underneath the bevel), triangulated at ±depth/2

   Every surface is emitted exactly once → no duplicate/coplanar
   faces, no z-fighting, no folds, no spikes.

   NORMALS are assigned analytically per surface group instead of
   a global computeVertexNormals/crease pass, so smoothing can
   never bleed across the wrong seams:
   - caps are always exactly flat (0,0,±1)
   - side walls use the 2D outline normal, smoothed along the loop
     only where the corner angle is below the shading threshold
   - bevel bands use the true profile normal
     n = n2d·cos(θ) + ẑ·sin(θ), which makes a rounded bevel
     G1-continuous with both the wall (θ=0) and the cap (θ=90°) —
     no triangulation-dependent streaks
   - "flat" shading bypasses all of this with per-face normals
   ============================================================ */

import * as THREE from 'three'
import type { BevelPartData, GeometrySettings, MultiPolygon, Ring } from '../types'
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

function coordKey(x: number, y: number): string {
  return `${x.toFixed(6)}|${y.toFixed(6)}`
}

/* ------------------------------------------------------------------ */
/* 2D outline normals (shared by walls and bevel bands)                */
/* ------------------------------------------------------------------ */

type Vec2 = [number, number]

/**
 * Per-edge outward normals of a ring, plus per-vertex normals smoothed
 * only where the corner between adjacent edges is below `cosThreshold`.
 * With CCW exteriors / CW holes, (dy, -dx) always points away from the
 * solid — into open space for exteriors, into the hole for holes.
 */
function ringNormals(ring: Ring, cosThreshold: number) {
  const n = ring.length
  const edge: Vec2[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const [ax, ay] = ring[i]
    const [bx, by] = ring[(i + 1) % n]
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy) || 1
    edge[i] = [dy / len, -dx / len]
  }
  const smooth: (Vec2 | null)[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const prev = edge[(i - 1 + n) % n]
    const next = edge[i]
    const dot = prev[0] * next[0] + prev[1] * next[1]
    if (dot >= cosThreshold) {
      const sx = prev[0] + next[0]
      const sy = prev[1] + next[1]
      const len = Math.hypot(sx, sy) || 1
      smooth[i] = [sx / len, sy / len]
    } else {
      smooth[i] = null // hard corner — each adjacent face keeps its edge normal
    }
  }
  return { edge, smooth }
}

/** coordKey → averaged outline normal for every vertex of a level. */
function levelNormalMap(mp: MultiPolygon, cosThreshold: number): Map<string, Vec2> {
  const map = new Map<string, Vec2>()
  for (const poly of orientPolygons(mp)) {
    for (const ring of poly) {
      const { edge, smooth } = ringNormals(ring, cosThreshold)
      const n = ring.length
      for (let i = 0; i < n; i++) {
        // bands need ONE normal per vertex; at hard corners fall back to
        // the bisector average (a hair of corner softening, never a streak)
        let v = smooth[i]
        if (!v) {
          const prev = edge[(i - 1 + n) % n]
          const next = edge[i]
          const sx = prev[0] + next[0]
          const sy = prev[1] + next[1]
          const len = Math.hypot(sx, sy) || 1
          v = [sx / len, sy / len]
        }
        map.set(coordKey(ring[i][0], ring[i][1]), v)
      }
    }
  }
  return map
}

/* ------------------------------------------------------------------ */
/* mesh sink                                                           */
/* ------------------------------------------------------------------ */

class MeshSink {
  positions: number[] = []
  normals: number[] = []
  failedFaces = 0

  tri(
    ax: number, ay: number, az: number, an: [number, number, number],
    bx: number, by: number, bz: number, bn: [number, number, number],
    cx: number, cy: number, cz: number, cn: [number, number, number],
  ) {
    this.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz)
    this.normals.push(...an, ...bn, ...cn)
  }
}

interface TriangulatedPoly {
  verts: THREE.Vector2[]
  faces: number[][]
}

function triangulate(mp: MultiPolygon, sink: MeshSink): TriangulatedPoly[] {
  const out: TriangulatedPoly[] = []
  for (const poly of orientPolygons(mp)) {
    const contour = poly[0].map(([x, y]) => new THREE.Vector2(x, y))
    const holes = poly.slice(1).map((r) => r.map(([x, y]) => new THREE.Vector2(x, y)))
    try {
      out.push({ verts: [contour, ...holes].flat(), faces: THREE.ShapeUtils.triangulateShape(contour, holes) })
    } catch {
      sink.failedFaces++
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* surface emitters                                                    */
/* ------------------------------------------------------------------ */

/** Flat cap at a single z — normal is exactly ±ẑ, never smoothed. */
function emitCap(sink: MeshSink, mp: MultiPolygon, z: number, flip: boolean) {
  const nz: [number, number, number] = [0, 0, flip ? -1 : 1]
  for (const { verts, faces } of triangulate(mp, sink)) {
    for (const [a, b, c] of faces) {
      const A = verts[a], B = verts[b], C = verts[c]
      if (!A || !B || !C) continue
      if (flip) sink.tri(A.x, A.y, z, nz, C.x, C.y, z, nz, B.x, B.y, z, nz)
      else sink.tri(A.x, A.y, z, nz, B.x, B.y, z, nz, C.x, C.y, z, nz)
    }
  }
}

interface BandShading {
  /** coordKey → outline normal, for outer and inner boundary levels */
  outerMap: Map<string, Vec2>
  innerMap: Map<string, Vec2>
  innerSet: Set<string>
  /** profile normal elevation (radians) at outer / inner boundary */
  elevOuter: number
  elevInner: number
  /** true → ignore analytic normals, use per-face (flat facets) */
  faceted: boolean
}

/**
 * Bevel band: the 2D annulus between two erosion levels, each vertex
 * lifted to its ring's z. Normals come from the bevel profile: at
 * elevation θ the surface normal is n2d·cosθ + ẑ·sinθ, which matches the
 * wall exactly at θ=0 and the cap exactly at θ=90° — seamless rounding.
 */
function emitBand(
  sink: MeshSink,
  band: MultiPolygon,
  zOuter: number,
  zInner: number,
  shading: BandShading,
  flip: boolean,
) {
  const zSign = flip ? -1 : 1

  const vertexData = (v: THREE.Vector2): { z: number; n: [number, number, number] } => {
    const key = coordKey(v.x, v.y)
    const inner = shading.innerSet.has(key)
    const z = inner ? zInner : zOuter
    const n2d = (inner ? shading.innerMap.get(key) : shading.outerMap.get(key)) ?? [0, 0]
    const elev = inner ? shading.elevInner : shading.elevOuter
    const cos = Math.cos(elev)
    const sin = Math.sin(elev)
    return { z, n: [n2d[0] * cos, n2d[1] * cos, sin * zSign] }
  }

  for (const { verts, faces } of triangulate(band, sink)) {
    for (const [a, b, c] of faces) {
      const A = verts[a], B = verts[b], C = verts[c]
      if (!A || !B || !C) continue
      const dA = vertexData(A)
      const dB = vertexData(B)
      const dC = vertexData(C)

      // plateau triangles (thin feature consumed by erosion) are truly
      // horizontal — give them their real flat normal
      const flatTri = dA.z === dB.z && dB.z === dC.z
      if (shading.faceted || flatTri) {
        const ux = B.x - A.x, uy = B.y - A.y, uz = dB.z - dA.z
        const vx = C.x - A.x, vy = C.y - A.y, vz = dC.z - dA.z
        let nx = uy * vz - uz * vy
        let ny = uz * vx - ux * vz
        let nzc = ux * vy - uy * vx
        const len = Math.hypot(nx, ny, nzc) || 1
        // face normal follows front winding; mirror for the back side
        nx /= len; ny /= len; nzc /= len
        const fn: [number, number, number] = flip ? [nx, ny, -nzc] : [nx, ny, nzc]
        dA.n = fn; dB.n = fn; dC.n = fn
      }

      if (flip) {
        sink.tri(A.x, A.y, -dA.z, dA.n, C.x, C.y, -dC.z, dC.n, B.x, B.y, -dB.z, dB.n)
      } else {
        sink.tri(A.x, A.y, dA.z, dA.n, B.x, B.y, dB.z, dB.n, C.x, C.y, dC.z, dC.n)
      }
    }
  }
}

/** Straight side walls, loop-smoothed by the shading threshold. */
function emitWalls(sink: MeshSink, mp: MultiPolygon, z0: number, z1: number, cosThreshold: number) {
  for (const poly of orientPolygons(mp)) {
    for (const ring of poly) {
      const { edge, smooth } = ringNormals(ring, cosThreshold)
      const n = ring.length
      for (let i = 0; i < n; i++) {
        const [ax, ay] = ring[i]
        const [bx, by] = ring[(i + 1) % n]
        const en = edge[i]
        const na2 = smooth[i] ?? en
        const nb2 = smooth[(i + 1) % n] ?? en
        const na: [number, number, number] = [na2[0], na2[1], 0]
        const nb: [number, number, number] = [nb2[0], nb2[1], 0]
        sink.tri(ax, ay, z0, na, bx, by, z0, nb, bx, by, z1, nb)
        sink.tri(ax, ay, z0, na, bx, by, z1, nb, ax, ay, z1, na)
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* part assembly                                                       */
/* ------------------------------------------------------------------ */

function vertexSet(mp: MultiPolygon): Set<string> {
  const set = new Set<string>()
  for (const poly of mp) for (const ring of poly) for (const [x, y] of ring) set.add(coordKey(x, y))
  return set
}

/** z of bevel step k (0 = wall top … S = cap plane) for half-depth h2 */
function stepZ(style: GeometrySettings['bevelStyle'], b: number, S: number, k: number, h2: number): number {
  if (k <= 0) return h2 - b
  if (style === 'hard') return h2
  return h2 - b + b * Math.sin(((k / S) * Math.PI) / 2)
}

/** profile normal elevation at step k */
function stepElevation(style: GeometrySettings['bevelStyle'], S: number, k: number): number {
  if (style === 'hard') return Math.PI / 4 // 45° chamfer, constant across the strip
  return ((k / S) * Math.PI) / 2
}

function emitPart(sink: MeshSink, part: BevelPartData, g: GeometrySettings, zScale: number, cosThreshold: number, faceted: boolean) {
  const h2 = (Math.max(g.extrudeDepth, 0.1) / 2) * zScale
  const S = part.levels.length
  const b = S > 0 ? part.bevel * zScale : 0
  const wallTop = h2 - b

  emitWalls(sink, part.base, -wallTop, wallTop, cosThreshold)

  if (S === 0) {
    emitCap(sink, part.base, h2, false)
    emitCap(sink, part.base, -h2, true)
    return
  }

  const seq: MultiPolygon[] = [part.base, ...part.levels]
  const maps = seq.map((level) => levelNormalMap(level, cosThreshold))
  for (let k = 0; k < S; k++) {
    const shading: BandShading = {
      outerMap: maps[k],
      innerMap: maps[k + 1],
      innerSet: vertexSet(seq[k + 1]),
      elevOuter: stepElevation(g.bevelStyle, S, k),
      elevInner: stepElevation(g.bevelStyle, S, k + 1),
      faceted,
    }
    const zo = stepZ(g.bevelStyle, b, S, k, h2)
    const zi = stepZ(g.bevelStyle, b, S, k + 1, h2)
    emitBand(sink, part.bands[k], zo, zi, shading, false)
    emitBand(sink, part.bands[k], zo, zi, shading, true)
  }

  const cap = part.levels[S - 1]
  emitCap(sink, cap, h2, false)
  emitCap(sink, cap, -h2, true)
}

/* ------------------------------------------------------------------ */
/* entry point                                                         */
/* ------------------------------------------------------------------ */

export function assembleIconGeometry(parts: BevelPartData[], g: GeometrySettings): AssembledGeometry {
  const sink = new MeshSink()

  // shading configuration
  // - flat: per-face normals everywhere
  // - smooth: analytic normals, loop smoothing always on (threshold 180°)
  // - angle: analytic normals, loop smoothing below the threshold; bands
  //   fall back to flat facets when the threshold is tighter than one
  //   bevel segment step (so a low angle really does facet the bevel)
  const flatMode = g.shading === 'flat'
  const thresholdDeg = g.shading === 'smooth' ? 180 : Math.min(Math.max(g.shadingAngle, 0), 180)
  const cosThreshold = Math.cos(THREE.MathUtils.degToRad(thresholdDeg))
  const segmentStepDeg = g.bevelStyle === 'rounded' ? 90 / Math.max(g.bevelSegments, 1) : 45
  const facetedBands = flatMode || (g.shading === 'angle' && thresholdDeg < segmentStepDeg)

  parts.forEach((part, index) => {
    // tiny per-part depth offset kills z-fighting between coplanar caps
    const zScale = parts.length > 1 ? 1 + index * 0.0015 : 1
    emitPart(sink, part, g, zScale, flatMode ? 2 /* dot ≥ 2 is impossible → never smooth */ : cosThreshold, facetedBands)
  })

  const warnings: string[] = []
  if (sink.failedFaces > 0) {
    warnings.push(`Geometry cleanup skipped ${sink.failedFaces} invalid face group(s).`)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(sink.positions, 3))
  if (flatMode) {
    geo.computeVertexNormals() // non-indexed soup → true per-face normals
  } else {
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(sink.normals, 3))
  }

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
