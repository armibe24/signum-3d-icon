/* ============================================================
   SVG parsing (main thread — needs DOMParser, which is not
   available in workers). Uses three's SVGLoader to resolve all
   element types (path/line/polyline/circle/rect/ellipse/polygon)
   plus transforms and style inheritance into ShapePaths, then
   samples them into plain polyline / polygon data that the
   worker can process without any DOM access.
   ============================================================ */

import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import type { GeometryQuality, Pair } from '../types'
import type { FillElement, ParsedSvg, StrokeElement } from './types'

const CURVE_DIVISIONS: Record<GeometryQuality, number> = {
  fast: 10,
  balanced: 22,
  high: 42,
}

const MAX_SVG_BYTES = 400_000
const MAX_ELEMENTS = 600

/** Scan the raw markup for things SVGLoader cannot convert to geometry. */
function collectDomWarnings(svgText: string): string[] {
  const warnings: string[] = []
  if (svgText.length > MAX_SVG_BYTES) {
    warnings.push('SVG is very large — processing may be slow.')
  }
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  if (doc.querySelector('parsererror')) {
    warnings.push('SVG contains markup errors — some elements may be skipped.')
    return warnings
  }
  const unsupported = ['text', 'image', 'foreignObject', 'filter']
  for (const tag of unsupported) {
    if (doc.querySelector(tag)) warnings.push(`<${tag}> elements are not supported and were ignored.`)
  }
  if (doc.querySelector('linearGradient, radialGradient, pattern')) {
    warnings.push('Gradient / pattern fills are flattened to solid geometry.')
  }
  const count = doc.querySelectorAll('*').length
  if (count > MAX_ELEMENTS) {
    warnings.push(`SVG has ${count} elements — geometry may be heavy or slow.`)
  }
  return warnings
}

function toPairs(points: { x: number; y: number }[]): Pair[] {
  const out: Pair[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    // drop consecutive duplicates — they break offsetting math
    if (!last || Math.abs(last[0] - p.x) > 1e-9 || Math.abs(last[1] - p.y) > 1e-9) {
      out.push([p.x, p.y])
    }
  }
  return out
}

/**
 * Parse SVG markup into sampled stroke polylines and fill polygons.
 * @param strokeScale multiplier applied to every resolved stroke width
 */
export function parseSvg(svgText: string, quality: GeometryQuality, strokeScale: number): ParsedSvg {
  const warnings = collectDomWarnings(svgText)
  const divisions = CURVE_DIVISIONS[quality]
  const strokes: StrokeElement[] = []
  const fills: FillElement[] = []

  let data
  try {
    data = new SVGLoader().parse(svgText)
  } catch (e) {
    throw new Error(`SVG could not be parsed: ${e instanceof Error ? e.message : String(e)}`)
  }

  for (const path of data.paths) {
    const style = (path.userData?.style ?? {}) as {
      fill?: string
      fillOpacity?: number
      stroke?: string
      strokeOpacity?: number
      strokeWidth?: number
    }

    const hasStroke =
      style.stroke !== undefined && style.stroke !== 'none' && (style.strokeOpacity ?? 1) > 0
    const hasFill = style.fill !== undefined && style.fill !== 'none' && (style.fillOpacity ?? 1) > 0

    if (hasStroke) {
      const width = Math.max((style.strokeWidth ?? 1) * strokeScale, 1e-4)
      for (const sub of path.subPaths) {
        const raw = sub.getPoints(divisions)
        const points = toPairs(raw)
        if (points.length < 2) {
          // a zero-length subpath with round caps is a dot
          if (points.length === 1) strokes.push({ points, closed: false, width })
          continue
        }
        const first = points[0]
        const last = points[points.length - 1]
        const closed =
          sub.autoClose || (Math.abs(first[0] - last[0]) < 1e-6 && Math.abs(first[1] - last[1]) < 1e-6)
        strokes.push({ points, closed, width })
      }
    }

    if (hasFill) {
      try {
        const shapes = SVGLoader.createShapes(path)
        for (const shape of shapes) {
          const pts = shape.extractPoints(divisions)
          const outer = toPairs(pts.shape)
          if (outer.length < 3) continue
          const holes = pts.holes.map(toPairs).filter((h) => h.length >= 3)
          fills.push({ polygon: [outer, ...holes] })
        }
      } catch {
        warnings.push('A filled shape could not be converted and was skipped.')
      }
    }
  }

  if (strokes.length === 0 && fills.length === 0) {
    warnings.push('No drawable stroke or fill geometry found in this SVG.')
  }

  return { strokes, fills, warnings }
}
