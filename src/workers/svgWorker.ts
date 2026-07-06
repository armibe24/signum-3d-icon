/* ============================================================
   Geometry worker — all heavy boolean work, off the main thread.

   op 'process': SVG element data → clean 2D solid(s)
     1. buffer every stroked polyline into quad+circle pieces
     2. boolean-union the pieces of each element (self-overlap
        removal), then across elements when combine = union
     3. cleanup pass (strip union debris: collinear chains,
        stair-steps, dust/sliver rings)
     4. flip / center / rescale into normalized icon space

   Extrusion + bevel happen on the main thread with
   THREE.ExtrudeGeometry on these cleaned contours (see
   geometry/mesh.ts, built to match the SVG Extruder reference).

   Requests carry an id; stale responses are discarded by the
   caller, so rapid slider changes never race.
   ============================================================ */

import { bufferPolyline } from '../svg/outline'
import { unionPolygons, unionRings } from '../svg/boolean'
import { normalizeParts } from '../svg/normalize'
import { cleanMultiPolygon } from '../svg/clean'
import type { GeometryQuality, MultiPolygon, PolygonWithHoles } from '../types'
import type { SvgWorkerRequest, SvgWorkerResponse } from '../svg/types'

const CIRCLE_SEGMENTS: Record<GeometryQuality, number> = { fast: 12, balanced: 20, high: 32 }

/* ------------------------------------------------------------------ */
/* op: process                                                         */
/* ------------------------------------------------------------------ */

function handleProcess(req: SvgWorkerRequest): SvgWorkerResponse {
  const { id, parsed, combine, quality, normalizeSize } = req
  const warnings: string[] = []

  // ---- measure input extent to scale tolerances --------------------
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const touch = (x: number, y: number) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  for (const s of parsed.strokes) for (const [x, y] of s.points) touch(x, y)
  for (const f of parsed.fills) for (const ring of f.polygon) for (const [x, y] of ring) touch(x, y)
  const extent = isFinite(minX) ? Math.max(maxX - minX, maxY - minY, 1e-6) : 1

  const opts = {
    circleSegments: CIRCLE_SEGMENTS[quality],
    // keep curves smooth enough that metallic reflections don't band
    simplifyEpsilon: extent * (quality === 'high' ? 0.0004 : quality === 'balanced' ? 0.0009 : 0.002),
  }

  // ---- per-element outlines ----------------------------------------
  const elements: MultiPolygon[] = []
  let dirtyElements = 0

  for (const stroke of parsed.strokes) {
    const rings = bufferPolyline(stroke.points, stroke.closed, stroke.width, opts)
    if (rings.length === 0) continue
    const res = unionRings(rings)
    if (!res.clean) dirtyElements++
    if (res.polygons.length) elements.push(res.polygons)
  }

  for (const fill of parsed.fills) {
    // fills are already solid shapes; one union pass cleans
    // self-intersections and enforces ring orientation
    const res = unionPolygons([fill.polygon])
    if (!res.clean) dirtyElements++
    if (res.polygons.length) elements.push(res.polygons)
  }

  if (dirtyElements > 0) {
    warnings.push(`Outline union failed on ${dirtyElements} element(s) — using raw outline pieces there.`)
  }

  // ---- combine across elements --------------------------------------
  let parts: MultiPolygon[]
  if (combine === 'union' && elements.length > 1) {
    const flat: PolygonWithHoles[] = elements.flat()
    const res = unionPolygons(flat)
    if (!res.clean) {
      warnings.push('Boolean union across shapes was not fully exact — result kept as grouped parts.')
      parts = elements
    } else {
      parts = [res.polygons]
    }
  } else {
    parts = elements
  }

  // ---- cleanup: strip union debris before triangulation -------------
  const cleanEps = extent * 0.0011
  const minArea = Math.pow(extent * 0.004, 2)
  parts = parts
    .map((part) => cleanMultiPolygon(part, cleanEps, minArea))
    .filter((part) => part.length > 0)

  if (parts.length === 0) {
    throw new Error('The icon produced no usable geometry.')
  }

  // ---- normalize (shared bbox so grouped parts keep alignment) ------
  const flatAll: MultiPolygon = parts.flat()
  const normalizedAll = normalizeParts([flatAll], normalizeSize)[0]
  const redistributed: MultiPolygon[] = []
  let cursor = 0
  for (const part of parts) {
    redistributed.push(normalizedAll.slice(cursor, cursor + part.length))
    cursor += part.length
  }

  return { op: 'process', id, parts: redistributed, warnings }
}

/* ------------------------------------------------------------------ */

self.onmessage = (ev: MessageEvent<SvgWorkerRequest>) => {
  const req = ev.data
  try {
    const response = handleProcess(req)
    self.postMessage(response)
  } catch (e) {
    self.postMessage({
      op: req.op,
      id: req.id,
      parts: [],
      warnings: [],
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
