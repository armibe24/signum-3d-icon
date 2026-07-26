/* ============================================================
   Sidebar — an icon rail (local lucide icons) on the left picks
   the active tab; each former collapsible section is now its own
   tab. All tabs stay mounted (hidden via CSS) so search queries,
   drafts and scroll positions survive tab switches.
   store.requestSection(id) — used by tests and deep links — also
   switches the active tab.
   ============================================================ */

import { IconBrowser } from './IconBrowser'
import { GeometryControls } from './GeometryControls'
import { MaterialControls } from './MaterialControls'
import { LightingControls } from './LightingControls'
import { AnimationControls } from './AnimationControls'
import { ExportPanel } from './ExportPanel'
import { Icon } from './common/Icon'
import { store, useStore } from '../store/store'
import type { ReactNode } from 'react'

const TABS: { id: string; title: string; icon: string; content: ReactNode }[] = [
  { id: 'icon', title: 'Icon', icon: 'shapes', content: <IconBrowser /> },
  { id: 'geometry', title: 'Geometry', icon: 'box', content: <GeometryControls /> },
  { id: 'material', title: 'Material', icon: 'palette', content: <MaterialControls /> },
  // background controls live inside the Lighting tab
  { id: 'lighting', title: 'Lighting', icon: 'lightbulb', content: <LightingControls /> },
  { id: 'animation', title: 'Animation', icon: 'film', content: <AnimationControls /> },
  { id: 'export', title: 'Export', icon: 'download', content: <ExportPanel /> },
]

export function Sidebar() {
  const active = useStore((s) => s.activeTab)

  return (
    <aside className="sidebar">
      <nav className="side-rail" aria-label="Sidebar sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rail-btn${t.id === active ? ' active' : ''}`}
            title={t.title}
            aria-label={t.title}
            onClick={() => store.requestSection(t.id)}
          >
            <Icon name={t.icon} size={15} strokeWidth={2} />
          </button>
        ))}
      </nav>
      <div className="side-panel">
        {TABS.map((t) => (
          <section
            key={t.id}
            className="side-section open"
            style={t.id === active ? undefined : { display: 'none' }}
          >
            <div className="side-heading side-heading--static">{t.title}</div>
            <div className="side-body">{t.content}</div>
          </section>
        ))}
      </div>
    </aside>
  )
}
