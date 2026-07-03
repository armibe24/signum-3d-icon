import { Slider } from './common/Slider'
import { Select } from './common/Select'
import { Toggle } from './common/Toggle'
import { setSlice, useStore } from '../store/store'
import { defaultSettings } from '../types'
import { sceneManager } from '../engine/SceneManager'

export function GeometryControls() {
  const g = useStore((s) => s.settings.geometry)

  return (
    <div className="side-rows">
      <Slider label="Stroke width" value={g.strokeWidth} min={0.2} max={4} step={0.05} unit="×"
        onChange={(v) => setSlice('geometry', { strokeWidth: v })} />
      <Slider label="Extrude depth" value={g.extrudeDepth} min={1} max={60} step={0.5} decimals={1}
        onChange={(v) => setSlice('geometry', { extrudeDepth: v })} />
      <Slider label="Bevel amount" value={g.bevelAmount} min={0} max={10} step={0.1} decimals={1}
        onChange={(v) => setSlice('geometry', { bevelAmount: v })} />
      <Slider label="Bevel segments" value={g.bevelSegments} min={1} max={12} step={1}
        disabled={g.bevelStyle === 'hard' || g.bevelAmount === 0}
        onChange={(v) => setSlice('geometry', { bevelSegments: v })} />
      <Select label="Bevel style" value={g.bevelStyle}
        options={[
          { value: 'rounded', label: 'Rounded bevel' },
          { value: 'hard', label: 'Hard bevel' },
        ]}
        onChange={(v) => setSlice('geometry', { bevelStyle: v })} />
      <Select label="Shape combine" value={g.combine}
        options={[
          { value: 'union', label: 'Union into one solid' },
          { value: 'separate', label: 'Keep parts separate' },
        ]}
        onChange={(v) => setSlice('geometry', { combine: v })} />
      <Select label="Quality" value={g.quality}
        options={[
          { value: 'fast', label: 'Fast preview' },
          { value: 'balanced', label: 'Balanced' },
          { value: 'high', label: 'High quality' },
        ]}
        onChange={(v) => setSlice('geometry', { quality: v })} />
      <Slider label="Object scale" value={g.scale} min={0.2} max={3} step={0.05} unit="×"
        onChange={(v) => setSlice('geometry', { scale: v })} />
      <Toggle label="Normalize icon size" checked={g.normalizeSize}
        onChange={(v) => setSlice('geometry', { normalizeSize: v })} />
      <div className="export-btns">
        <button type="button" className="btn btn--sm" onClick={() => sceneManager.fitCamera()}>
          Center view
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => setSlice('geometry', defaultSettings().geometry)}
        >
          Reset geometry
        </button>
      </div>
    </div>
  )
}
