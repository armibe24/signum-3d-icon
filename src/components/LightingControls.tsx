import { Slider } from './common/Slider'
import { Select } from './common/Select'
import { Toggle } from './common/Toggle'
import { setSlice, useStore } from '../store/store'
import { LIGHTING_PRESETS } from '../engine/lights'
import type { LightingSettings } from '../types'

function edit(patch: Partial<LightingSettings>) {
  setSlice('lighting', { ...patch, preset: 'custom' })
}

export function LightingControls() {
  const l = useStore((s) => s.settings.lighting)

  return (
    <div className="side-rows">
      <Select label="Preset" value={l.preset}
        options={[
          ...LIGHTING_PRESETS.map((p) => ({ value: p.id, label: p.label })),
          { value: 'custom' as const, label: 'Custom' },
        ]}
        onChange={(v) => {
          if (v === 'custom') return
          const preset = LIGHTING_PRESETS.find((p) => p.id === v)!
          setSlice('lighting', { ...preset.values, preset: v })
        }} />
      <Slider label="Ambient" value={l.ambient} min={0} max={3} step={0.05} onChange={(v) => edit({ ambient: v })} />
      <Slider label="Key light" value={l.key} min={0} max={8} step={0.1} decimals={1} onChange={(v) => edit({ key: v })} />
      <Slider label="Fill light" value={l.fill} min={0} max={8} step={0.1} decimals={1} onChange={(v) => edit({ fill: v })} />
      <Slider label="Rim light" value={l.rim} min={0} max={8} step={0.1} decimals={1} onChange={(v) => edit({ rim: v })} />
      <Slider label="Key azimuth" value={l.keyAzimuth} min={-180} max={180} step={1} unit="°"
        onChange={(v) => edit({ keyAzimuth: v })} />
      <Slider label="Key elevation" value={l.keyElevation} min={5} max={85} step={1} unit="°"
        onChange={(v) => edit({ keyElevation: v })} />
      <Toggle label="Floor shadow" checked={l.shadows} onChange={(v) => setSlice('lighting', { shadows: v })} />
      <Toggle label="Soft shadow" checked={l.softShadows} disabled={!l.shadows}
        onChange={(v) => setSlice('lighting', { softShadows: v })} />
    </div>
  )
}
