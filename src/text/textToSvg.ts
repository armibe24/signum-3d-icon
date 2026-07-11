/* ============================================================
   Text → SVG — turns a text string into filled SVG outlines so
   it can ride the exact same SVG→3D pipeline as imported icons.

   Fonts are the app's own families, bundled as local TTFs
   (src/assets/fonts3d, SIL OFL) and parsed with opentype.js —
   no network requests, no browser text-measurement quirks, and
   the identical result later inside an Electron shell. Glyph
   contours are emitted as one <path> with fill-rule "nonzero",
   which SVGLoader resolves into shapes with correct holes.
   ============================================================ */

import * as opentype from 'opentype.js'
import type { TextFontId } from '../types'
import dmSansRegular from '../assets/fonts3d/DMSans-Regular.ttf'
import dmSansBold from '../assets/fonts3d/DMSans-Bold.ttf'
import jbMonoRegular from '../assets/fonts3d/JetBrainsMono-Regular.ttf'
import jbMonoBold from '../assets/fonts3d/JetBrainsMono-Bold.ttf'

export interface TextFontDef {
  id: TextFontId
  label: string
  url: string
}

export const TEXT_FONTS: TextFontDef[] = [
  { id: 'dm-sans', label: 'DM Sans', url: dmSansRegular },
  { id: 'dm-sans-bold', label: 'DM Sans Bold', url: dmSansBold },
  { id: 'jetbrains-mono', label: 'JetBrains Mono', url: jbMonoRegular },
  { id: 'jetbrains-mono-bold', label: 'JetBrains Mono Bold', url: jbMonoBold },
]

const fontCache = new Map<TextFontId, Promise<opentype.Font>>()

/** decode a base64 data URL without fetch() — works under every protocol
    (http, Electron's app://, even file://), where fetching a font asset
    URL can be blocked */
function dataUrlToArrayBuffer(url: string): ArrayBuffer {
  const b64 = url.slice(url.indexOf(',') + 1)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

function loadFont(id: TextFontId): Promise<opentype.Font> {
  let cached = fontCache.get(id)
  if (!cached) {
    const def = TEXT_FONTS.find((f) => f.id === id) ?? TEXT_FONTS[0]
    // production builds inline the TTFs as data URLs (assetsInlineLimit) —
    // decode directly; the dev server still hands out plain asset URLs
    cached = def.url.startsWith('data:')
      ? Promise.resolve(opentype.parse(dataUrlToArrayBuffer(def.url)))
      : fetch(def.url)
          .then((r) => {
            if (!r.ok) throw new Error(`Font "${def.label}" could not be loaded.`)
            return r.arrayBuffer()
          })
          .then((buf) => opentype.parse(buf))
    fontCache.set(id, cached)
  }
  return cached
}

/**
 * Render `text` into standalone SVG markup with filled glyph outlines.
 * Supports multiple lines (\n) with a line height of 1.25em.
 */
export async function textToSvg(text: string, fontId: TextFontId): Promise<string> {
  const trimmed = text.replace(/\r/g, '')
  if (!trimmed.trim()) throw new Error('Enter some text first.')
  const font = await loadFont(fontId)

  const size = 100
  const lineHeight = size * 1.25
  const lines = trimmed.split('\n')

  const paths: string[] = []
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  lines.forEach((line, i) => {
    if (!line.trim()) return
    const path = font.getPath(line, 0, i * lineHeight, size, { kerning: true })
    const bb = path.getBoundingBox()
    if (bb.x1 < x1) x1 = bb.x1
    if (bb.y1 < y1) y1 = bb.y1
    if (bb.x2 > x2) x2 = bb.x2
    if (bb.y2 > y2) y2 = bb.y2
    paths.push(path.toPathData(3))
  })
  if (!paths.length || !isFinite(x1)) throw new Error('The text produced no visible glyphs.')

  const pad = size * 0.04
  const vb = `${(x1 - pad).toFixed(2)} ${(y1 - pad).toFixed(2)} ${(x2 - x1 + 2 * pad).toFixed(2)} ${(y2 - y1 + 2 * pad).toFixed(2)}`
  const body = paths.map((d) => `<path d="${d}" fill="#000" fill-rule="nonzero"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`
}
