/* ============================================================
   Lucide icon registry — the single source of truth for icon
   search and lookup, sourced from the `lucide` npm package (ISC
   licensed, bundled locally, no network / paid API).

   The searchable index is built ONCE at module load from the
   complete `icons` export — it is completely independent of what
   the browser grid currently renders, so search always covers
   every icon. Lookup is hyphen/case-insensitive.

   Each icon ships as an IconNode: ["svg", attrs, children]. We
   serialize that back into standalone SVG markup both for grid
   previews / UI chrome and for the 3D pipeline.
   ============================================================ */

import { icons } from 'lucide'
// Official lucide tag metadata (vendored from lucide-static, ISC) — the same
// data lucide.dev's search uses, so "money" finds dollar-sign, banknote, …
import tagsJson from './lucideTags.json'

const TAGS = tagsJson as Record<string, string[]>

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

// searchable text per icon: flattened id + flattened official tags
const searchText = new Map<string, string>()
{
  const tagsByFlat = new Map<string, string[]>()
  for (const [officialId, tags] of Object.entries(TAGS)) tagsByFlat.set(flat(officialId), tags)
  for (const e of catalog) {
    const tags = tagsByFlat.get(flat(e.id)) ?? []
    const flatTags = tags.map((t) => t.toLowerCase().replace(/[\s-]+/g, '')).join(' ')
    searchText.set(e.id, `${flat(e.id)} ${flatTags}`)
  }
}

// debug-safe sanity check: makes it obvious how many icons are indexed
// (the lucide `icons` export contains only icon data, so no filtering is
// needed — every key is a real icon or an alias of one)
if (import.meta.env.DEV) {
  console.info(`[signum] lucide registry: ${catalog.length} icons indexed for search`)
}

export function allIcons(): IconEntry[] {
  return catalog
}

/**
 * Search the FULL catalog — icon names AND the official lucide tags, like
 * the search on lucide.dev ("money" → dollar-sign, banknote, piggy-bank…).
 * Terms match loosely ("arrow up" ≙ "arrow-up"); every term must hit the
 * name or a tag. Name matches rank above tag-only matches, name prefixes
 * first of all.
 */
export function searchIcons(query: string): IconEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return catalog
  const terms = q.split(/\s+/).map((t) => t.replace(/-/g, ''))

  const scored: { entry: IconEntry; score: number }[] = []
  for (const e of catalog) {
    const flatId = flat(e.id)
    const text = searchText.get(e.id) ?? flatId
    let ok = true
    let score = 2 // tag-only match
    for (const t of terms) {
      if (!text.includes(t)) {
        ok = false
        break
      }
    }
    if (!ok) continue
    if (terms.every((t) => flatId.includes(t))) score = 1 // name match
    if (flatId.startsWith(terms[0])) score = 0 // name prefix
    scored.push({ entry: e, score })
  }
  return scored
    .sort((a, b) => a.score - b.score || a.entry.id.localeCompare(b.entry.id))
    .map((s) => s.entry)
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
