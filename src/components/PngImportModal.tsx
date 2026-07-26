/* PNG → vector import — same modal pattern as the Settings window.
   Everything runs locally: threshold/invert drive a live vector
   preview (solid areas = future geometry), Import feeds the traced
   contours into the existing custom-SVG pipeline. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from './common/Modal'
import { Slider } from './common/Slider'
import { Toggle } from './common/Toggle'
import { Icon } from './common/Icon'
import { setSlice, store } from '../store/store'
import { pickFile } from '../utils/file'
import {
  buildMask,
  cleanRings,
  loadPngImageData,
  ringsToSvg,
  suggestInvert,
  traceContours,
  type Ring,
} from '../utils/pngVector'

const DEFAULTS = { threshold: 0.5, invert: false }

export function PngImportModal({ onClose }: { onClose: () => void }) {
  const [fileName, setFileName] = useState('')
  const [img, setImg] = useState<ImageData | null>(null)
  const [threshold, setThreshold] = useState(DEFAULTS.threshold)
  const [invert, setInvert] = useState(DEFAULTS.invert)
  const [autoInvert, setAutoInvert] = useState(false)
  const originalRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)

  const load = async () => {
    const file = await pickFile('.png,image/png')
    if (!file) return
    try {
      const data = await loadPngImageData(file)
      setImg(data)
      setFileName(file.name)
      const inv = suggestInvert(data)
      setAutoInvert(inv)
      setInvert(inv)
      setThreshold(DEFAULTS.threshold)
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'Could not read the PNG.', 'error')
    }
  }

  // trace live — the working image is ≤512px, so this is a few milliseconds
  const traced: { rings: Ring[]; solid: number } | null = useMemo(() => {
    if (!img) return null
    const mask = buildMask(img, { threshold, invert })
    let solid = 0
    for (let i = 0; i < mask.length; i++) solid += mask[i]
    const rings = solid ? cleanRings(traceContours(mask, img.width, img.height), img.width, img.height) : []
    return { rings, solid }
  }, [img, threshold, invert])

  // original preview
  useEffect(() => {
    const canvas = originalRef.current
    if (!canvas || !img) return
    canvas.width = img.width
    canvas.height = img.height
    canvas.getContext('2d')!.putImageData(img, 0, 0)
  }, [img])

  // vector preview: solid = geometry (accent), empty = dark
  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas || !img || !traced) return
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#08131a'
    ctx.fillRect(0, 0, img.width, img.height)
    ctx.fillStyle = '#5fc6e8'
    ctx.beginPath()
    for (const ring of traced.rings) {
      ctx.moveTo(ring[0][0], ring[0][1])
      for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1])
      ctx.closePath()
    }
    ctx.fill('nonzero')
  }, [img, traced])

  const usable = !!traced && traced.rings.length > 0
  const importShape = () => {
    if (!img || !traced || !usable) return
    const svg = ringsToSvg(traced.rings, img.width, img.height)
    setSlice('icon', {
      type: 'custom',
      name: fileName.replace(/\.png$/i, '') || 'traced-png',
      svg,
    })
    store.toast(`Imported ${fileName} as vector shape`)
    onClose()
  }

  return (
    <Modal title="Import PNG as Vector" onClose={onClose}>
      {!img ? (
        <>
          <p className="modal-note">
            Convert a PNG into a monochrome vector shape: pick a threshold, and the traced contours
            (including holes) run through the same extrusion, bevel, material and export pipeline
            as any icon. Everything is processed locally.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn--sm btn--teal" onClick={load}>
              <Icon name="image-plus" size={13} strokeWidth={2.2} />
              Choose PNG…
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="pngimport-previews">
            <div className="pngimport-cell">
              <span className="control-label">Original</span>
              <canvas ref={originalRef} className="pngimport-canvas" />
            </div>
            <div className="pngimport-cell">
              <span className="control-label">Vector preview</span>
              <canvas ref={previewRef} className="pngimport-canvas" />
            </div>
          </div>
          <p className="modal-note" style={{ marginTop: 8 }}>
            {usable
              ? `${traced.rings.length} contour${traced.rings.length === 1 ? '' : 's'} — highlighted areas become solid geometry.`
              : 'No usable shape at this threshold — adjust the threshold or toggle Invert.'}
          </p>
          <Slider label="Threshold" value={threshold} min={0.02} max={0.98} step={0.01} decimals={2}
            onChange={setThreshold} />
          <Toggle label="Invert (bright artwork)" checked={invert} onChange={setInvert} />
          <div className="modal-actions modal-actions--confirm">
            <button type="button" className="btn btn--sm" onClick={load}>
              Choose other…
            </button>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                setThreshold(DEFAULTS.threshold)
                setInvert(autoInvert)
              }}
            >
              Reset
            </button>
            <button type="button" className="btn btn--sm" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn--sm btn--teal" disabled={!usable} onClick={importShape}>
              <Icon name="check" size={13} strokeWidth={2.2} />
              Import
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
