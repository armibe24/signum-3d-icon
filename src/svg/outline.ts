/* ============================================================
   Stroke outlining — turns a sampled polyline + width into a set
   of simple polygons whose union is the stroked area with round
   caps and round joins (the lucide look).

   Strategy: one rectangle ("quad") per segment plus one circle
   per vertex. Individually each piece is a clean convex polygon;
   the boolean union stage merges them into a single watertight
   outline. This is slower than a direct offset algorithm but far
   more robust against self-intersections, cusps and tight turns.
   Pure math — safe to run inside a Web Worker.
   ============================================================ */

import type { Pair, Ring } from '../types'

/** Ramer–Douglas–Peucker simplification, keeps curves smooth at `epsilon`. */
export function simplifyPolyline(points: Pair[], epsilon: number): Pair[] {
  if (points.length <= 2 || epsilon <= 0) return points

  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]

  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = points[a]
    const [bx, by] = points[b]
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    let maxDist = -1
    let maxIdx = -1
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i]
      let dist: number
      // Near-degenerate anchor segments (e.g. the coincident endpoints of a
      // CLOSED ring — circles!) make the line direction numerically
      // meaningless; fall back to point distance. The distance itself is
      // computed from RELATIVE coordinates — the textbook absolute-product
      // form (bx·ay − by·ax) cancels catastrophically for coordinates far
      // from the origin and silently collapsed small circles to 2 points.
      if (len2 < 1e-12) {
        dist = Math.hypot(px - ax, py - ay)
      } else {
        dist = Math.abs(dx * (py - ay) - dy * (px - ax)) / Math.sqrt(len2)
      }
      if (dist > maxDist) {
        maxDist = dist
        maxIdx = i
      }
    }
    if (maxDist > epsilon && maxIdx > 0) {
      keep[maxIdx] = 1
      stack.push([a, maxIdx], [maxIdx, b])
    }
  }

  const out: Pair[] = []
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i])
  return out
}

function circleRing(cx: number, cy: number, r: number, segments: number): Ring {
  const ring: Ring = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    ring.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return ring
}

export interface BufferOptions {
  /** circle tessellation for joins/caps */
  circleSegments: number
  /** RDP tolerance in SVG units */
  simplifyEpsilon: number
}

/**
 * Buffer a polyline into round-join/round-cap outline pieces.
 * Returns a list of simple rings (quads + circles) to be unioned.
 */
export function bufferPolyline(
  rawPoints: Pair[],
  closed: boolean,
  width: number,
  opts: BufferOptions,
): Ring[] {
  const r = width / 2
  if (r <= 0) return []

  const points = simplifyPolyline(rawPoints, opts.simplifyEpsilon)
  const rings: Ring[] = []

  // a single point with round caps is just a dot
  if (points.length === 1) {
    return [circleRing(points[0][0], points[0][1], r, opts.circleSegments)]
  }

  // circles at every vertex give round joins + round end caps for free
  for (const [x, y] of points) rings.push(circleRing(x, y, r, opts.circleSegments))

  const segCount = closed ? points.length : points.length - 1
  for (let i = 0; i < segCount; i++) {
    const [ax, ay] = points[i]
    const [bx, by] = points[(i + 1) % points.length]
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy)
    if (len < 1e-9) continue
    // unit normal
    const nx = (-dy / len) * r
    const ny = (dx / len) * r
    rings.push([
      [ax + nx, ay + ny],
      [bx + nx, by + ny],
      [bx - nx, by - ny],
      [ax - nx, ay - ny],
    ])
  }

  return rings
}
