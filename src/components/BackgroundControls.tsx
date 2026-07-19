import { Select } from './common/Select'
import { ColorField } from './common/ColorField'
import { ImageField } from './common/ImageField'
import { Slider } from './common/Slider'
import { setSlice, store, useStore } from '../store/store'
import { imageFileToDataUrl } from '../utils/file'

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
          { value: 'image', label: 'Image' },
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

      {b.mode === 'image' && (
        <>
          <ImageField label="Backdrop image" value={b.image} name={b.imageName}
            accept="image/png,image/jpeg,image/webp" buttonText="Load image…"
            onPick={async (file) => {
              try {
                const image = await imageFileToDataUrl(file)
                setSlice('background', { image, imageName: file.name })
              } catch (e) {
                store.toast(e instanceof Error ? e.message : 'Could not load the image.', 'error')
              }
            }}
            onClear={() => setSlice('background', { image: '', imageName: '' })} />
          {b.image && (
            <>
              <Slider label="Zoom" value={b.imageScale} min={1} max={4} step={0.05} decimals={2}
                unit="×" onChange={(v) => setSlice('background', { imageScale: v })} />
              <Slider label="Horizontal" value={b.imageX} min={-1} max={1} step={0.01} decimals={2}
                onChange={(v) => setSlice('background', { imageX: v })} />
              <Slider label="Vertical" value={b.imageY} min={-1} max={1} step={0.01} decimals={2}
                onChange={(v) => setSlice('background', { imageY: v })} />
            </>
          )}
          <p className="export-note">
            The image is cover-cropped behind the object in the preview and in every export — it
            always fills the frame; zoom and position move it within the crop.
          </p>
        </>
      )}

      <p className="export-note">
        <b>Transparent</b> and <b>checkerboard</b> export with an alpha channel (PNG / PNG sequence /
        GIF). The checker pattern itself is preview-only and never exported.
      </p>
    </div>
  )
}
