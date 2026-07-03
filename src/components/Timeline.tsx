/* ============================================================
   Timeline-lite — transport (play / loop), frame + time readout,
   duration & FPS fields, and a scrubbable ruler with playhead.
   Scrubbing writes store.time; the engine's rAF loop applies it.
   Built deliberately small; a keyframe timeline can replace the
   ruler while keeping the same transport row.
   ============================================================ */

import { useRef } from 'react'
import { setSlice, store, useStore } from '../store/store'
import { NumField } from './common/NumField'
import { normalizePlayTime } from '../engine/animation'

export function Timeline() {
  const time = useStore((s) => s.time)
  const playing = useStore((s) => s.playing)
  const processing = useStore((s) => s.processing)
  const anim = useStore((s) => s.settings.animation)
  const rulerRef = useRef<HTMLDivElement>(null)
  const scrubbing = useRef(false)

  const t = normalizePlayTime(anim, time)
  const frac = Math.min(t / Math.max(anim.duration, 0.01), 1)
  const frame = Math.min(Math.floor(t * anim.fps) + 1, Math.max(Math.round(anim.duration * anim.fps), 1))
  const totalFrames = Math.max(Math.round(anim.duration * anim.fps), 1)

  const scrubTo = (clientX: number) => {
    const rect = rulerRef.current!.getBoundingClientRect()
    const f = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
    store.setTransient({ time: f * anim.duration })
  }

  // second labels along the ruler (max ~10 to stay readable)
  const labelStep = anim.duration <= 10 ? 1 : Math.ceil(anim.duration / 10)
  const labels: number[] = []
  for (let s = 0; s <= anim.duration; s += labelStep) labels.push(s)

  return (
    <div className="timeline">
      <div className="timeline-controls">
        <div className="tl-group tl-group--left">
          <div className="tl-transport">
            <button type="button" className="iconbtn" title="Jump to start"
              onClick={() => store.setTransient({ time: 0 })}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="m17 18-8-6 8-6" /><path d="M5 6v12" />
              </svg>
            </button>
            <button type="button" className="iconbtn" title="Jump to end"
              onClick={() => store.setTransient({ time: anim.duration - 1e-4 })}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="m7 6 8 6-8 6" /><path d="M19 6v12" />
              </svg>
            </button>
            <button
              type="button"
              className={`iconbtn${anim.loop ? ' accent' : ''}`}
              title="Loop"
              onClick={() => setSlice('animation', { loop: !anim.loop })}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m17 2 4 4-4 4" />
                <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                <path d="m7 22-4-4 4-4" />
                <path d="M21 13v1a4 4 0 0 1-4 4H3" />
              </svg>
            </button>
          </div>
          <span className="tl-workdot on" style={{ opacity: processing ? 1 : 0 }} />
        </div>

        <div className="tl-group tl-group--center">
          <button
            type="button"
            className="tl-play"
            title="Play / pause (Space)"
            onClick={() => store.setTransient({ playing: !playing })}
          >
            {playing ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="4" width="5" height="16" rx="1" />
                <rect x="14" y="4" width="5" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 4.5v15a1 1 0 0 0 1.5.87l13-7.5a1 1 0 0 0 0-1.74l-13-7.5A1 1 0 0 0 7 4.5z" />
              </svg>
            )}
          </button>
          <span className="tl-counter">
            {String(frame).padStart(3, '0')}
            <span> / {String(totalFrames).padStart(3, '0')}</span>
          </span>
          <span className="tl-counter">
            {t.toFixed(2)}s<span className="tl-time"> / {anim.duration.toFixed(2)}s</span>
          </span>
        </div>

        <div className="tl-group tl-group--right">
          <label className="tl-field">
            FPS
            <NumField value={anim.fps} min={1} max={60} step={1}
              onChange={(v) => setSlice('animation', { fps: Math.round(v) })} />
          </label>
          <label className="tl-field">
            Dur
            <NumField value={anim.duration} min={0.2} max={30} step={0.5}
              onChange={(v) => setSlice('animation', { duration: v })} />
            <span>s</span>
          </label>
        </div>
      </div>

      <div
        ref={rulerRef}
        className="tl-ruler"
        onPointerDown={(e) => {
          scrubbing.current = true
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          scrubTo(e.clientX)
        }}
        onPointerMove={(e) => {
          if (scrubbing.current) scrubTo(e.clientX)
        }}
        onPointerUp={() => (scrubbing.current = false)}
      >
        <div className="tl-ticks" />
        {labels.map((s) => (
          <span key={s} className="tl-ticklabel" style={{ left: `${(s / anim.duration) * 100}%` }}>
            {s}s
          </span>
        ))}
        <div className="tl-progressfill" style={{ width: `${frac * 100}%` }} />
        <div className="tl-playhead" style={{ left: `${frac * 100}%` }}>
          <span className="tl-playhead-cap" />
        </div>
      </div>
    </div>
  )
}
