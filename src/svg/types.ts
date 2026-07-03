/* Data exchanged between the main-thread SVG parser and the
   geometry worker. Everything here is plain JSON-serializable. */

import type { MultiPolygon, Pair, PolygonWithHoles } from '../types'

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

export interface SvgWorkerRequest {
  id: number
  parsed: ParsedSvg
  combine: 'union' | 'separate'
  quality: 'fast' | 'balanced' | 'high'
  normalizeSize: boolean
}

export interface SvgWorkerResponse {
  id: number
  parts: MultiPolygon[]
  warnings: string[]
  error?: string
}
