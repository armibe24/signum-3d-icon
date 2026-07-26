/* Color conversions for the custom picker (hex ↔ RGB ↔ HSV).
   HSV is the picker's working space so hue stays stable while
   saturation/value hit their extremes. */

export interface RGB {
  r: number
  g: number
  b: number
}

export interface HSV {
  /** 0–360 */
  h: number
  /** 0–1 */
  s: number
  /** 0–1 */
  v: number
}

export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }: RGB): string {
  const to = (v: number) =>
    Math.round(Math.min(Math.max(v, 0), 255))
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let rn = 0
  let gn = 0
  let bn = 0
  if (hp < 1) [rn, gn, bn] = [c, x, 0]
  else if (hp < 2) [rn, gn, bn] = [x, c, 0]
  else if (hp < 3) [rn, gn, bn] = [0, c, x]
  else if (hp < 4) [rn, gn, bn] = [0, x, c]
  else if (hp < 5) [rn, gn, bn] = [x, 0, c]
  else [rn, gn, bn] = [c, 0, x]
  const m = v - c
  return { r: (rn + m) * 255, g: (gn + m) * 255, b: (bn + m) * 255 }
}
