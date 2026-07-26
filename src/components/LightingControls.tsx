import { Slider } from './common/Slider'
import { Select } from './common/Select'
import { Toggle } from './common/Toggle'
import { ImageField } from './common/ImageField'
import { BackgroundControls } from './BackgroundControls'
import { setSlice, store, useStore } from '../store/store'
import { LIGHTING_PRESETS } from '../engine/lights'
import { ENV_PRESET_OPTIONS } from '../engine/environments'
import { binaryFileToDataUrl, imageFileToDataUrl } from '../utils/file'
import type { LightingSettings } from '../types'

function edit(patch: Partial<LightingSettings>) {
  setSlice('lighting', { ...patch, preset: 'custom' })
}

export function LightingControls() {
  const l = useStore((s) => s.settings.lighting)

  return (
    <div className="side-rows">
      {/* studio environment (image-based lighting) */}
      <Select label="Environment" value={l.envPreset}
        options={ENV_PRESET_OPTIONS}
        onChange={(v) => setSlice('lighting', { envPreset: v })} />
      {l.envPreset === 'custom' && (
        <ImageField label="Custom environment" value={l.envMap} name={l.envMapName}
          accept=".hdr,.exr,image/png,image/jpeg,image/webp" buttonText="Load HDRI / image…"
          noPreview={l.envMapType !== 'ldr'}
          onPick={async (file) => {
            try {
              const envMapType = /\.hdr$/i.test(file.name) ? 'hdr' : /\.exr$/i.test(file.name) ? 'exr' : 'ldr'
              const envMap =
                envMapType === 'ldr' ? await imageFileToDataUrl(file) : await binaryFileToDataUrl(file)
              setSlice('lighting', { envMap, envMapName: file.name, envMapType })
            } catch (e) {
              store.toast(e instanceof Error ? e.message : 'Could not load the environment map.', 'error')
            }
          }}
          onClear={() => setSlice('lighting', { envMap: '', envMapName: '', envMapType: 'ldr' })} />
      )}
      <Slider label="Environment intensity" value={l.envIntensity} min={0} max={3} step={0.05}
        decimals={2} onChange={(v) => setSlice('lighting', { envIntensity: v })} />
      <Slider label="Environment rotation" value={l.envRotation} min={0} max={360} step={1} unit="°"
        onChange={(v) => setSlice('lighting', { envRotation: v })} />
      <Slider label="Reflection contrast" value={l.reflectionContrast} min={0.5} max={2} step={0.05}
        decimals={2} disabled={l.envPreset === 'custom'}
        onChange={(v) => setSlice('lighting', { reflectionContrast: v })} />
      <Slider label="Exposure" value={l.exposure} min={0.25} max={2.5} step={0.05} decimals={2}
        onChange={(v) => setSlice('lighting', { exposure: v })} />

      {/* light rig */}
      <Select label="Light rig" value={l.preset}
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

      {/* background (moved here from its own tab — same controls) */}
      <div className="side-heading side-heading--static" style={{ marginTop: 6 }}>Background</div>
      <Slider label="Background brightness" value={l.backgroundBrightness} min={0} max={2} step={0.05}
        decimals={2} onChange={(v) => setSlice('lighting', { backgroundBrightness: v })} />
      <BackgroundControls />
    </div>
  )
}
