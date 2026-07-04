/* ============================================================
   Geometry worker — all heavy boolean work, off the main thread.

   op 'process': SVG element data → clean 2D solid(s)
     1. buffer every stroked polyline into quad+circle pieces
     2. boolean-union the pieces of each element (self-overlap
        removal), then across elements when combine = union
     3. cleanup pass (strip union debris: collinear chains,
        stair-steps, dust/sliver rings)
     4. flip / center / rescale into normalized icon space

   op 'bevel': base solid + bevel settings → erosion levels and
   annular bands for the fold-proof bevel builder (geometry/mesh):
     - each bevel step k gets E_k = erode(base, d_k), computed with
       robust boolean erosion — unlike ExtrudeGeometry's bisector
       offset this can NEVER fold, spike or self-intersect
     - band k = E_k − E_{k+1}, the exact 2D footprint the slanted
       bevel surface spans
     - the amount is clamped to the shape's thinnest feature and,
       if the shape would still erode away, reduced or disabled
       with a warning (never silently broken)

   Requests carry an id; stale responses are discarded by the
   caller, so rapid slider changes never race.
   ============================================================ */

import { bufferPolyline } from '../svg/outline'
import { differencePolygons, erodePolygons, unionPolygons, unionRings } from '../svg/boolean'
import { normalizeParts, NORMALIZED_SIZE } from '../svg/normalize'
import { cleanMultiPolygon, estimateMinFeatureWidth } from '../svg/clean'
import type { BevelPartData, GeometryQuality, MultiPolygon, PolygonWithHoles } from '../types'
import type {
  BevelRequest,
  BevelResponse,
  ProcessRequest,
  ProcessResponse,
  SvgWorkerRequest,
} from '../svg/types'

const CIRCLE_SEGMENTS: Record<GeometryQuality, number> = { fast: 12, balanced: 20, high: 32 }

/* ------------------------------------------------------------------ */
/* op: process                                                         */
/* ------------------------------------------------------------------ */

function handleProcess(req: ProcessRequest): ProcessResponse {
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
/* op: bevel                                                           */
/* ------------------------------------------------------------------ */

/** inset distances for each bevel step k = 1..S (step 0 is the base) */
function profileInsets(style: 'hard' | 'rounded', b: number, segments: number): number[] {
  if (style === 'hard') return [b]
  const insets: number[] = []
  for (let k = 1; k <= segments; k++) {
    // circular round-over: d(θ) = b·(1 − cos θ), θ ∈ (0, π/2]
    insets.push(b * (1 - Math.cos(((k / segments) * Math.PI) / 2)))
  }
  return insets
}

function handleBevel(req: BevelRequest): BevelResponse {
  const { id, parts, style, amount, segments, depth, quality } = req
  const warnings: string[] = []
  const circleSegments = Math.max(CIRCLE_SEGMENTS[quality] - 4, 10)
  const S = style === 'hard' ? 1 : Math.min(Math.max(Math.round(segments), 1), 8)
  // cleanup tolerances in normalized units (icon spans NORMALIZED_SIZE)
  const eps = NORMALIZED_SIZE * 0.0006
  const minArea = Math.pow(NORMALIZED_SIZE * 0.004, 2)

  const out: BevelPartData[] = []
  let reducedTo = 0
  let disabled = false

  for (const base of parts) {
    // ---- clamp: bevel can never exceed what the shape can absorb ----
    const ribbon = estimateMinFeatureWidth(base, NORMALIZED_SIZE * 0.08)
    let b = Math.min(amount, depth * 0.49, ribbon * 0.45)

    // ---- feasibility: the deepest erosion must leave something ------
    let deepest: MultiPolygon = []
    for (let attempt = 0; attempt < 4 && b > 0.05; attempt++) {
      deepest = erodePolygons(base, b, circleSegments)
      if (deepest.length) break
      b *= 0.6
      deepest = []
    }
    if (!deepest.length) b = 0

    if (b <= 0.05) {
      disabled = true
      out.push({ base, levels: [], bands: [], bevel: 0 })
      continue
    }
    if (b < amount - 0.05) reducedTo = Math.max(reducedTo, b)

    // ---- erosion levels E_1..E_S (each independent → monotonic) -----
    const insets = profileInsets(style, b, S)
    const levels: MultiPolygon[] = insets.map((d, i) => {
      if (i === insets.length - 1 && Math.abs(d - b) < 1e-9) {
        return cleanMultiPolygon(deepest, eps, minArea)
      }
      return cleanMultiPolygon(erodePolygons(base, d, circleSegments), eps, minArea)
    })

    // ---- annular bands between consecutive levels --------------------
    const seq: MultiPolygon[] = [base, ...levels]
    const bands: MultiPolygon[] = []
    for (let k = 0; k < seq.length - 1; k++) {
      bands.push(differencePolygons(seq[k], seq[k + 1]))
    }

    out.push({ base, levels, bands, bevel: b })
  }

  if (disabled) {
    warnings.push('Bevel disabled for this icon — the shape is too thin to bevel safely.')
  } else if (reducedTo > 0) {
    warnings.push(`Bevel clamped to ${reducedTo.toFixed(1)} so the icon's thinnest features stay intact.`)
  }

  return { op: 'bevel', id, parts: out, warnings }
}

/* ------------------------------------------------------------------ */

self.onmessage = (ev: MessageEvent<SvgWorkerRequest>) => {
  const req = ev.data
  try {
    const response = req.op === 'process' ? handleProcess(req) : handleBevel(req)
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
