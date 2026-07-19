# Signum — 3D Icon Studio

A professional, browser-based 3D icon generator. Pick any [lucide](https://lucide.dev) icon (or
import your own SVG), and Signum outlines its strokes into solid filled shapes, boolean-unions them
into one clean object, extrudes it with configurable bevels, lets you style it with PBR materials
and studio lighting, animate it, and export stills and animations — all locally in the browser, no
backend, no paid APIs.

![stack](https://img.shields.io/badge/React%20%2B%20Vite%20%2B%20TypeScript%20%2B%20Three.js-0b7285)

## Run it

```bash
npm install
npm run dev        # → http://localhost:5173
```

Other scripts: `npm run build` (typecheck + production build to `dist/`), `npm run preview`,
`npm run typecheck`.

Tested in Google Chrome. The web app contains no Electron-specific code, but ships with a ready
desktop shell (see below): relative asset paths (`base: './'`), a `100%`-height layout chain
instead of `vh` units, and no server dependency.

## Desktop app (Electron)

The repo includes a complete Electron shell in `electron/`:

```bash
npm run electron:preview   # build the web app, then open it in the Electron shell
npm run electron:build     # build + package installers into release/ (electron-builder)
npm run dev                # …and in a second terminal:
npm run electron:dev       # Electron pointed at the Vite dev server (HMR)
```

**Branding**: everything lives in `branding/` — swap the files to rebrand. `signum.svg` is the
logo mark (its fixed fill is rewritten to `currentColor` at import, so the in-app logo follows
every theme via the `--logo-color` token); `signum.ico` is the favicon and Windows installer
icon (copied to `icon.ico` for electron-builder); `signum.png` is the source tile and
`icon.png` (512px, regenerated from it) feeds the Electron window icon plus the auto-generated
macOS `.icns`. electron-builder reads this folder as `buildResources`.

**Dialogs**: About, New Project, Load Preset, Save Preset (named), and the unsaved-changes /
Close Window confirmations are all custom in-app modals in the Sonitus structure — no native OS
dialogs. In the Electron shell the close confirmation works via `beforeunload`: the close is
blocked while dirty and the app's own themed dialog re-issues `window.close()` on confirm.

The shell serves the unmodified `dist/` bundle through a privileged custom scheme (`app://`)
instead of `file://` — required because the app uses module Web Workers (geometry + GIF encoding),
which Chromium denies to `file://` pages. The renderer runs fully sandboxed (context isolation on,
node integration off); exports open a native save dialog. Packaging targets are preconfigured in
`package.json → build` (Windows NSIS as a normal assisted installer — welcome page, install
location choice, shortcuts —, macOS DMG, Linux AppImage).

**Fonts in the desktop shell**: production builds inline every local font as data URLs
(`assetsInlineLimit` in `vite.config.ts` covers the woff2 UI fonts inside the CSS, and the 3D-text
TTFs are parsed straight from inlined data — no runtime `fetch()`), so fonts load under any
protocol, including `app://` and plain `file://`. The `app://` handler additionally serves correct
font MIME types and CORS headers (`@font-face` requests are always CORS-mode per spec).

## How the SVG → 3D pipeline works

Lucide icons are *stroke-based* — naive extrusion of their paths would produce broken tubes.
Signum instead runs a conversion pipeline:

1. **Parse** (`src/svg/parse.ts`, main thread — needs `DOMParser`): three.js `SVGLoader` resolves
   every element type (path, line, polyline, polygon, circle, ellipse, rect), transforms and style
   inheritance into sampled polylines (strokes) and polygons (fills). Unsupported content
   (`<text>`, `<image>`, gradients…) produces non-blocking warnings.
2. **Outline** (`src/svg/outline.ts`, in a Web Worker): each stroked polyline is simplified (RDP)
   and buffered into round-cap/round-join outline pieces — one rectangle per segment plus one
   circle per vertex. Robust against cusps and self-intersections by construction.
3. **Boolean union** (`src/svg/boolean.ts`, worker): the pieces of each element are unioned into a
   clean outline, then all elements are unioned into one solid (or kept as grouped parts — user
   choice). Built on `polygon-clipping`, isolated behind a small wrapper so the backend can be
   swapped. Three-stage fallback: one-shot sweep → incremental union skipping bad pieces → raw
   pieces, each stage reporting a warning instead of throwing. Broken geometry is never produced
   silently. A cleanup pass (`src/svg/clean.ts`) then strips union debris — collinear point
   chains, near-tangent stair-steps, dust and hairline sliver rings — so the extrusion gets
   smooth, minimal outlines (the fix for spiky/banded walls).
4. **Normalize** (`src/svg/normalize.ts`): y-flip to y-up, center on origin, rescale so every icon
   spans the same normalized size (so depth/bevel sliders behave consistently).
5. **Mesh building** (`src/geometry/mesh.ts`, main thread — replaces `THREE.ExtrudeGeometry`):
   ExtrudeGeometry bevels by moving contour vertices along corner bisectors with no
   self-intersection handling, which folds caps into overlapping planes at acute corners. Signum
   instead computes every bevel ring as a **robust polygon erosion** (boolean difference against a
   buffered boundary, in the worker) and assembles the solid from regions that are valid by
   construction: straight walls along the exact base outline (silhouette preserved), annular bevel
   bands triangulated between consecutive erosion levels, and caps from the deepest level. Every
   surface is emitted exactly once — no duplicate/coplanar faces, no z-fighting, no folds, no
   spikes; thin features simply receive lower rounded tops. Bevel styles: none / hard (45°
   chamfer) / rounded (1–8 segments); the amount is clamped to the shape's thinnest feature and
   reduced or disabled with a visible warning when the shape can't absorb it. Normals are assigned
   **analytically per surface group** (never one global `computeVertexNormals` over the soup):
   caps are always exactly flat, side walls use the 2D outline normal loop-smoothed by the shading
   threshold, and bevel bands use the true profile normal `n2d·cosθ + ẑ·sinθ` — which makes a
   rounded bevel G1-continuous with both the wall and the cap, so smoothing can never bleed across
   the wrong seams. Shading modes: flat (per-face), smooth, smooth-by-angle with threshold slider
   (low thresholds visibly facet the bevel). Separate parts get a microscopic depth jitter so
   coplanar caps never z-fight, and geometry that still comes out invalid is rejected with a
   warning instead of rendered.

Results are cached at both stages (LRU, `src/geometry/cache.ts`); rebuilds are debounced and
version-stamped so stale worker replies from fast slider drags are dropped. Material, lighting,
camera and background changes never trigger a geometry rebuild.

## Architecture

```
src/
  types/            all settings + polygon types (the preset/undo schema)
  store/store.ts    tiny useSyncExternalStore store + undo history (gesture-
                    aware: one slider drag = one undo entry)
  icons/lucide.ts   lucide catalog, search, SVG serialization
  svg/              parse → outline → boolean → normalize (pure data in/out)
  workers/          svgWorker (outline+union), gifWorker (gifenc encoding)
  geometry/         extrude, LRU caches, build orchestrator (debounce/cancel)
  engine/           SceneManager (renderer/camera/controls/loop), materials,
                    lights, background, animation evaluation (pure fn of time)
  utils/
    export/         export renderer (2nd offscreen WebGL context), stills,
                    mp4 / webm (WebCodecs via mediabunny),
                    gif (worker), png-sequence (fflate zip)
    presets.ts      JSON preset serialize + defensive validation
    file.ts         downloads / file pickers
  components/       TopBar, Viewport3D, Sidebar sections, Timeline, common
                    controls (Slider/Select/Toggle/NumField/ColorField/Section)
```

Key separations: the UI never touches three.js directly (it talks to `SceneManager`); SVG
processing is pure data-in/data-out and UI-free; export logic renders through its own offscreen
`WebGLRenderer` at exact target resolution, sharing the live scene but never the viewport canvas.
Animation is a pure function `evaluatePose(settings, time)` shared by preview, scrubbing and
export, so exported frames match the preview exactly and a keyframe timeline can slot in later.

## Implemented features

- **Viewport**: orbit/pan/zoom (damped), **camera pose presets** (3/4 studio · front · side ·
  top) in the toolbar, a **render frame** overlay showing the exact export crop
  (fixed render fov + aspect; the viewport widens around it, so exports match the frame at any
  window size), fit & reset camera, camera auto-rotate, grid toggle (viewport-only),
  transparent/checkerboard/solid/gradient/studio backgrounds, floor shadow with soft option
  (off by default for performance), processing indicator, responsive resize.
- **Icons**: searchable browser over **four bundled libraries (~11,500 icons)** with a library
  filter — Lucide (ISC), **Tabler** (MIT), **Phosphor** (MIT) and **Remix Icon** (Apache-2.0).
  All four licenses permit embedding in closed-source, commercially sold software; the license
  texts ship in `src/icons/data/`. (Hugeicons was evaluated and excluded: its license forbids
  redistributing icon source files "as stock or within a tool", which an icon-picker app does by
  nature.) The three vendored packs are generated by `scripts/build-icon-data.mjs`, code-split,
  and lazy-loaded; icon ids are library-prefixed (`tabler:activity`) with unprefixed ids staying
  lucide, so old presets keep working. **Tag-aware search** across all libraries ("money" finds
  dollar-sign, banknote, coins…); live grid previews, paged grid with "show more", empty state;
  custom SVG import via button or drag & drop; complexity/unsupported-feature warnings. All app
  UI icons come from the local lucide data (`src/components/common/Icon.tsx`) — no remote assets.
- **3D text**: type any text and extrude it through the same SVG→3D pipeline. Fonts: the app's
  own families bundled as local TTFs (`src/assets/fonts3d/`, SIL OFL) **plus every font installed
  on the machine** via the Local Font Access API (`queryLocalFonts`, Chromium/Electron — "Show
  system fonts…" in the text panel; the Electron shell grants exactly this permission). All fonts
  are parsed with opentype.js — no network. Multi-line supported; glyph holes (a/b/e/o…) resolve
  correctly; **letter spacing** (em) and a **curve quality** control (up to 80 subdivisions,
  default 32 — noticeably smoother glyph curves than the icon quality presets) are per-text
  settings, and contour corner-clusters are merged bevel-aware so micro-notches in font outlines
  (e.g. JetBrains Mono's "M") can't fold the bevel into twisted facets.
- **Typography**: DM Sans (UI) and JetBrains Mono (technical text) ship as local woff2 files in
  `src/assets/fonts/` with their OFL licenses — no external font requests.
- **Geometry**: stroke width, extrude depth, bevel style (none / hard / rounded) with
  amount/segments and automatic safety clamping, shading modes (flat / smooth / smooth-by-angle
  with threshold slider), union vs separate parts, fast/balanced/high quality (balanced by
  default), normalize size, object scale, reset.
- **Material**: 8 presets (black/silver/gold metal, white clay, soft plastic, neon glow, dark
  glossy, warm matte) + 8 modes (solid, clay, plastic, metal, chrome, soft metallic, glassy,
  emissive); base/emissive color, roughness, metalness, opacity, clearcoat, emissive intensity,
  environment intensity; image-based lighting from a procedural room environment. **Image
  textures**: load any image as the object's color texture with selectable **UV placement**
  (stretch to the icon, keep image aspect, or per-part 0–1 — all three UV sets are pre-generated
  on the mesh, so switching is rebuild-free via `texture.channel`), a tiling slider, multiplied
  with the base color; stored inside presets/autosave as data URLs.
  **Per-part
  colors**: when an icon consists of multiple disconnected parts (e.g. the three ellipsis dots,
  or every glyph of a 3D text), each part gets its own color field — parts are indexed largest
  first, unset parts follow the base color, and color changes never trigger a geometry rebuild.
- **Lighting**: studio / softbox / dramatic side / top presets; ambient, key, fill, rim
  intensities; key light azimuth/elevation; shadows + soft shadows; **custom HDRI** — load an
  equirectangular `.hdr` (Radiance), `.exr` (OpenEXR) or any LDR image as the image-based-
  lighting environment, used identically by the viewport and every export.
- **Backgrounds**: transparent, checkerboard preview, solid, gradient, studio backdrop, or a
  **loaded image** — cover-cropped behind the object at the viewport aspect and again at the
  exact export aspect, so exports never stretch the backdrop; zoom and horizontal/vertical
  position controls move the image within the crop (it always keeps filling the frame).
- **Animation**: static, spin X/Y, turntable, slow turn, wobble, floating wobble, reveal
  (start→end rotation), bounce-in; duration, FPS, loop, speed/turns, direction, easing,
  start/end rotation; play/pause (preview never autoplays); Sonitus-style timeline with
  transport cluster, frame stepping, scrubbing, frame counter and time readout.
- **Export**: PNG (alpha) / JPG / WebP stills at 512/1024/2048/custom; PNG sequence (ZIP, alpha),
  GIF (1-bit alpha, optional ordered dithering — frame-stable Bayer pattern that smooths the
  256-color gradient banding), MP4 (H.264 via WebCodecs), WebM (VP9); deterministic frame timing;
  progress bar + cancel; UI stays responsive during export.
- **Presets & project**: full-state JSON save/load with validation and clamping (icon, geometry,
  material, lighting, background, animation, camera, export settings); new/reset project.
- **Sidebar tabs**: a Sonitus-style icon rail (local lucide icons, glassy active state with a
  glowing edge indicator) next to the sidebar gives every section — Icon, Geometry, Material,
  Lighting, Background, Animation, Export — its own tab; tabs stay mounted, so searches and
  drafts survive switching. The font picker is a **searchable dropdown where every entry renders
  in its own typeface**. The About dialog lists the app license plus every third-party library,
  icon set and font with its license, Sonitus-style.
- **Unsaved-changes warnings**: New project and Load preset ask first when the project has
  unsaved adjustments (with a "Save preset" shortcut); closing the app warns too — natively in
  the browser (`beforeunload`) and via a proper dialog in the Electron shell.
- **Session autosave**: every adjustment is continuously saved to localStorage (validated on
  restore like a preset file), so a crash, reload or closed tab never loses work. The export
  pipeline additionally reuses one long-lived offscreen GL context and pauses the viewport
  while exporting, which removes the GPU-memory spikes that could crash the tab on export.
- **Undo/redo**: history for all parameter changes; slider drags collapse to single entries.
  Shortcuts: `Ctrl+Z`, `Ctrl+Shift+Z` / `Ctrl+Y`, `Space` play/pause, `F` fit, `0` reset camera —
  all suppressed while typing in inputs.

## Limitations & browser notes

- **Transparent video**: Chrome's WebCodecs encoders cannot write alpha. Therefore **MP4 and WebM
  exports are always opaque** — when the background is transparent/checkerboard they bake the
  studio backdrop instead (stated in the UI; nothing is faked). **MOV with alpha (ProRes 4444 /
  Animation) has no browser-only encoder**; the export module is structured so a future encoder can
  slot in. Recommended today: export the transparent **PNG sequence** and convert locally, e.g.
  `ffmpeg -framerate 30 -i frame_%04d.png -c:v prores_ks -pix_fmt yuva444p10le out.mov`.
- **GIF alpha is 1-bit**: fully transparent or fully opaque pixels (GIF format limit), so edges are
  hard; colors quantize to ≤256 per frame.
- **MP4 requires H.264 support** in the browser build (present in Google Chrome; absent in some
  Chromium builds — the app detects this and suggests WebM/GIF/PNG).
- Boolean union is robust but not infallible; on pathological SVGs the pipeline degrades to
  grouped/raw parts with a visible warning rather than failing.
- Very complex SVGs (hundreds of elements) work but can be slow at high quality; a warning is
  shown above ~600 elements / 400 KB.
- Fonts: the UI declares `DM Sans` / `JetBrains Mono` with system fallbacks; no font files are
  bundled and no network fonts are fetched.
- Version 1 has a timeline-lite (scrub/transport), not a keyframe editor; export range in/out
  points are not yet implemented (export always covers the full duration).
