import { Slider } from './common/Slider'
import { Select } from './common/Select'
import { ColorField } from './common/ColorField'
import { ImageField } from './common/ImageField'
import { setSlice, store, useStore } from '../store/store'
import { MATERIAL_MODES, MATERIAL_PRESETS } from '../engine/materials'
import { imageFileToDataUrl } from '../utils/file'
import { defaultSettings, type MaterialSettings } from '../types'

/** any manual edit turns the preset chip to "custom" */
function edit(patch: Partial<MaterialSettings>) {
  setSlice('material', { ...patch, preset: 'custom' })
}

export function MaterialControls() {
  const m = useStore((s) => s.settings.material)
  const partCount = useStore((s) => s.partCount)

  /** set one part's color; untouched parts stay '' = follow the base color */
  const setPartColor = (index: number, hex: string) => {
    const next = Array.from(
      { length: Math.max(m.partColors.length, index + 1) },
      (_, j) => m.partColors[j] ?? '',
    )
    next[index] = hex
    edit({ partColors: next })
  }

  return (
    <div className="side-rows">
      <div className="control">
        <div className="control-head">
          <span className="control-label">Presets</span>
        </div>
        <div className="matpresets">
          {MATERIAL_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`matpreset${m.preset === p.id ? ' selected' : ''}`}
              onClick={() => setSlice('material', { ...p.values, preset: p.id })}
            >
              <span
                className="dot"
                style={{ ['--c' as string]: p.values.emissiveIntensity > 0 ? p.values.emissiveColor : p.values.color }}
              />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <Select label="Material mode" value={m.mode}
        options={MATERIAL_MODES.map((md) => ({ value: md.id, label: md.label }))}
        onChange={(v) => {
          const mode = MATERIAL_MODES.find((md) => md.id === v)!
          setSlice('material', { ...mode.values, mode: v, preset: 'custom' })
        }} />

      <ColorField label="Base color" value={m.color} onChange={(c) => edit({ color: c })} />

      {partCount > 1 && (
        <div className="control">
          <div className="control-head">
            <span className="control-label">Part colors — {partCount} parts</span>
          </div>
          <div className="side-rows" style={{ gap: 8 }}>
            {Array.from({ length: partCount }, (_, i) => (
              <ColorField
                key={i}
                label={`Part ${i + 1}${i === 0 ? ' (largest)' : ''}`}
                value={m.partColors[i] || m.color}
                onChange={(c) => setPartColor(i, c)}
              />
            ))}
            {m.partColors.some(Boolean) && (
              <button
                type="button"
                className="btn btn--sm"
                style={{ justifyContent: 'center' }}
                onClick={() => edit({ partColors: [] })}
              >
                Reset part colors
              </button>
            )}
          </div>
        </div>
      )}

      <ImageField label="Texture" value={m.textureMap} name={m.textureName}
        accept="image/png,image/jpeg,image/webp" buttonText="Load texture…"
        onPick={async (file) => {
          try {
            const textureMap = await imageFileToDataUrl(file)
            edit({ textureMap, textureName: file.name })
          } catch (e) {
            store.toast(e instanceof Error ? e.message : 'Could not load the texture.', 'error')
          }
        }}
        onClear={() => edit({ textureMap: '', textureName: '' })} />
      {m.textureMap && (
        <>
          <Select label="Texture placement" value={m.textureMapping}
            options={[
              { value: 'stretch' as const, label: 'Stretch to icon' },
              { value: 'aspect' as const, label: 'Keep image aspect' },
              { value: 'part' as const, label: 'Per part (each part 0–1)' },
            ]}
            onChange={(v) => edit({ textureMapping: v })} />
          <Slider label="Texture tiling" value={m.textureScale} min={0.25} max={8} step={0.25}
            decimals={2} onChange={(v) => edit({ textureScale: v })} />
        </>
      )}

      {m.mode === 'liquid' && (
        <>
          <Slider label="Liquid distortion" value={m.liquidAmount} min={0} max={2} step={0.05}
            decimals={2} onChange={(v) => edit({ liquidAmount: v })} />
          <Slider label="Distortion scale" value={m.liquidScale} min={0.5} max={8} step={0.1}
            decimals={1} onChange={(v) => edit({ liquidScale: v })} />
        </>
      )}

      <Slider label="Roughness" value={m.roughness} min={0} max={1} onChange={(v) => edit({ roughness: v })} />
      <Slider label="Metalness" value={m.metalness} min={0} max={1} onChange={(v) => edit({ metalness: v })} />
      <Slider label="Opacity" value={m.opacity} min={0.05} max={1} onChange={(v) => edit({ opacity: v })} />
      <Slider label="Clearcoat" value={m.clearcoat} min={0} max={1} onChange={(v) => edit({ clearcoat: v })} />
      <ColorField label="Emissive color" value={m.emissiveColor} onChange={(c) => edit({ emissiveColor: c })} />
      <Slider label="Emissive intensity" value={m.emissiveIntensity} min={0} max={8} step={0.05}
        onChange={(v) => edit({ emissiveIntensity: v })} />
      <Slider label="Environment" value={m.envIntensity} min={0} max={3} step={0.05}
        onChange={(v) => edit({ envIntensity: v })} />

      <button
        type="button"
        className="btn btn--sm"
        style={{ justifyContent: 'center' }}
        onClick={() => setSlice('material', defaultSettings().material)}
      >
        Reset material
      </button>
    </div>
  )
}
