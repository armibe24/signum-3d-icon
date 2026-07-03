import { Section } from './common/Section'
import { IconBrowser } from './IconBrowser'
import { GeometryControls } from './GeometryControls'
import { MaterialControls } from './MaterialControls'
import { LightingControls } from './LightingControls'
import { BackgroundControls } from './BackgroundControls'
import { AnimationControls } from './AnimationControls'
import { ExportPanel } from './ExportPanel'
import { PresetControls } from './PresetControls'

export function Sidebar() {
  return (
    <aside className="sidebar">
      <Section id="icon" title="Icon" defaultOpen>
        <IconBrowser />
      </Section>
      <Section id="geometry" title="Geometry" defaultOpen>
        <GeometryControls />
      </Section>
      <Section id="material" title="Material" defaultOpen>
        <MaterialControls />
      </Section>
      <Section id="lighting" title="Lighting">
        <LightingControls />
      </Section>
      <Section id="background" title="Background">
        <BackgroundControls />
      </Section>
      <Section id="animation" title="Animation">
        <AnimationControls />
      </Section>
      <Section id="export" title="Export">
        <ExportPanel />
      </Section>
      <Section id="presets" title="Presets">
        <PresetControls />
      </Section>
    </aside>
  )
}
