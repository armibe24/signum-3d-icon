/* ============================================================
   Extrusion — converts normalized 2D polygons into a single
   THREE.BufferGeometry: triangulated caps, extruded walls and a
   configurable bevel.

   Bevel notes:
   - `bevelOffset = -bevelSize` keeps the icon silhouette exactly
     the size of the 2D outline (the bevel cuts inward instead of
     inflating outward, which would fuse neighbouring strokes).
   - "hard" bevel is a single 45° chamfer (1 segment); "rounded"
     uses the user's segment count for a soft rim.
   - When several parts stay separate (union off / fallback), each
     part gets a microscopic depth offset so coplanar caps never
     z-fight.
   ============================================================ */

import * as THREE from 'three'
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import type { GeometrySettings, MultiPolygon, Ring } from '../types'
import { NORMALIZED_SIZE } from '../svg/normalize'

function ringToShapePath(ring: Ring): THREE.Shape {
  const shape = new THREE.Shape()
  shape.setFromPoints(ring.map(([x, y]) => new THREE.Vector2(x, y)))
  shape.closePath()
  return shape
}

function polygonsToShapes(polygons: MultiPolygon): THREE.Shape[] {
  const shapes: THREE.Shape[] = []
  for (const poly of polygons) {
    if (!poly.length || poly[0].length < 3) continue
    const shape = ringToShapePath(poly[0])
    for (let h = 1; h < poly.length; h++) {
      if (poly[h].length < 3) continue
      const hole = new THREE.Path()
      hole.setFromPoints(poly[h].map(([x, y]) => new THREE.Vector2(x, y)))
      hole.closePath()
      shape.holes.push(hole)
    }
    shapes.push(shape)
  }
  return shapes
}

export function extrudeParts(parts: MultiPolygon[], g: GeometrySettings): THREE.BufferGeometry {
  const depth = Math.max(g.extrudeDepth, 0.1)
  // bevel cannot consume more than roughly half the depth or the icon inverts
  const bevel = g.bevelAmount > 0.01 ? Math.min(g.bevelAmount, depth * 0.49) : 0
  const bevelSegments = g.bevelStyle === 'hard' ? 1 : Math.max(1, Math.round(g.bevelSegments))

  const geometries: THREE.BufferGeometry[] = []

  parts.forEach((polygons, index) => {
    const shapes = polygonsToShapes(polygons)
    if (!shapes.length) return
    // tiny per-part depth jitter kills z-fighting between coplanar caps
    const jitter = parts.length > 1 ? 1 + index * 0.0015 : 1
    const geo = new THREE.ExtrudeGeometry(shapes, {
      depth: depth * jitter,
      curveSegments: 1, // rings are already sampled polylines
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: -bevel,
      bevelSegments,
    })
    geo.translate(0, 0, (-depth * jitter) / 2)
    geometries.push(geo)
  })

  if (!geometries.length) return new THREE.BufferGeometry()

  let merged =
    geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false) ?? geometries[0]

  // ExtrudeGeometry emits per-face normals (fully faceted). Re-crease so the
  // rounded bevel shades smoothly while hard edges stay crisp.
  const creaseAngle = THREE.MathUtils.degToRad(g.bevelStyle === 'rounded' ? 40 : 16)
  const creased = toCreasedNormals(merged, creaseAngle)
  if (creased !== merged) merged.dispose()
  merged = creased

  merged.center()

  // scale into world units: NORMALIZED_SIZE icon units → 2.4 world units
  const worldScale = 2.4 / NORMALIZED_SIZE
  merged.scale(worldScale, worldScale, worldScale)
  merged.computeBoundingBox()
  merged.computeBoundingSphere()
  return merged
}
