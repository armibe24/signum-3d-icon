import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps built asset paths relative, so the same build can later be
// loaded from the filesystem inside an Electron shell without changes.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // inline every small asset — most importantly the local fonts (woff2 UI
    // fonts referenced from CSS, TTFs for 3D text). As data URLs they load
    // under ANY protocol (http, app://, file://), which is what makes the
    // Electron shell font-proof; separate font *files* are exactly what
    // broke there. All fonts are ≤116 KB, so the size cost is small.
    assetsInlineLimit: 256 * 1024,
  },
})
