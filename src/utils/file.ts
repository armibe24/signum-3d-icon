/* File helpers — downloads and file-open dialogs. Object URLs are
   revoked after use to keep memory bounded. */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // revoke on the next tick so the click has consumed the URL
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    // cancel: resolves null when the window regains focus without a change
    input.oncancel = () => resolve(null)
    input.click()
  })
}

export function readFileText(file: File): Promise<string> {
  return file.text()
}

export function safeFileName(base: string): string {
  return base.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'icon'
}

/* ------------------------------------------------------------
   Image imports (backgrounds / textures / HDRIs). Everything is
   stored as a data URL so presets stay a single self-contained
   JSON file and the session autosave can restore it.
   ------------------------------------------------------------ */

/** hard cap so a preset/autosave can't balloon absurdly */
export const MAX_IMAGE_DATA_URL = 33_000_000 // ~24 MB of binary

/**
 * Read an LDR image file and return a data URL, downscaled so the longest
 * side is ≤ maxDim. PNG/WebP keep lossless/alpha encoding; everything else
 * re-encodes as JPEG (quality .9). Keeps memory + storage bounded without
 * visibly changing backdrops or textures.
 */
export async function imageFileToDataUrl(file: File, maxDim = 2048): Promise<string> {
  const original = await blobToDataUrl(file)
  const img = await loadImage(original)
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const losslessType = file.type === 'image/png' || file.type === 'image/webp'
  // small enough already and in a browser-native format → keep the bytes
  if (scale === 1 && (losslessType || file.type === 'image/jpeg') && original.length <= MAX_IMAGE_DATA_URL) {
    return original
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process the image.')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const out = losslessType ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9)
  if (out.length > MAX_IMAGE_DATA_URL) throw new Error('This image is too large — please use a smaller file.')
  return out
}

/** Read a binary file (e.g. a Radiance .hdr) verbatim as a data URL. */
export async function binaryFileToDataUrl(file: File): Promise<string> {
  const url = await blobToDataUrl(file)
  if (url.length > MAX_IMAGE_DATA_URL) {
    throw new Error('This file is too large (max ~24 MB) — use a smaller resolution.')
  }
  return url
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('The file could not be read.'))
    reader.readAsDataURL(blob)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('This file is not a readable image.'))
    img.src = src
  })
}
