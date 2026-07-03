/* ============================================================
   Icon section — searchable lucide browser (grid previews built
   from the bundled icon data) plus custom SVG import via file
   picker; drag & drop lands on the viewport (see Viewport3D).
   ============================================================ */

import { useEffect, useMemo, useState } from 'react'
import { searchIcons, lucideSvg } from '../icons/lucide'
import { setSlice, store, useStore } from '../store/store'
import { pickFile, readFileText } from '../utils/file'
import { Icon } from './common/Icon'

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
  const svg = useMemo(() => lucideSvg(id), [id])
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
  const icon = useStore((s) => s.settings.icon)
  const warnings = useStore((s) => s.warnings)

  // search covers the whole bundled lucide set (~1,500 icons)
  const results = useMemo(() => searchIcons(query), [query])
  useEffect(() => setLimit(GRID_PAGE), [query])
  const shown = results.slice(0, limit)

  return (
    <div className="side-rows">
      <div className="icon-search">
        <Icon name="search" size={12} strokeWidth={2.4} />
        <input
          placeholder={`Search ${searchIcons('').length} lucide icons…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>

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
          {results.length > shown.length ? `${shown.length} of ${results.length}` : `${results.length}`} icons
        </span>
        <b>{icon.type === 'custom' ? `custom: ${icon.name}` : icon.name}</b>
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
