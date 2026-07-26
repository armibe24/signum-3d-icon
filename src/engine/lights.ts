/* ============================================================
   Lighting rig — ambient + key / fill / rim directionals. Presets
   are complete value sets; manual slider edits flip the preset to
   "custom" in the UI layer. Key light direction is spherical
   (azimuth / elevation) around the object.
   ============================================================ */

import * as THREE from 'three'
import type { LightingSettings, LightingPresetId } from '../types'

export interface LightingPresetDef {
  id: LightingPresetId
  label: string
  /** presets set the light rig only — environment/studio settings persist */
  values: Pick<LightingSettings, 'ambient' | 'key' | 'fill' | 'rim' | 'keyAzimuth' | 'keyElevation'>
}

export const LIGHTING_PRESETS: LightingPresetDef[] = [
  { id: 'studio', label: 'Studio', values: { ambient: 0.35, key: 3, fill: 1.1, rim: 1.6, keyAzimuth: 35, keyElevation: 45 } },
  { id: 'softbox', label: 'Softbox', values: { ambient: 0.8, key: 2, fill: 1.7, rim: 0.6, keyAzimuth: 15, keyElevation: 55 } },
  { id: 'dramatic', label: 'Dramatic Side', values: { ambient: 0.08, key: 4.2, fill: 0.15, rim: 2.4, keyAzimuth: 78, keyElevation: 18 } },
  { id: 'top', label: 'Top Light', values: { ambient: 0.3, key: 3.4, fill: 0.5, rim: 0.9, keyAzimuth: 0, keyElevation: 76 } },
]

export interface LightRig {
  ambient: THREE.AmbientLight
  key: THREE.DirectionalLight
  fill: THREE.DirectionalLight
  rim: THREE.DirectionalLight
  group: THREE.Group
}

export function createLightRig(): LightRig {
  const group = new THREE.Group()

  const ambient = new THREE.AmbientLight(0xffffff, 0.35)

  const key = new THREE.DirectionalLight(0xffffff, 3)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = -4
  key.shadow.camera.right = 4
  key.shadow.camera.top = 4
  key.shadow.camera.bottom = -4
  key.shadow.camera.near = 0.5
  key.shadow.camera.far = 20
  key.shadow.bias = -0.0004
  key.shadow.radius = 8

  const fill = new THREE.DirectionalLight(0xdfefff, 1.1)
  fill.position.set(-4, 1.5, 2.5)

  const rim = new THREE.DirectionalLight(0xffffff, 1.6)
  rim.position.set(-2, 3, -4.5)

  group.add(ambient, key, fill, rim)
  return { ambient, key, fill, rim, group }
}

export function applyLightingSettings(rig: LightRig, l: LightingSettings): void {
  rig.ambient.intensity = l.ambient
  rig.key.intensity = l.key
  rig.fill.intensity = l.fill
  rig.rim.intensity = l.rim

  const az = THREE.MathUtils.degToRad(l.keyAzimuth)
  const el = THREE.MathUtils.degToRad(l.keyElevation)
  const rdist = 6
  rig.key.position.set(
    Math.sin(az) * Math.cos(el) * rdist,
    Math.sin(el) * rdist,
    Math.cos(az) * Math.cos(el) * rdist,
  )

  rig.key.castShadow = l.shadows
  rig.key.shadow.radius = l.softShadows ? 10 : 2
}
