/* ============================================================
   Timeline — Sonitus-style transport + track area.

   Layout mirrors the reference: transport cluster (jump/step/
   play/loop) on the left, frame + time counters and FPS/DUR
   fields in the center, and below them a track region with a
   sticky label column, a tick ruler and a full-height playhead.
   Scrubbing works anywhere in the track region. The single
   "animation" row is deliberately modular — keyframe lanes can
   replace it later without touching the transport.
   ============================================================ */

import { useRef } from 'react'
import { setSlice, store, useStore } from '../store/store'
import { NumField } from './common/NumField'
import { Icon } from './common/Icon'
import { normalizePlayTime } from '../engine/animation'

const LABEL_W = 160

const PRESET_LABELS: Record<string, string> = {
  static: 'Static',
  'spin-y': 'Spin Y',
  'spin-x': 'Spin X',
  turntable: 'Turntable',
  'slow-turn': 'Slow turn',
  wobble: 'Wobble',
  float: 'Floating wobble',
  reveal: 'Reveal',
  'bounce-in': 'Bounce-in',
}

export function Timeline() {
  const time = useStore((s) => s.time)
  const playing = useStore((s) => s.playing)
  const processing = useStore((s) => s.processing)
  const anim = useStore((s) => s.settings.animation)
  const trackRef = useRef<HTMLDivElement>(null)
  const scrubbing = useRef(false)

  const duration = Math.max(anim.duration, 0.01)
  const t = normalizePlayTime(anim, time)
  const frac = Math.min(t / duration, 1)
  const totalFrames = Math.max(Math.round(anim.duration * anim.fps), 1)
  const frame = Math.min(Math.floor(t * anim.fps) + 1, totalFrames)

  const scrubTo = (clientX: number) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x0 = rect.left + LABEL_W
    const w = rect.width - LABEL_W
    if (w <= 0) return
    const f = Math.min(Math.max((clientX - x0) / w, 0), 1)
    store.setTransient({ time: f * anim.duration })
  }

  const stepFrame = (dir: 1 | -1) => {
    const next = Math.min(Math.max(t + dir / anim.fps, 0), duration - 1e-4)
    store.setTransient({ time: next, playing: false })
  }

  // second labels + per-second ticks (capped so long durations stay readable)
  const labelStep = anim.duration <= 10 ? 1 : Math.ceil(anim.duration / 10)
  const seconds: number[] = []
  for (let s = 0; s <= anim.duration + 1e-6; s += labelStep) seconds.push(s)
  const frameTicks: number[] = []
  if (totalFrames <= 240) {
    for (let i = 0; i <= totalFrames; i++) frameTicks.push(i / anim.fps)
  }

  return (
    <div className="timeline">
      <div className="timeline-controls">
        {/* transport cluster — reference order:
            jump start · step back · play · step forward · jump end · loop */}
        <div className="tl-group tl-group--left">
          <div className="tl-transport">
            <button type="button" className="iconbtn" title="Jump to start"
              onClick={() => store.setTransient({ time: 0 })}>
              <Icon name="skip-back" size={12} strokeWidth={2.2} />
            </button>
            <button type="button" className="iconbtn" title="Previous frame"
              onClick={() => stepFrame(-1)}>
              <Icon name="chevron-left" size={13} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              className="tl-play"
              title="Play / pause (Space)"
              onClick={() => store.setTransient({ playing: !playing })}
            >
              <Icon name={playing ? 'pause' : 'play'} size={13} strokeWidth={2.6} />
            </button>
            <button type="button" className="iconbtn" title="Next frame"
              onClick={() => stepFrame(1)}>
              <Icon name="chevron-right" size={13} strokeWidth={2.4} />
            </button>
            <button type="button" className="iconbtn" title="Jump to end"
              onClick={() => store.setTransient({ time: anim.duration - 1e-4 })}>
              <Icon name="skip-forward" size={12} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              className={`iconbtn${anim.loop ? ' accent' : ''}`}
              title="Loop"
              onClick={() => setSlice('animation', { loop: !anim.loop })}
            >
              <Icon name="repeat" size={12} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        <div className="tl-group tl-group--center">
          <span className="tl-counter">
            {String(frame).padStart(3, '0')}
            <span> / {String(totalFrames).padStart(3, '0')}</span>
          </span>
          <span className="tl-counter">
            {t.toFixed(2)}s<span className="tl-time"> / {anim.duration.toFixed(2)}s</span>
          </span>
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

        <div className="tl-group tl-group--right">
          <span className={`tl-workdot${processing ? ' on' : ''}`} />
        </div>
      </div>

      <div className="tl-body">
        <div
          ref={trackRef}
          className="tl-scroll"
          onPointerDown={(e) => {
            scrubbing.current = true
            ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
            scrubTo(e.clientX)
          }}
          onPointerMove={(e) => {
            if (scrubbing.current) scrubTo(e.clientX)
          }}
          onPointerUp={() => (scrubbing.current = false)}
        >
          <div className="tl-head">
            <div className="tl-corner">
              Animation <span style={{ opacity: 0.7 }}>Preview</span>
            </div>
            <div className="tl-rulerarea">
              {frameTicks.map((s, i) => (
                <span
                  key={i}
                  className={`tl-tick${s % 1 > 1e-6 ? ' minor' : ''}`}
                  style={{ left: `${(s / duration) * 100}%` }}
                />
              ))}
              {seconds.map((s) => (
                <span key={s} className="tl-ticklabel" style={{ left: `${(s / duration) * 100}%` }}>
                  {s}s
                </span>
              ))}
            </div>
          </div>

          <div className="tl-row">
            <div className="tl-row-label">
              <span className="tl-rowico">
                <Icon name="rotate-3d" size={11} strokeWidth={2.4} />
              </span>
              {PRESET_LABELS[anim.preset] ?? anim.preset}
            </div>
            <div className="tl-lane tl-lane--empty">
              <div className="tl-progressfill" style={{ width: `${frac * 100}%` }} />
              Drag to scrub · keyframe lanes planned
            </div>
          </div>

          <div
            className="tl-playhead"
            style={{ left: `calc(${LABEL_W}px + ${frac * 100}% - ${frac * LABEL_W}px)` }}
          >
            <span className="tl-playhead-cap" />
          </div>
        </div>
      </div>
    </div>
  )
}
