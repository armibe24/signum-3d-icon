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

import type { BevelPartData, BevelStyle, GeometryQuality } from '../types'

/** outline + boolean + normalize — produces the 2D solid per part */
export interface ProcessRequest {
  op: 'process'
  id: number
  parsed: ParsedSvg
  combine: 'union' | 'separate'
  quality: GeometryQuality
  normalizeSize: boolean
}

/** robust bevel-ring computation (erosion levels + annular bands) */
export interface BevelRequest {
  op: 'bevel'
  id: number
  parts: MultiPolygon[]
  style: Exclude<BevelStyle, 'none'>
  amount: number
  segments: number
  depth: number
  quality: GeometryQuality
}

export type SvgWorkerRequest = ProcessRequest | BevelRequest

export interface ProcessResponse {
  op: 'process'
  id: number
  parts: MultiPolygon[]
  warnings: string[]
  error?: string
}

export interface BevelResponse {
  op: 'bevel'
  id: number
  parts: BevelPartData[]
  warnings: string[]
  error?: string
}

export type SvgWorkerResponse = ProcessResponse | BevelResponse
