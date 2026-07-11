/* ============================================================
   Vendors the bundled icon libraries into compact JSON files at
   src/icons/data/ (committed, so the app builds without these
   devDependencies installed). Re-run after updating the icon
   packages:  node scripts/build-icon-data.mjs

   Included libraries and why they're safe to embed in a
   closed-source, commercially sold product:
   - Tabler Icons   — MIT
   - Phosphor Icons — MIT
   - Remix Icon     — Apache-2.0
   (Hugeicons was evaluated and EXCLUDED: its license forbids
   redistributing the icon source files "as stock or within a
   tool", which is exactly what an icon-picker app does.)

   Format per file: { "name": ["<svg body>", "tag tag …"], … }
   ============================================================ */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const NM = path.join(ROOT, 'node_modules')
const OUT = path.join(ROOT, 'src', 'icons', 'data')
fs.mkdirSync(OUT, { recursive: true })

/** inner markup of an svg file, whitespace-collapsed */
function svgBody(file) {
  const text = fs.readFileSync(file, 'utf8')
  const m = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(text)
  if (!m) throw new Error(`no <svg> in ${file}`)
  return m[1].replace(/\s+/g, ' ').replace(/> </g, '><').trim()
}

const norm = (t) => String(t).toLowerCase().replace(/[\s-]+/g, '')

/* ---------------- Tabler (outline set) ---------------- */
{
  const dir = path.join(NM, '@tabler/icons/icons/outline')
  const meta = JSON.parse(fs.readFileSync(path.join(NM, '@tabler/icons/icons.json'), 'utf8'))
  const out = {}
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
    const name = f.replace(/\.svg$/, '')
    let body = svgBody(path.join(dir, f))
      // strip the invisible 24×24 placeholder path every tabler icon carries
      .replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/, '')
      .trim()
    const tags = (meta[name]?.tags ?? []).map(norm)
    const category = meta[name]?.category ? [norm(meta[name].category)] : []
    out[name] = [body, [...new Set([...tags, ...category])].join(' ')]
  }
  fs.writeFileSync(path.join(OUT, 'tabler.json'), JSON.stringify(out))
  fs.copyFileSync(path.join(NM, '@tabler/icons/LICENSE'), path.join(OUT, 'LICENSE-tabler.txt'))
  console.log('tabler:', Object.keys(out).length)
}

/* ---------------- Phosphor (regular weight) ---------------- */
{
  const dir = path.join(NM, '@phosphor-icons/core/assets/regular')
  const { icons: catalog } = await import(
    path.join(NM, '@phosphor-icons/core/dist/index.mjs')
  )
  const tagsByName = new Map(
    catalog.map((i) => [
      i.name,
      [...new Set([...(i.tags ?? []), ...(i.categories ?? [])])]
        .map(norm)
        .filter((t) => !t.includes('*'))
        .join(' '),
    ]),
  )
  const out = {}
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
    const name = f.replace(/\.svg$/, '')
    out[name] = [svgBody(path.join(dir, f)), tagsByName.get(name) ?? '']
  }
  fs.writeFileSync(path.join(OUT, 'phosphor.json'), JSON.stringify(out))
  fs.copyFileSync(path.join(NM, '@phosphor-icons/core/LICENSE'), path.join(OUT, 'LICENSE-phosphor.txt'))
  console.log('phosphor:', Object.keys(out).length)
}

/* ---------------- Remix Icon ---------------- */
{
  const base = path.join(NM, 'remixicon/icons')
  const out = {}
  for (const category of fs.readdirSync(base)) {
    const dir = path.join(base, category)
    if (!fs.statSync(dir).isDirectory()) continue
    const tag = norm(category)
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
      const name = f.replace(/\.svg$/, '')
      if (out[name]) continue
      out[name] = [svgBody(path.join(dir, f)), tag]
    }
  }
  fs.writeFileSync(path.join(OUT, 'remix.json'), JSON.stringify(out))
  fs.copyFileSync(path.join(NM, 'remixicon/License'), path.join(OUT, 'LICENSE-remixicon.txt'))
  console.log('remix:', Object.keys(out).length)
}

/* counts for static UI labels (tiny, imported eagerly) */
const counts = {}
for (const lib of ['tabler', 'phosphor', 'remix']) {
  counts[lib] = Object.keys(JSON.parse(fs.readFileSync(path.join(OUT, `${lib}.json`), 'utf8'))).length
}
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(counts))
console.log('meta:', counts)
