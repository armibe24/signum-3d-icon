/* Data exchanged between the main-thread SVG parser and the
   geometry worker. Everything here is plain JSON-serializable. */

import type { GeometryQuality, MultiPolygon, Pair, PolygonWithHoles } from '../types'

/** A sampled stroked element: polyline points + resolved stroke width */
export interface StrokeElement {
  points: Pair[]
  closed: boolean
  width: number
}

/** A sampled filled element: exterior + holes */
export interface FillElement {
  polygon: PolygonWithHoles
}

export interface ParsedSvg {
  strokes: StrokeElement[]
  fills: FillElement[]
  warnings: string[]
}

/** outline + boolean + normalize — produces the 2D solid per part */
export interface SvgWorkerRequest {
  op: 'process'
  id: number
  parsed: ParsedSvg
  combine: 'union' | 'separate'
  quality: GeometryQuality
  normalizeSize: boolean
}

export interface SvgWorkerResponse {
  op: 'process'
  id: number
  parts: MultiPolygon[]
  warnings: string[]
  error?: string
}
