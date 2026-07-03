/* ============================================================
   Small LRU caches for the two expensive pipeline stages:
   - processed 2D polygons (parse + outline + boolean, per icon)
   - extruded BufferGeometry (per polygon set + extrude params)
   Evicted geometries are disposed unless they are still bound to
   the live mesh (the engine owns that lifecycle).
   ============================================================ */

import type * as THREE from 'three'
import type { MultiPolygon } from '../types'

class LruCache<V> {
  private map = new Map<string, V>()
  constructor(
    private limit: number,
    private onEvict?: (v: V) => void,
  ) {}

  get(key: string): V | undefined {
    const v = this.map.get(key)
    if (v !== undefined) {
      // refresh recency
      this.map.delete(key)
      this.map.set(key, v)
    }
    return v
  }

  set(key: string, value: V) {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value as string
      const evicted = this.map.get(oldest)!
      this.map.delete(oldest)
      this.onEvict?.(evicted)
    }
  }

  clear() {
    if (this.onEvict) for (const v of this.map.values()) this.onEvict(v)
    this.map.clear()
  }
}

export interface PolygonCacheEntry {
  parts: MultiPolygon[]
  warnings: string[]
}

export const polygonCache = new LruCache<PolygonCacheEntry>(24)

interface GeometryEntry {
  geometry: THREE.BufferGeometry
  /** the engine sets this true while the geometry is on the live mesh */
  inUse: boolean
}

export const geometryCache = new LruCache<GeometryEntry>(10, (entry) => {
  if (!entry.inUse) entry.geometry.dispose()
})
