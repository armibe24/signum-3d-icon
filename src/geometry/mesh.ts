/* ============================================================
   Icon mesh builder — replaces THREE.ExtrudeGeometry entirely.

   Why: ExtrudeGeometry generates bevels by moving each contour
   vertex along its corner bisector ("getBevelVec") with no
   self-intersection handling. At acute corners the offset grows
   by 1/sin(θ/2) and vertices cross over, folding the cap
   triangulation into overlapping/flipped planes.

   Here the bevel is a pure 2D contour-offset problem: every ring
   is a robustly eroded polygon (boolean ops in the worker, nested
   iteratively so E_{k+1} ⊆ E_k always holds), and the mesh is
   assembled from regions that are valid by construction:

     back cap ─ back bevel bands ─ straight walls ─ front bands ─ front cap

   - walls: quads along the exact base outline (silhouette is
     preserved — the bevel cuts inward, never inflates; holes
     offset outward automatically because erosion shrinks solids)
   - bevel band k: the 2D annulus between erosion level k and k+1,
     triangulated flat with densified, uniformly-sized boundary
     edges, each vertex lifted to its ring's z
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
     G1-continuous with both the wall (θ=0) and the cap (θ=90°)
   - "flat" shading bypasses all of this with per-face normals

   Band vertices are matched to their boundary ring by exact
   coordinate first and by distance-to-boundary as a fallback, so
   numeric perturbations from the boolean backend can never assign
   a vertex the wrong height (the old source of pinched seams).
   ============================================================ */

import * as THREE from 'three'
import type { BevelPartData, BevelStyle, GeometrySettings, MultiPolygon, Ring } from '../types'
import { NORMALIZED_SIZE } from '../svg/normalize'

const WELD_EPS = 1e-4
/** distance fallback tolerance for boundary matching — far below the
    minimum band width enforced by the worker's step merging */
const BOUNDARY_TOL = NORMALIZED_SIZE * 0.0008

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
/* 2D outline normals + boundary matching                              */
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

interface BoundarySeg {
  ax: number
  ay: number
  bx: number
  by: number
  nx: number
  ny: number
}

/**
 * Boundary of one erosion level: exact vertex set + smoothed per-vertex
 * normals + segment list. `contains` matches by exact coordinate first,
 * then by distance (numeric perturbations from the boolean backend must
 * never flip a vertex to the wrong ring / wrong height). `normalFor`
 * falls back to the nearest segment's outward normal for vertices the
 * backend introduced mid-edge.
 */
class LevelBoundary {
  private keys = new Set<string>()
  private normals = new Map<string, Vec2>()
  private segs: BoundarySeg[] = []
  readonly empty: boolean

  constructor(mp: MultiPolygon, cosThreshold: number) {
    for (const poly of orientPolygons(mp)) {
      for (const ring of poly) {
        const { edge, smooth } = ringNormals(ring, cosThreshold)
        const n = ring.length
        for (let i = 0; i < n; i++) {
          const [x, y] = ring[i]
          const key = coordKey(x, y)
          this.keys.add(key)
          let v = smooth[i]
          if (!v) {
            const prev = edge[(i - 1 + n) % n]
            const next = edge[i]
            const sx = prev[0] + next[0]
            const sy = prev[1] + next[1]
            const len = Math.hypot(sx, sy) || 1
            v = [sx / len, sy / len]
          }
          this.normals.set(key, v)
          const [bx, by] = ring[(i + 1) % n]
          this.segs.push({ ax: x, ay: y, bx, by, nx: edge[i][0], ny: edge[i][1] })
        }
      }
    }
    this.empty = this.segs.length === 0
  }

  private distSq(x: number, y: number, s: BoundarySeg): number {
    const dx = s.bx - s.ax
    const dy = s.by - s.ay
    const len2 = dx * dx + dy * dy
    let t = len2 > 0 ? ((x - s.ax) * dx + (y - s.ay) * dy) / len2 : 0
    t = Math.min(Math.max(t, 0), 1)
    const px = s.ax + dx * t
    const py = s.ay + dy * t
    return (x - px) * (x - px) + (y - py) * (y - py)
  }

  contains(x: number, y: number): boolean {
    if (this.keys.has(coordKey(x, y))) return true
    if (this.empty) return false
    const tol2 = BOUNDARY_TOL * BOUNDARY_TOL
    for (const s of this.segs) {
      // cheap reject before the exact distance test
      if (x < Math.min(s.ax, s.bx) - BOUNDARY_TOL || x > Math.max(s.ax, s.bx) + BOUNDARY_TOL) continue
      if (y < Math.min(s.ay, s.by) - BOUNDARY_TOL || y > Math.max(s.ay, s.by) + BOUNDARY_TOL) continue
      if (this.distSq(x, y, s) <= tol2) return true
    }
    return false
  }

  normalFor(x: number, y: number): Vec2 {
    const exact = this.normals.get(coordKey(x, y))
    if (exact) return exact
    // nearest-segment fallback for backend-introduced vertices
    let best: BoundarySeg | null = null
    let bestD = Infinity
    for (const s of this.segs) {
      const d = this.distSq(x, y, s)
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
    return best ? [best.nx, best.ny] : [0, 0]
  }
}

/* ------------------------------------------------------------------ */
/* bevel profile (driven by the worker's actual inset distances)       */
/* ------------------------------------------------------------------ */

function profileZ(style: BevelStyle, b: number, d: number, h2: number): number {
  if (style === 'hard') return h2 - b + d // straight 45° chamfer
  const c = Math.min(Math.max(1 - d / b, -1), 1)
  return h2 - b + b * Math.sqrt(1 - c * c) // round-over: z = b·sin(acos(1−d/b))
}

function profileElevation(style: BevelStyle, b: number, d: number): number {
  if (style === 'hard') return Math.PI / 4
  return Math.acos(Math.min(Math.max(1 - d / b, -1), 1))
}

/* ------------------------------------------------------------------ */
/* mesh sink + triangulation                                           */
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
    // skip degenerate slivers — they render as shards under gloss
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    const crx = uy * vz - uz * vy
    const cry = uz * vx - ux * vz
    const crz = ux * vy - uy * vx
    if (crx * crx + cry * cry + crz * crz < 1e-12) return
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
  outer: LevelBoundary
  inner: LevelBoundary
  elevOuter: number
  elevInner: number
  faceted: boolean
}

/**
 * Bevel band: the 2D annulus between two erosion levels, each vertex
 * lifted to its ring's z with the true profile normal.
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
    const inner = shading.inner.contains(v.x, v.y)
    const boundary = inner ? shading.inner : shading.outer
    const z = inner ? zInner : zOuter
    const n2d = boundary.normalFor(v.x, v.y)
    const elev = inner ? shading.elevInner : shading.elevOuter
    const cos = Math.cos(elev)
    const sin = Math.sin(elev)
    let nx = n2d[0] * cos
    let ny = n2d[1] * cos
    let nz = sin * zSign
    const len = Math.hypot(nx, ny, nz)
    if (len < 0.5) {
      // no usable outline normal (isolated point) — face up/down
      nx = 0; ny = 0; nz = zSign
    } else {
      nx /= len; ny /= len; nz /= len
    }
    return { z, n: [nx, ny, nz] }
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

function emitPart(
  sink: MeshSink,
  part: BevelPartData,
  g: GeometrySettings,
  zScale: number,
  cosThreshold: number,
  faceted: boolean,
) {
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
  const dSeq: number[] = [0, ...part.insets]
  const boundaries = seq.map((level) => new LevelBoundary(level, cosThreshold))

  for (let k = 0; k < S; k++) {
    const shading: BandShading = {
      outer: boundaries[k],
      inner: boundaries[k + 1],
      elevOuter: profileElevation(g.bevelStyle, part.bevel, dSeq[k]),
      elevInner: profileElevation(g.bevelStyle, part.bevel, dSeq[k + 1]),
      faceted,
    }
    const zo = profileZ(g.bevelStyle, b, dSeq[k] * zScale, h2)
    const zi = profileZ(g.bevelStyle, b, dSeq[k + 1] * zScale, h2)
    emitBand(sink, part.bands[k], zo, zi, shading, false)
    emitBand(sink, part.bands[k], zo, zi, shading, true)
  }

  // cap = deepest non-empty level (empty when thin shapes fully rounded off)
  const cap = part.levels[S - 1]
  if (cap.length) {
    emitCap(sink, cap, h2, false)
    emitCap(sink, cap, -h2, true)
  }
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
    emitPart(sink, part, g, zScale, flatMode ? 2 /* dot ≥ 2 impossible → never smooth */ : cosThreshold, facetedBands)
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
