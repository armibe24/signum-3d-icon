import { Select } from './common/Select'
import { ColorField } from './common/ColorField'
import { setSlice, useStore } from '../store/store'

export function BackgroundControls() {
  const b = useStore((s) => s.settings.background)

  return (
    <div className="side-rows">
      <Select label="Mode" value={b.mode}
        options={[
          { value: 'transparent', label: 'Transparent' },
          { value: 'checkerboard', label: 'Checkerboard preview' },
          { value: 'solid', label: 'Solid color' },
          { value: 'gradient', label: 'Gradient' },
          { value: 'studio', label: 'Studio backdrop' },
        ]}
        onChange={(v) => setSlice('background', { mode: v })} />

      {(b.mode === 'solid' || b.mode === 'gradient') && (
        <ColorField label={b.mode === 'gradient' ? 'Top color' : 'Background color'} value={b.color}
          onChange={(c) => setSlice('background', { color: c })} />
      )}
      {b.mode === 'gradient' && (
        <ColorField label="Bottom color" value={b.color2}
          onChange={(c) => setSlice('background', { color2: c })} />
      )}

      <p className="export-note">
        <b>Transparent</b> and <b>checkerboard</b> export with an alpha channel (PNG / PNG sequence /
        GIF). The checker pattern itself is preview-only and never exported.
      </p>
    </div>
  )
}
