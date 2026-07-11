/* ============================================================
   Icon section — searchable multi-library browser (lucide,
   Tabler, Phosphor, Remix Icon — all bundled locally with their
   licenses) plus custom SVG import via file picker; drag & drop
   lands on the viewport (see Viewport3D).
   ============================================================ */

import { useEffect, useMemo, useState } from 'react'
import {
  ICON_LIBRARIES,
  TOTAL_ICON_COUNT,
  ensureLibraries,
  iconSvg,
  searchRegistry,
  type LibraryFilter,
} from '../icons/registry'
import { setSlice, store, useStore } from '../store/store'
import { pickFile, readFileText } from '../utils/file'
import { Icon } from './common/Icon'
import { Select } from './common/Select'
import { FontSelect } from './common/FontSelect'
import {
  TEXT_FONTS,
  listSystemFonts,
  systemFontsAvailable,
  type SystemFontEntry,
} from '../text/textToSvg'
import type { TextFontId } from '../types'

/** page size — search always runs over the FULL catalog, this only
    limits how many previews are mounted at once */
const GRID_PAGE = 144

export async function importSvgFile(file: File): Promise<void> {
  if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') {
    store.toast('Only SVG files can be imported.', 'error')
    return
  }
  const text = await readFileText(file)
  if (!text.includes('<svg')) {
    store.toast('That file does not contain SVG markup.', 'error')
    return
  }
  setSlice('icon', { type: 'custom', name: file.name.replace(/\.svg$/i, ''), svg: text })
  store.toast(`Imported ${file.name}`)
}

function IconCell({ id, selected }: { id: string; selected: boolean }) {
  const svg = useMemo(() => iconSvg(id), [id])
  if (!svg) return null
  return (
    <button
      type="button"
      className={`icon-cell${selected ? ' selected' : ''}`}
      title={id}
      onClick={() => setSlice('icon', { type: 'lucide', name: id, svg: undefined })}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

export function IconBrowser() {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(GRID_PAGE)
  const [library, setLibrary] = useState<LibraryFilter>('all')
  // bumped when a lazy-loaded icon pack arrives, so results recompute
  const [loadedTick, setLoadedTick] = useState(0)
  const icon = useStore((s) => s.settings.icon)
  const warnings = useStore((s) => s.warnings)
  const [textDraft, setTextDraft] = useState(icon.type === 'text' ? (icon.text ?? '') : '')
  const [fontDraft, setFontDraft] = useState<TextFontId>(
    icon.type === 'text' ? (icon.fontId ?? 'dm-sans') : 'dm-sans',
  )
  const [systemFonts, setSystemFonts] = useState<SystemFontEntry[] | null>(null)

  const applyText = (text: string, fontId: TextFontId) => {
    const clean = text.trim()
    if (!clean) return
    setSlice('icon', {
      type: 'text',
      name: clean.replace(/\s+/g, ' ').slice(0, 24),
      text,
      fontId,
      svg: undefined,
    })
  }

  // lazily pull in the vendored packs for the active filter
  useEffect(() => {
    let alive = true
    ensureLibraries(library).then(() => {
      if (alive) setLoadedTick((t) => t + 1)
    })
    return () => {
      alive = false
    }
  }, [library])

  // search covers every loaded library (names + official tags)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const results = useMemo(() => searchRegistry(query, library), [query, library, loadedTick])
  useEffect(() => setLimit(GRID_PAGE), [query, library])
  const shown = results.slice(0, limit)

  return (
    <div className="side-rows">
      <div className="icon-search">
        <Icon name="search" size={12} strokeWidth={2.4} />
        <input
          placeholder={`Search ${TOTAL_ICON_COUNT.toLocaleString()} icons…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>

      <Select label="Library" value={library}
        options={[
          { value: 'all' as const, label: `All libraries (${TOTAL_ICON_COUNT.toLocaleString()})` },
          ...ICON_LIBRARIES.map((l) => ({ value: l.id as LibraryFilter, label: `${l.label} (${l.count.toLocaleString()})` })),
        ]}
        onChange={setLibrary} />

      {results.length === 0 ? (
        <div className="icon-empty">
          <Icon name="search-x" size={18} strokeWidth={1.8} />
          <span>
            No icon matches “{query.trim()}”.
            <br />
            Try a different term or import an SVG below.
          </span>
        </div>
      ) : (
        <div className="icon-grid">
          {shown.map((e) => (
            <IconCell key={e.id} id={e.id} selected={icon.type === 'lucide' && icon.name === e.id} />
          ))}
          {results.length > limit && (
            <button
              type="button"
              className="icon-more"
              onClick={() => setLimit(limit + GRID_PAGE * 2)}
            >
              Show more ({results.length - limit} left)
            </button>
          )}
        </div>
      )}

      <div className="icon-meta">
        <span>
          {query.trim()
            ? `${results.length.toLocaleString()} match${results.length === 1 ? '' : 'es'}`
            : `all ${results.length.toLocaleString()} searchable`}
        </span>
        <b>
          {icon.type === 'custom' ? `custom: ${icon.name}` : icon.type === 'text' ? `text: ${icon.name}` : icon.name}
        </b>
      </div>

      <div className="control" style={{ marginTop: 4 }}>
        <div className="control-head">
          <span className="control-label">3D text (local fonts)</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            className="colorfield-hexinput"
            style={{ letterSpacing: '.02em' }}
            placeholder="Type text to extrude…"
            value={textDraft}
            spellCheck={false}
            onChange={(e) => setTextDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyText(textDraft, fontDraft)
              e.stopPropagation()
            }}
          />
          <FontSelect
            value={fontDraft}
            options={[
              ...TEXT_FONTS.map((f) => ({
                value: f.id as string,
                label: f.label,
                family: f.cssFamily,
                bold: f.bold,
              })),
              ...(systemFonts ?? []).map((f) => ({
                value: f.id,
                label: f.style === 'Regular' ? f.family : `${f.family} — ${f.style}`,
                family: f.family,
                bold: /bold/i.test(f.style),
              })),
              // keep a restored system font selectable before the list is loaded
              ...(fontDraft.startsWith('system:') && !systemFonts
                ? [
                    {
                      value: fontDraft,
                      label: fontDraft.slice('system:'.length),
                      family: fontDraft.slice('system:'.length),
                    },
                  ]
                : []),
            ]}
            onChange={(v) => {
              setFontDraft(v)
              if (icon.type === 'text' && textDraft.trim()) applyText(textDraft, v)
            }}
          />
          {systemFontsAvailable() && !systemFonts && (
            <button
              type="button"
              className="btn btn--sm"
              style={{ justifyContent: 'center' }}
              onClick={async () => {
                try {
                  setSystemFonts(await listSystemFonts())
                } catch (e) {
                  store.toast(e instanceof Error ? e.message : 'Could not list system fonts.', 'error')
                }
              }}
            >
              <Icon name="folder-search" size={12} strokeWidth={2.2} />
              Show system fonts…
            </button>
          )}
          <button
            type="button"
            className="btn btn--sm"
            style={{ justifyContent: 'center' }}
            disabled={!textDraft.trim()}
            onClick={() => applyText(textDraft, fontDraft)}
          >
            <Icon name="type" size={12} strokeWidth={2.2} />
            Use text
          </button>
        </div>
      </div>

      <div className="import-btns">
        <button
          type="button"
          className="btn btn--sm"
          onClick={async () => {
            const file = await pickFile('.svg,image/svg+xml')
            if (file) await importSvgFile(file)
          }}
        >
          Import custom SVG
        </button>
      </div>
      <p className="import-meta">
        Drag &amp; drop an <b>.svg</b> onto the viewport also works. Strokes are outlined into solid
        shapes automatically.
      </p>

      {warnings.length > 0 && (
        <div className="warnbox">
          {warnings.map((w, i) => (
            <span key={i}>⚠ {w}</span>
          ))}
        </div>
      )}
    </div>
  )
}
