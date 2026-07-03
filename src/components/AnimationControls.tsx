import { Slider } from './common/Slider'
import { Select } from './common/Select'
import { Toggle } from './common/Toggle'
import { NumField } from './common/NumField'
import { setSlice, store, useStore } from '../store/store'
import { defaultSettings, type Vec3Deg } from '../types'

const PRESETS = [
  { value: 'static', label: 'Static still' },
  { value: 'spin-y', label: 'Spin Y' },
  { value: 'spin-x', label: 'Spin X' },
  { value: 'turntable', label: 'Turntable' },
  { value: 'slow-turn', label: 'Slow turn' },
  { value: 'wobble', label: 'Wobble' },
  { value: 'float', label: 'Floating wobble' },
  { value: 'reveal', label: 'Reveal rotation' },
  { value: 'bounce-in', label: 'Bounce-in' },
] as const

function RotationRow({ label, value, onChange }: { label: string; value: Vec3Deg; onChange: (v: Vec3Deg) => void }) {
  return (
    <div className="control">
      <div className="control-head">
        <span className="control-label">{label} (x·y·z °)</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['x', 'y', 'z'] as const).map((axis) => (
          <NumField key={axis} value={value[axis]} min={-720} max={720} step={15}
            onChange={(n) => onChange({ ...value, [axis]: n })} />
        ))}
      </div>
    </div>
  )
}

export function AnimationControls() {
  const a = useStore((s) => s.settings.animation)
  const playing = useStore((s) => s.playing)

  return (
    <div className="side-rows">
      <Select label="Preset" value={a.preset} options={[...PRESETS]}
        onChange={(v) => setSlice('animation', { preset: v })} />

      <div className="export-btns">
        <button type="button" className="btn btn--sm"
          onClick={() => store.setTransient({ playing: !playing })}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="btn btn--sm"
          onClick={() => setSlice('animation', defaultSettings().animation)}>
          Reset animation
        </button>
      </div>

      <div className="inline-field">
        <span className="control-label">Duration (s)</span>
        <NumField value={a.duration} min={0.2} max={30} step={0.5}
          onChange={(v) => setSlice('animation', { duration: v })} />
      </div>
      <div className="inline-field">
        <span className="control-label">FPS</span>
        <NumField value={a.fps} min={1} max={60} step={1}
          onChange={(v) => setSlice('animation', { fps: Math.round(v) })} />
      </div>

      <Toggle label="Loop" checked={a.loop} onChange={(v) => setSlice('animation', { loop: v })} />
      <Slider label="Speed / turns" value={a.speed} min={0.25} max={4} step={0.25} unit="×"
        onChange={(v) => setSlice('animation', { speed: v })} />
      <Toggle label="Reverse direction" checked={a.direction === -1}
        onChange={(v) => setSlice('animation', { direction: v ? -1 : 1 })} />
      <Select label="Easing" value={a.easing}
        options={[
          { value: 'linear', label: 'Linear' },
          { value: 'ease-in', label: 'Ease in' },
          { value: 'ease-out', label: 'Ease out' },
          { value: 'ease-in-out', label: 'Ease in out' },
        ]}
        onChange={(v) => setSlice('animation', { easing: v })} />

      <RotationRow label="Start rotation" value={a.startRotation}
        onChange={(v) => setSlice('animation', { startRotation: v })} />
      <RotationRow label="End rotation" value={a.endRotation}
        onChange={(v) => setSlice('animation', { endRotation: v })} />
      <p className="export-note">
        End rotation drives the <b>Reveal</b> preset. Start rotation offsets every preset.
      </p>
    </div>
  )
}
