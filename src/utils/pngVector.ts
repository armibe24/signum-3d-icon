/* ============================================================
   PNG → vector tracing — fully local, no uploads.

   Pipeline: decode PNG (downscaled to a working resolution) →
   luminance+alpha mask at a threshold → contour extraction by
   directed edge chaining (walks pixel borders; outer loops and
   holes come out with opposite winding, so the nonzero fill
   rule reconstructs negative space) → drop noise specks →
   collinear + RDP simplification → SVG path for the existing
   custom-SVG geometry pipeline.
   ============================================================ */

export interface TraceOptions {
  /** luminance cut, 0..1 */
  threshold: number
  /** false: darker-than-threshold is solid; true: brighter is solid */
  invert: boolean
}

export type Ring = [number, number][]

const MAX_WORK_DIM = 512

/** decode + downscale a PNG file into ImageData (working resolution) */
export function loadPngImageData(file: File, maxDim = MAX_WORK_DIM): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return reject(new Error('Could not create a canvas context.'))
      ctx.drawImage(img, 0, 0, w, h)
      resolve(ctx.getImageData(0, 0, w, h))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('This file is not a readable PNG image.'))
    }
    img.src = url
  })
}

/** 1 = solid pixel. Transparency wins: alpha < 50% is never solid. */
export function buildMask(img: ImageData, o: TraceOptions): Uint8Array {
  const { data, width, height } = img
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const a = data[i * 4 + 3]
    if (a < 128) continue
    const lum = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255
    const solid = o.invert ? lum > o.threshold : lum < o.threshold
    if (solid) mask[i] = 1
  }
  return mask
}

/** suggest invert=true for bright artwork (e.g. white logo on transparent) */
export function suggestInvert(img: ImageData): boolean {
  const { data, width, height } = img
  let opaque = 0
  let bright = 0
  for (let i = 0; i < width * height; i++) {
    if (data[i * 4 + 3] < 128) continue
    opaque++
    const lum = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]
    if (lum > 140) bright++
  }
  if (!opaque) return false
  const hasAlpha = opaque < width * height * 0.98
  // mostly-bright artwork over transparency → the artwork IS the bright part
  return hasAlpha && bright / opaque > 0.55
}

/* ---------------- contour extraction ---------------- */

/**
 * Directed edge chaining: every border between a solid and an empty pixel
 * contributes one unit edge, oriented so loops walk clockwise around solid
 * regions (in y-down image space) and counter-clockwise around holes.
 */
export function traceContours(mask: Uint8Array, w: number, h: number): Ring[] {
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1
  // outgoing edges keyed by start point
  const out = new Map<number, [number, number][]>() // startKey -> list of end points
  const key = (x: number, y: number) => y * (w + 1) + x
  const addEdge = (x1: number, y1: number, x2: number, y2: number) => {
    const k = key(x1, y1)
    let list = out.get(k)
    if (!list) {
      list = []
      out.set(k, list)
    }
    list.push([x2, y2])
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 1) continue
      if (!solid(x, y - 1)) addEdge(x, y, x + 1, y) // top
      if (!solid(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1) // right
      if (!solid(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1) // bottom
      if (!solid(x - 1, y)) addEdge(x, y + 1, x, y) // left
    }
  }

  const rings: Ring[] = []
  for (const [startKey, ends] of out) {
    while (ends.length) {
      const sx = startKey % (w + 1)
      const sy = Math.floor(startKey / (w + 1))
      let cx = sx
      let cy = sy
      let [nx, ny] = ends.pop()!
      const ring: Ring = [[cx, cy]]
      // walk until back at the start
      while (nx !== sx || ny !== sy) {
        ring.push([nx, ny])
        const dirX = nx - cx
        const dirY = ny - cy
        cx = nx
        cy = ny
        const candidates = out.get(key(cx, cy))
        if (!candidates || candidates.length === 0) break // open chain (shouldn't happen)
        let pick = 0
        if (candidates.length > 1) {
          // prefer the tightest right turn to hug the current region and
          // keep loops from crossing at saddle corners
          const score = (ex: number, ey: number) => {
            const vx = ex - cx
            const vy = ey - cy
            const cross = dirX * vy - dirY * vx // >0 = right turn in y-down space
            const dot = dirX * vx + dirY * vy
            if (cross > 0) return 0
            if (cross === 0 && dot > 0) return 1
            return 2
          }
          let best = score(...candidates[0])
          for (let i = 1; i < candidates.length; i++) {
            const sc = score(...candidates[i])
            if (sc < best) {
              best = sc
              pick = i
            }
          }
        }
        ;[nx, ny] = candidates.splice(pick, 1)[0]
      }
      rings.push(ring)
    }
  }
  return rings
}

/* ---------------- cleanup ---------------- */

function ringArea(ring: Ring): number {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

function rdp(points: Ring, eps: number): Ring {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = points[a]
    const [bx, by] = points[b]
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    let maxD = -1
    let maxI = -1
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i]
      const d =
        len2 < 1e-12
          ? Math.hypot(px - ax, py - ay)
          : Math.abs(dx * (py - ay) - dy * (px - ax)) / Math.sqrt(len2)
      if (d > maxD) {
        maxD = d
        maxI = i
      }
    }
    if (maxD > eps) {
      keep[maxI] = 1
      stack.push([a, maxI], [maxI, b])
    }
  }
  return points.filter((_, i) => keep[i] === 1)
}

/** drop specks, then simplify without visibly changing the silhouette */
export function cleanRings(rings: Ring[], w: number, h: number): Ring[] {
  const minArea = Math.max(6, w * h * 0.00008)
  return rings
    .filter((r) => Math.abs(ringArea(r)) >= minArea)
    .map((r) => rdp(r, 0.75))
    .filter((r) => r.length >= 3)
}

/** rings → standalone SVG for the existing custom-SVG import pipeline */
export function ringsToSvg(rings: Ring[], w: number, h: number): string {
  const d = rings
    .map((r) => `M${r.map(([x, y]) => `${x} ${y}`).join('L')}Z`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><path d="${d}" fill="#000" fill-rule="nonzero"/></svg>`
}
