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
