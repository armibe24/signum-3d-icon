/* ============================================================
   3D viewport — mounts the SceneManager renderer, hosts the
   render-frame overlay, toolbar chips (fit / reset / auto-rotate
   / grid / play), the processing pill, checkerboard preview
   layer and SVG drag&drop.
   ============================================================ */

import { useEffect, useRef, useState } from 'react'
import { sceneManager } from '../engine/SceneManager'
import { store, useStore } from '../store/store'
import { importSvgFile } from './IconBrowser'
import { RenderFrame } from './RenderFrame'
import { Icon } from './common/Icon'

export function Viewport3D() {
  const rootRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [grid, setGrid] = useState(false)
  const processing = useStore((s) => s.processing)
  const bgMode = useStore((s) => s.settings.background.mode)
  const zoomPct = useStore((s) => s.zoomPct)
  const showHint = useStore((s) => s.prefs.showHint)

  useEffect(() => {
    const host = hostRef.current!
    sceneManager.mount(host)
    sceneManager.setPixelRatioMode(store.get().prefs.pixelRatio)
    return () => sceneManager.unmount()
  }, [])

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) await importSvgFile(file)
  }

  return (
    <div
      ref={rootRef}
      className={`viewport${bgMode === 'checkerboard' ? ' bg-checker' : ''}${dragOver ? ' dragover' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="checker" />
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
      <RenderFrame viewportRef={rootRef} />

      <div className="viewport-toolbar">
        <div className="vp-chipgroup">
          <button type="button" className="vp-chip vp-chip--icon" onClick={() => sceneManager.resetCamera()} title="Reset camera (0)">
            <Icon name="rotate-ccw" size={11} strokeWidth={2.4} />
            Reset
          </button>
          <button
            type="button"
            className={`vp-chip vp-chip--icon${grid ? ' active' : ''}`}
            title="Toggle grid (viewport only, never exported)"
            onClick={() => {
              const next = !grid
              setGrid(next)
              sceneManager.setGrid(next)
            }}
          >
            <Icon name="grid-3x3" size={11} strokeWidth={2.4} />
            Grid
          </button>
          <button type="button" className="vp-chip vp-chip--icon" onClick={() => sceneManager.fitCamera()} title="Frame object (F)">
            <Icon name="focus" size={11} strokeWidth={2.4} />
            Fit
          </button>
          <span className="vp-readout" title="Camera zoom relative to the default view">
            {zoomPct}%
          </span>
        </div>
        {processing && (
          <span className="vp-processing">
            <span className="pulse" />
            Rebuilding
          </span>
        )}
      </div>

      {showHint && <div className="viewport-hint">L-drag rotate · R-drag pan · wheel zoom</div>}
    </div>
  )
}
