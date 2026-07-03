/* ============================================================
   Lucide icon catalog — sourced from the `lucide` npm package
   (ISC licensed, bundled locally, no network / paid API).

   Each icon ships as an IconNode: a tree of [tag, attrs,
   children?] tuples. We serialize that back into standalone SVG
   markup both for grid previews and for the 3D pipeline.
   ============================================================ */

import { icons } from 'lucide'

type AnyIconNode = [string, Record<string, unknown>, AnyIconNode[]?] | [string, Record<string, unknown>]

export interface IconEntry {
  /** kebab-case id, e.g. "alarm-clock" */
  id: string
  /** PascalCase key in the lucide package */
  key: string
}

function toKebab(pascal: string): string {
  return pascal
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

// aliases (e.g. ArrowDownAZ / ArrowDownAz) collapse to the same kebab id —
// keep the first occurrence only
const seen = new Set<string>()
const catalog: IconEntry[] = []
for (const key of Object.keys(icons)) {
  const id = toKebab(key)
  if (seen.has(id)) continue
  seen.add(id)
  catalog.push({ id, key })
}
catalog.sort((a, b) => a.id.localeCompare(b.id))

const byId = new Map(catalog.map((e) => [e.id, e]))

export function allIcons(): IconEntry[] {
  return catalog
}

export function searchIcons(query: string): IconEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return catalog
  const terms = q.split(/\s+/)
  return catalog.filter((e) => terms.every((t) => e.id.includes(t)))
}

export function hasIcon(id: string): boolean {
  return byId.has(id)
}

function serializeNode(node: AnyIconNode): string {
  const [tag, attrs, children] = node
  const attrStr = Object.entries(attrs ?? {})
    .map(([k, v]) => `${k}="${String(v)}"`)
    .join(' ')
  const inner = (children ?? []).map(serializeNode).join('')
  return inner ? `<${tag} ${attrStr}>${inner}</${tag}>` : `<${tag} ${attrStr}/>`
}

/**
 * Build a standalone SVG string for a lucide icon. Each lucide icon is one
 * node: ["svg", attrs, children]. We serialize only the children into our own
 * <svg> wrapper so stroke color stays controllable. Stroke width stays at the
 * lucide default (2); the pipeline's own stroke-width control scales outlines
 * later, so previews and geometry share one source.
 */
export function lucideSvg(id: string, stroke = 'currentColor'): string | null {
  const entry = byId.get(id)
  if (!entry) return null
  const node = (icons as unknown as Record<string, AnyIconNode>)[entry.key]
  if (!node) return null
  const children = (node[2] ?? []) as AnyIconNode[]
  const body = children.map(serializeNode).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" ` +
    `fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  )
}
