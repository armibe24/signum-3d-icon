import { Select } from './common/Select'
import { NumField } from './common/NumField'
import { Toggle } from './common/Toggle'
import { Icon } from './common/Icon'
import { setSlice, useStore } from '../store/store'
import { exportAnimation, exportStill } from '../utils/export/exporter'
import { store } from '../store/store'
import type { SizePresetId } from '../types'

const SIZE_MAP: Record<Exclude<SizePresetId, 'custom'>, number> = { '512': 512, '1024': 1024, '2048': 2048 }

const FORMAT_NOTES: Record<string, string> = {
  'png-seq': 'PNG sequence (ZIP) — full 8-bit transparency, most reliable.',
  gif: 'GIF — 1-bit transparency (hard pixel edges), colors quantized to 256. Dithering smooths gradient banding with a fine, frame-stable pixel pattern.',
  mp4: 'MP4 (H.264 via WebCodecs) — no alpha; transparent backgrounds are baked over the studio backdrop.',
  webm: 'WebM (VP9) — no alpha in Chrome’s encoder; transparent backgrounds are baked over the studio backdrop.',
}

export function ExportPanel() {
  const ex = useStore((s) => s.settings.export)
  const job = useStore((s) => s.exportJob)

  const applySize = (preset: SizePresetId) => {
    if (preset === 'custom') setSlice('export', { sizePreset: preset })
    else setSlice('export', { sizePreset: preset, width: SIZE_MAP[preset], height: SIZE_MAP[preset] })
  }

  return (
    <div className="side-rows">
      <Select label="Size" value={ex.sizePreset}
        options={[
          { value: '512', label: '512 × 512' },
          { value: '1024', label: '1024 × 1024' },
          { value: '2048', label: '2048 × 2048' },
          { value: 'custom', label: 'Custom…' },
        ]}
        onChange={applySize} />

      {ex.sizePreset === 'custom' && (
        <div className="inline-field">
          <span className="control-label">W × H</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <NumField value={ex.width} min={16} max={4096} step={64}
              onChange={(v) => setSlice('export', { width: Math.round(v) })} />
            <NumField value={ex.height} min={16} max={4096} step={64}
              onChange={(v) => setSlice('export', { height: Math.round(v) })} />
          </div>
        </div>
      )}

      <Select label="Still format" value={ex.stillFormat}
        options={[
          { value: 'png', label: 'PNG (alpha)' },
          { value: 'jpg', label: 'JPG' },
          { value: 'webp', label: 'WebP' },
        ]}
        onChange={(v) => setSlice('export', { stillFormat: v })} />

      <Select label="Animation format" value={ex.animFormat}
        options={[
          { value: 'png-seq', label: 'PNG sequence (ZIP)' },
          { value: 'gif', label: 'GIF' },
          { value: 'mp4', label: 'MP4 (H.264)' },
          { value: 'webm', label: 'WebM (VP9)' },
        ]}
        onChange={(v) => setSlice('export', { animFormat: v })} />
      {ex.animFormat === 'gif' && (
        <Toggle label="Dithering" checked={ex.gifDither}
          onChange={(v) => setSlice('export', { gifDither: v })} />
      )}
      <p className="export-note">{FORMAT_NOTES[ex.animFormat]}</p>
      <p className="export-note">
        MOV with alpha is not possible with browser-only encoders — use the PNG sequence and convert
        locally (e.g. ffmpeg → ProRes 4444).
      </p>

      {job ? (
        <div className="export-progress">
          <div className="export-progress-head">
            <span className="export-progress-label">
              <span className="pulse" />
              {job.label} {Math.round(job.progress * 100)}%
            </span>
            <button type="button" className="iconbtn" title="Cancel export" onClick={job.cancel}>
              <Icon name="x" size={12} strokeWidth={2.2} />
            </button>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${job.progress * 100}%` }} />
          </div>
        </div>
      ) : (
        <div className="export-btns">
          <button type="button" className="btn btn--sm btn--teal"
            onClick={() => exportStill(store.get().settings).catch((e) => store.toast(String(e), 'error'))}>
            <Icon name="image-down" size={12} strokeWidth={2.2} />
            Still
          </button>
          <button type="button" className="btn btn--sm btn--cyan"
            onClick={() => exportAnimation(store.get().settings)}>
            <Icon name="clapperboard" size={12} strokeWidth={2.2} />
            Animation
          </button>
        </div>
      )}
    </div>
  )
}
