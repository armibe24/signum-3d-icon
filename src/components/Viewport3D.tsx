/* ============================================================
   3D viewport — mounts the SceneManager renderer, hosts the
   toolbar chips (fit / reset / auto-rotate / grid), the
   processing pill, checkerboard preview layer and SVG drag&drop.
   ============================================================ */

import { useEffect, useRef, useState } from 'react'
import { sceneManager } from '../engine/SceneManager'
import { store, useStore } from '../store/store'
import { importSvgFile } from './IconBrowser'

export function Viewport3D() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [grid, setGrid] = useState(false)
  const processing = useStore((s) => s.processing)
  const bgMode = useStore((s) => s.settings.background.mode)
  const playing = useStore((s) => s.playing)

  useEffect(() => {
    const host = hostRef.current!
    sceneManager.mount(host)
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

      <div className="viewport-toolbar">
        <div className="vp-chipgroup">
          <button type="button" className="vp-chip" onClick={() => sceneManager.fitCamera()} title="Frame object (F)">
            Fit
          </button>
          <button type="button" className="vp-chip" onClick={() => sceneManager.resetCamera()} title="Reset camera (0)">
            Reset
          </button>
          <button
            type="button"
            className={`vp-chip${autoRotate ? ' active' : ''}`}
            title="Auto-rotate camera"
            onClick={() => {
              const next = !autoRotate
              setAutoRotate(next)
              sceneManager.setAutoRotate(next)
            }}
          >
            Orbit
          </button>
          <button
            type="button"
            className={`vp-chip${grid ? ' active' : ''}`}
            title="Toggle grid (viewport only, never exported)"
            onClick={() => {
              const next = !grid
              setGrid(next)
              sceneManager.setGrid(next)
            }}
          >
            Grid
          </button>
          <button
            type="button"
            className="vp-chip"
            title="Play / pause animation (Space)"
            onClick={() => store.setTransient({ playing: !store.get().playing })}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
        </div>
        {processing && (
          <span className="vp-processing">
            <span className="pulse" />
            Rebuilding
          </span>
        )}
      </div>

      <div className="viewport-hint">L-drag rotate · R-drag pan · wheel zoom</div>
    </div>
  )
}
