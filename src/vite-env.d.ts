/// <reference types="vite/client" />

declare module '*.ttf' {
  const src: string
  export default src
}

/** bridge exposed by electron/preload.cjs when running in the desktop shell */
interface Window {
  signumShell?: {
    isElectron: boolean
    versions?: { electron: string; chrome: string }
  }
}
