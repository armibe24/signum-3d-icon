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
    .replace(/([a-zA-Z])(\d+)$/g, '$1-$2') // Undo2 → undo-2
    .toLowerCase()
}

/** hyphen-insensitive key so "grid-3x3", "grid3x3" etc. all resolve */
function flat(id: string): string {
  return id.replace(/-/g, '').toLowerCase()
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

const byId = new Map(catalog.map((e) => [flat(e.id), e]))

export function allIcons(): IconEntry[] {
  return catalog
}

/**
 * Search the FULL catalog (all bundled lucide icons, not just the visible
 * page). Terms are matched loosely: "arrowup", "arrow up" and "arrow-up"
 * all hit "arrow-up". Exact-prefix matches sort first.
 */
export function searchIcons(query: string): IconEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return catalog
  const terms = q.split(/\s+/).map((t) => t.replace(/-/g, ''))
  const matches = catalog.filter((e) => {
    const flat = e.id.replace(/-/g, '')
    return terms.every((t) => flat.includes(t))
  })
  const first = terms[0]
  return matches.sort((a, b) => {
    const ap = a.id.replace(/-/g, '').startsWith(first) ? 0 : 1
    const bp = b.id.replace(/-/g, '').startsWith(first) ? 0 : 1
    return ap - bp || a.id.localeCompare(b.id)
  })
}

export function hasIcon(id: string): boolean {
  return byId.has(flat(id))
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
export function lucideSvg(
  id: string,
  stroke = 'currentColor',
  opts?: { size?: number; strokeWidth?: number },
): string | null {
  const entry = byId.get(flat(id))
  if (!entry) return null
  const node = (icons as unknown as Record<string, AnyIconNode>)[entry.key]
  if (!node) return null
  const children = (node[2] ?? []) as AnyIconNode[]
  const body = children.map(serializeNode).join('')
  const size = opts?.size ?? 24
  const sw = opts?.strokeWidth ?? 2
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" ` +
    `fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  )
}
