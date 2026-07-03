import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps built asset paths relative, so the same build can later be
// loaded from the filesystem inside an Electron shell without changes.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: { target: 'es2022' },
})
