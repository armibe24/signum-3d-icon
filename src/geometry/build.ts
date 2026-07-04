/* ============================================================
   Geometry orchestrator — watches icon + geometry settings and
   drives the pipeline:

     svg text ──parse (main)──► worker 'process' (outline+boolean+
     normalize) ──► worker 'bevel' (robust erosion rings, only when
     bevel is on) ──► assemble mesh + shading (main) ──►
     engine.setGeometry()

   - debounced so slider drags rebuild at most every 120 ms
   - every run gets an id; stale worker replies are dropped
   - two cache layers: processed 2D polygons (independent of
     bevel/shading) and final geometry (full key)
   - only geometry-affecting settings trigger a rebuild; material
     / light / camera changes never reach this module. Shading
     changes reuse the polygon caches and only re-run the cheap
     assembly + normals stage.
   ============================================================ */

import type * as THREE from 'three'
import { store } from '../store/store'
import type { AppSettings, BevelPartData, MultiPolygon } from '../types'
import { parseSvg } from '../svg/parse'
import type { BevelResponse, ProcessResponse, SvgWorkerRequest, SvgWorkerResponse } from '../svg/types'
import { assembleIconGeometry, geometryLooksValid } from './mesh'
import { geometryCache, polygonCache } from './cache'
import { lucideSvg } from '../icons/lucide'

export interface BuildResult {
  geometry: THREE.BufferGeometry
  warnings: string[]
}

type Listener = (result: BuildResult) => void

const DEBOUNCE_MS = 120

/** Settings that require re-running the worker 'process' stage */
function polygonKey(s: AppSettings): string {
  const g = s.geometry
  const iconKey = s.icon.type === 'lucide' ? `l:${s.icon.name}` : `c:${hashString(s.icon.svg ?? '')}`
  return JSON.stringify([iconKey, g.strokeWidth, g.combine, g.quality, g.normalizeSize])
}

/** Full geometry identity (worker 'bevel' + assembly + shading) */
function geometryKey(s: AppSettings): string {
  const g = s.geometry
  return (
    polygonKey(s) +
    JSON.stringify([g.extrudeDepth, g.bevelAmount, g.bevelSegments, g.bevelStyle, g.shading, g.shadingAngle])
  )
}

function hashString(str: string): string {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36) + ':' + str.length
}

class GeometryBuilder {
  private worker: Worker
  private runId = 0
  private msgId = 0
  private timer: number | null = null
  private lastKey = ''
  private listener: Listener | null = null
  private pending = new Map<number, (r: SvgWorkerResponse) => void>()
  private currentGeoKey = ''

  constructor() {
    this.worker = new Worker(new URL('../workers/svgWorker.ts', import.meta.url), {
      type: 'module',
    })
    this.worker.onmessage = (ev: MessageEvent<SvgWorkerResponse>) => {
      const resolve = this.pending.get(ev.data.id)
      if (resolve) {
        this.pending.delete(ev.data.id)
        resolve(ev.data)
      }
    }
  }

  onGeometry(listener: Listener) {
    this.listener = listener
  }

  /** Subscribe to the store and rebuild when geometry-relevant keys change. */
  start() {
    const check = () => {
      const key = geometryKey(store.get().settings)
      if (key === this.lastKey) return
      this.lastKey = key
      if (this.timer !== null) window.clearTimeout(this.timer)
      this.timer = window.setTimeout(() => this.rebuild(), DEBOUNCE_MS)
    }
    store.subscribe(check)
    this.rebuild() // initial build
  }

  private async rebuild() {
    const id = ++this.runId
    const settings = store.get().settings
    const g = settings.geometry
    const pKey = polygonKey(settings)
    const gKey = geometryKey(settings)

    // fully cached geometry — instant
    const cachedGeo = geometryCache.get(gKey)
    if (cachedGeo) {
      const cachedPolys = polygonCache.get(pKey)
      this.deliver(cachedGeo.geometry, cachedPolys?.warnings ?? [], gKey)
      return
    }

    store.setTransient({ processing: true })
    try {
      // ---- stage 1: processed 2D solid (cached across bevel/shading) --
      let parts: MultiPolygon[]
      let warnings: string[]

      const cachedPolys = polygonCache.get(pKey)
      if (cachedPolys) {
        parts = cachedPolys.parts
        warnings = [...cachedPolys.warnings]
      } else {
        const svgText = this.resolveSvg(settings)
        const parsed = parseSvg(svgText, g.quality, g.strokeWidth)
        const response = (await this.request({
          op: 'process',
          id: ++this.msgId,
          parsed,
          combine: g.combine,
          quality: g.quality,
          normalizeSize: g.normalizeSize,
        })) as ProcessResponse
        if (id !== this.runId) return // superseded while waiting
        if (response.error) throw new Error(response.error)
        parts = response.parts
        warnings = [...parsed.warnings, ...response.warnings]
        polygonCache.set(pKey, { parts, warnings })
      }

      // ---- stage 2: robust bevel rings (worker), when bevel is on -----
      let bevelParts: BevelPartData[]
      const wantBevel = g.bevelStyle !== 'none' && g.bevelAmount > 0.01
      if (wantBevel) {
        const response = (await this.request({
          op: 'bevel',
          id: ++this.msgId,
          parts,
          style: g.bevelStyle as 'hard' | 'rounded',
          amount: g.bevelAmount,
          segments: g.bevelSegments,
          depth: g.extrudeDepth,
          quality: g.quality,
        })) as BevelResponse
        if (id !== this.runId) return
        if (response.error) throw new Error(response.error)
        warnings = [...warnings, ...response.warnings]
        bevelParts = response.parts
      } else {
        bevelParts = parts.map((base) => ({ base, levels: [], bands: [], bevel: 0 }))
      }

      // ---- stage 3: assembly + shading (main thread, fast) ------------
      if (id !== this.runId) return
      const assembled = assembleIconGeometry(bevelParts, g)
      warnings = [...warnings, ...assembled.warnings]

      if (!geometryLooksValid(assembled.geometry)) {
        warnings = [...warnings, 'This icon produced invalid 3D geometry — keeping the previous mesh.']
        assembled.geometry.dispose()
        store.setTransient({ processing: false, warnings })
        store.toast(warnings[warnings.length - 1], 'error')
        return
      }
      geometryCache.set(gKey, { geometry: assembled.geometry, inUse: true })
      this.deliver(assembled.geometry, warnings, gKey)
    } catch (e) {
      if (id !== this.runId) return
      store.setTransient({ processing: false })
      store.toast(e instanceof Error ? e.message : 'Geometry build failed.', 'error')
    }
  }

  private resolveSvg(settings: AppSettings): string {
    if (settings.icon.type === 'custom') {
      if (!settings.icon.svg) throw new Error('Custom icon has no SVG data.')
      return settings.icon.svg
    }
    const svg = lucideSvg(settings.icon.name, '#000')
    if (!svg) throw new Error(`Unknown lucide icon "${settings.icon.name}".`)
    return svg
  }

  private request(req: SvgWorkerRequest): Promise<SvgWorkerResponse> {
    return new Promise((resolve) => {
      this.pending.set(req.id, resolve)
      this.worker.postMessage(req)
    })
  }

  private deliver(geometry: THREE.BufferGeometry, warnings: string[], gKey: string) {
    // release the in-use pin of the previous geometry so the LRU may dispose it
    if (this.currentGeoKey && this.currentGeoKey !== gKey) {
      const prev = geometryCache.get(this.currentGeoKey)
      if (prev) prev.inUse = false
    }
    this.currentGeoKey = gKey
    store.setTransient({ processing: false, warnings })
    if (warnings.length) {
      store.toast(warnings[0], 'info')
    }
    this.listener?.({ geometry, warnings })
  }
}

export const geometryBuilder = new GeometryBuilder()
