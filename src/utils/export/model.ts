/* ============================================================
   3D model export — turns the live icon mesh into real model
   files, using only the icon geometry + its materials (never
   lights, cameras, helpers or the ground plane):

   - GLB  (recommended): geometry + PBR materials + textures in
     one binary file (GLTFExporter; clearcoat via extension)
   - glTF: same content as a single .gltf with embedded buffers
   - OBJ:  custom writer with per-part objects + usemtl, plus a
     hand-written MTL and any color texture, packaged as a ZIP
   - STL:  binary, geometry only (the format has no materials)

   The exported node is centered (geometry is built centered),
   carries the user's object scale and base start rotation, and
   is named after the icon. The liquid-metal look exports as a
   standard normal map, so GLB/glTF reproduce it; OBJ carries
   color/roughness only; STL is geometry-only by design.
   ============================================================ */

import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { STLExporter } from 'three/addons/exporters/STLExporter.js'
import { zipSync } from 'fflate'
import { sceneManager } from '../../engine/SceneManager'
import { store } from '../../store/store'
import { downloadBlob, safeFileName } from '../file'
import type { ModelFormat } from '../../types'

/** clean standalone mesh for exporters — shares geometry/materials, never
    the live scene graph */
function buildExportMesh(): THREE.Mesh {
  const { geometry, materials } = sceneManager.getIconModel()
  const s = store.get().settings
  const mesh = new THREE.Mesh(geometry, materials.length === 1 ? materials[0] : materials)
  mesh.name = safeFileName(s.icon.name) || 'signum-icon'
  const rot = s.animation.startRotation
  mesh.rotation.set(
    THREE.MathUtils.degToRad(rot.x),
    THREE.MathUtils.degToRad(rot.y),
    THREE.MathUtils.degToRad(rot.z),
  )
  mesh.scale.setScalar(s.geometry.scale)
  mesh.updateMatrix()
  return mesh
}

async function exportGltf(binary: boolean): Promise<void> {
  const mesh = buildExportMesh()
  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(mesh, { binary })
  const name = mesh.name
  if (binary) {
    downloadBlob(new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' }), `${name}.glb`)
  } else {
    const json = JSON.stringify(result, null, 2)
    downloadBlob(new Blob([json], { type: 'model/gltf+json' }), `${name}.gltf`)
  }
}

/* ---------------- OBJ + MTL (custom writer, per-part groups) --------- */

function dataUrlBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(',') + 1)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function exportObjZip(): void {
  const { geometry, materials } = sceneManager.getIconModel()
  const s = store.get().settings
  const name = safeFileName(s.icon.name) || 'signum-icon'
  const pos = geometry.getAttribute('position')
  const nor = geometry.getAttribute('normal')
  const uv = geometry.getAttribute('uv')
  const scale = s.geometry.scale

  const lines: string[] = [`mtllib ${name}.mtl`]
  for (let i = 0; i < pos.count; i++) {
    lines.push(`v ${(pos.getX(i) * scale).toFixed(5)} ${(pos.getY(i) * scale).toFixed(5)} ${(pos.getZ(i) * scale).toFixed(5)}`)
  }
  if (uv) for (let i = 0; i < uv.count; i++) lines.push(`vt ${uv.getX(i).toFixed(5)} ${uv.getY(i).toFixed(5)}`)
  if (nor) for (let i = 0; i < nor.count; i++) lines.push(`vn ${nor.getX(i).toFixed(4)} ${nor.getY(i).toFixed(4)} ${nor.getZ(i).toFixed(4)}`)

  const groups = geometry.groups.length
    ? geometry.groups
    : [{ start: 0, count: pos.count, materialIndex: 0 }]
  for (const [gi, group] of groups.entries()) {
    const mi = Math.min(group.materialIndex ?? 0, materials.length - 1)
    lines.push(`o ${name}_part_${gi + 1}`, `usemtl mat_${mi}`)
    const end = Math.min(group.start + group.count, pos.count)
    for (let i = group.start; i + 3 <= end; i += 3) {
      const a = i + 1
      const b = i + 2
      const c = i + 3
      const va = uv && nor ? `${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}` : nor ? `${a}//${a} ${b}//${b} ${c}//${c}` : `${a} ${b} ${c}`
      lines.push(`f ${va}`)
    }
  }

  const mtl: string[] = []
  const files: Record<string, Uint8Array> = {}
  materials.forEach((mat, i) => {
    mtl.push(`newmtl mat_${i}`)
    const c = mat.color
    mtl.push(`Kd ${c.r.toFixed(4)} ${c.g.toFixed(4)} ${c.b.toFixed(4)}`)
    mtl.push('Ks 0.5000 0.5000 0.5000')
    mtl.push(`Ns ${Math.round((1 - mat.roughness) * 900) + 10}`)
    mtl.push(`d ${mat.opacity.toFixed(3)}`)
    // PBR extension values many DCC tools read
    mtl.push(`Pm ${mat.metalness.toFixed(3)}`)
    mtl.push(`Pr ${mat.roughness.toFixed(3)}`)
    const m = store.get().settings.material
    if (mat.map && m.textureMap.startsWith('data:image/')) {
      const ext = m.textureMap.startsWith('data:image/jpeg') ? 'jpg' : 'png'
      const texFile = `${name}-texture.${ext}`
      files[texFile] = dataUrlBytes(m.textureMap)
      mtl.push(`map_Kd ${texFile}`)
    }
    mtl.push('')
  })

  files[`${name}.obj`] = new TextEncoder().encode(lines.join('\n'))
  files[`${name}.mtl`] = new TextEncoder().encode(mtl.join('\n'))
  const zipped = zipSync(files, { level: 6 })
  downloadBlob(new Blob([zipped as unknown as BlobPart], { type: 'application/zip' }), `${name}-obj.zip`)
}

function exportStl(): void {
  const mesh = buildExportMesh()
  const exporter = new STLExporter()
  const data = exporter.parse(mesh, { binary: true }) as unknown as DataView
  const name = mesh.name
  downloadBlob(new Blob([data.buffer as ArrayBuffer], { type: 'model/stl' }), `${name}.stl`)
}

export async function exportModel(format: ModelFormat): Promise<void> {
  try {
    switch (format) {
      case 'glb':
        await exportGltf(true)
        break
      case 'gltf':
        await exportGltf(false)
        break
      case 'obj':
        exportObjZip()
        break
      case 'stl':
        exportStl()
        break
    }
    store.toast(`Exported ${format.toUpperCase()} model`)
  } catch (e) {
    store.toast(e instanceof Error ? e.message : 'Model export failed.', 'error')
  }
}
