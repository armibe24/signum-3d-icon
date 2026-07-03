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
          <button type="button" className="vp-chip vp-chip--icon" onClick={() => sceneManager.fitCamera()} title="Frame object (F)">
            <Icon name="focus" size={11} strokeWidth={2.4} />
            Fit
          </button>
          <button type="button" className="vp-chip vp-chip--icon" onClick={() => sceneManager.resetCamera()} title="Reset camera (0)">
            <Icon name="rotate-ccw" size={11} strokeWidth={2.4} />
            Reset
          </button>
          <button
            type="button"
            className={`vp-chip vp-chip--icon${autoRotate ? ' active' : ''}`}
            title="Auto-rotate camera"
            onClick={() => {
              const next = !autoRotate
              setAutoRotate(next)
              sceneManager.setAutoRotate(next)
            }}
          >
            <Icon name="orbit" size={11} strokeWidth={2.4} />
            Orbit
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
          <button
            type="button"
            className="vp-chip vp-chip--icon"
            title="Play / pause animation (Space)"
            onClick={() => store.setTransient({ playing: !store.get().playing })}
          >
            <Icon name={playing ? 'pause' : 'play'} size={11} strokeWidth={2.4} />
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
