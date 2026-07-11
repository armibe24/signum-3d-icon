/* ============================================================
   Unified icon registry — lucide plus the vendored libraries
   (Tabler MIT, Phosphor MIT, Remix Icon Apache-2.0; license
   texts ship in ./data/). Hugeicons was evaluated and excluded:
   its license forbids redistributing icon source files inside a
   tool, which an icon-picker app inherently does.

   Icon ids are library-prefixed: "tabler:activity",
   "phosphor:acorn", "remix:home-line". Unprefixed ids stay
   lucide — every preset saved before this feature keeps working.

   The three vendored packs (~4 MB raw) are code-split and loaded
   on demand (`ensureLibraries`); lucide stays eager because the
   UI chrome uses it synchronously.
   ============================================================ */

import { allIcons as lucideAll, hasIcon as lucideHas, lucideSvg, searchIcons as lucideSearch } from './lucide'
import packCounts from './data/meta.json'

export type IconLibraryId = 'lucide' | 'tabler' | 'phosphor' | 'remix'
export type LibraryFilter = IconLibraryId | 'all'

export interface LibraryMeta {
  id: IconLibraryId
  label: string
  license: string
  count: number
}

export const ICON_LIBRARIES: LibraryMeta[] = [
  { id: 'lucide', label: 'Lucide', license: 'ISC', count: lucideAll().length },
  { id: 'tabler', label: 'Tabler', license: 'MIT', count: (packCounts as Record<string, number>).tabler },
  { id: 'phosphor', label: 'Phosphor', license: 'MIT', count: (packCounts as Record<string, number>).phosphor },
  { id: 'remix', label: 'Remix Icon', license: 'Apache-2.0', count: (packCounts as Record<string, number>).remix },
]

export const TOTAL_ICON_COUNT = ICON_LIBRARIES.reduce((n, l) => n + l.count, 0)

export interface RegistryEntry {
  /** full id, library-prefixed except for lucide (e.g. "tabler:activity") */
  id: string
  /** bare icon name within its library */
  name: string
  lib: IconLibraryId
}

export function parseIconId(id: string): { lib: IconLibraryId; name: string } {
  const sep = id.indexOf(':')
  if (sep > 0) {
    const lib = id.slice(0, sep)
    if (lib === 'tabler' || lib === 'phosphor' || lib === 'remix') {
      return { lib, name: id.slice(sep + 1) }
    }
  }
  return { lib: 'lucide', name: id }
}

/* ------------------------------------------------------------------ */
/* pack loading (lazy, code-split)                                     */
/* ------------------------------------------------------------------ */

type PackId = Exclude<IconLibraryId, 'lucide'>
/** name → [svg body, flattened tag text] */
type PackData = Record<string, [string, string]>

const packs = new Map<PackId, PackData>()
const packEntries = new Map<PackId, RegistryEntry[]>()
const packLoads = new Map<PackId, Promise<void>>()

function loadPack(lib: PackId): Promise<void> {
  let p = packLoads.get(lib)
  if (!p) {
    const importer =
      lib === 'tabler'
        ? import('./data/tabler.json')
        : lib === 'phosphor'
          ? import('./data/phosphor.json')
          : import('./data/remix.json')
    p = importer.then((mod) => {
      const data = (mod.default ?? mod) as unknown as PackData
      packs.set(lib, data)
      packEntries.set(
        lib,
        Object.keys(data)
          .sort()
          .map((name) => ({ id: `${lib}:${name}`, name, lib })),
      )
    })
    packLoads.set(lib, p)
  }
  return p
}

/** Resolve once every library in the filter is available. */
export function ensureLibraries(filter: LibraryFilter): Promise<void> {
  const libs: PackId[] =
    filter === 'all' ? ['tabler', 'phosphor', 'remix'] : filter === 'lucide' ? [] : [filter as PackId]
  return Promise.all(libs.map(loadPack)).then(() => undefined)
}

export function libraryLoaded(lib: IconLibraryId): boolean {
  return lib === 'lucide' || packs.has(lib as PackId)
}

/* ------------------------------------------------------------------ */
/* svg building                                                        */
/* ------------------------------------------------------------------ */

/**
 * Standalone SVG markup for any registry icon (sync; the icon's library
 * must be loaded — see ensureLibraries / resolveIconSvg). Tabler icons are
 * stroke-based like lucide; Phosphor and Remix are filled shapes, which the
 * SVG→3D pipeline handles natively.
 */
export function iconSvg(id: string, color = 'currentColor', opts?: { size?: number; strokeWidth?: number }): string | null {
  const { lib, name } = parseIconId(id)
  if (lib === 'lucide') return lucideSvg(name, color, opts)
  const body = packs.get(lib)?.[name]?.[0]
  if (!body) return null
  const size = opts?.size ?? 24
  if (lib === 'tabler') {
    const sw = opts?.strokeWidth ?? 2
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" ` +
      `fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
    )
  }
  const viewBox = lib === 'phosphor' ? '0 0 256 256' : '0 0 24 24'
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}" ` +
    `fill="${color}">${body}</svg>`
  )
}

/** Async lookup for the 3D pipeline — loads the library first if needed. */
export async function resolveIconSvg(id: string, color: string): Promise<string | null> {
  const { lib } = parseIconId(id)
  if (lib !== 'lucide') await loadPack(lib as PackId)
  return iconSvg(id, color)
}

/**
 * Preset validation: is this a plausible registry icon? Lucide is checked
 * exactly; prefixed ids are checked exactly when their pack is loaded and
 * accepted optimistically otherwise (the build shows a toast if the icon
 * turns out not to exist — better than silently discarding a preset).
 */
export function knownIcon(id: string): boolean {
  const { lib, name } = parseIconId(id)
  if (lib === 'lucide') return lucideHas(name)
  if (!/^[a-z0-9-]+$/.test(name)) return false
  const pack = packs.get(lib as PackId)
  return pack ? !!pack[name] : true
}

/* ------------------------------------------------------------------ */
/* search                                                              */
/* ------------------------------------------------------------------ */

const flat = (s: string) => s.replace(/-/g, '').toLowerCase()
const packSearchText = new Map<PackId, Map<string, string>>()

function searchTextFor(lib: PackId, name: string): string {
  let texts = packSearchText.get(lib)
  if (!texts) {
    texts = new Map()
    packSearchText.set(lib, texts)
  }
  let t = texts.get(name)
  if (t === undefined) {
    t = `${flat(name)} ${packs.get(lib)?.[name]?.[1] ?? ''}`
    texts.set(name, t)
  }
  return t
}

function searchPack(lib: PackId, query: string): RegistryEntry[] {
  const entries = packEntries.get(lib) ?? []
  if (!query) return entries
  const terms = query.split(/\s+/).map((t) => t.replace(/-/g, ''))
  const scored: { e: RegistryEntry; score: number }[] = []
  for (const e of entries) {
    const flatName = flat(e.name)
    const text = searchTextFor(lib, e.name)
    if (!terms.every((t) => text.includes(t))) continue
    let score = 2
    if (terms.every((t) => flatName.includes(t))) score = 1
    if (flatName.startsWith(terms[0])) score = 0
    scored.push({ e, score })
  }
  return scored.sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name)).map((s) => s.e)
}

/**
 * Search across libraries (name + official tags). Only libraries that are
 * already loaded contribute — callers ensureLibraries() first. With an
 * 'all' filter, results come grouped per library in registry order.
 */
export function searchRegistry(query: string, filter: LibraryFilter): RegistryEntry[] {
  const q = query.trim().toLowerCase()
  const out: RegistryEntry[] = []
  const want = (lib: IconLibraryId) => filter === 'all' || filter === lib
  if (want('lucide')) {
    for (const e of lucideSearch(q)) out.push({ id: e.id, name: e.id, lib: 'lucide' })
  }
  for (const lib of ['tabler', 'phosphor', 'remix'] as const) {
    if (want(lib) && packs.has(lib)) out.push(...searchPack(lib, q))
  }
  return out
}
