/* Preload — runs with context isolation. The renderer is a plain web app;
   this bridge only tells it that it runs inside the desktop shell (the
   unsaved-changes close confirmation is a fully in-app dialog driven by
   beforeunload, so no IPC is needed for it). */

const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('signumShell', {
  isElectron: true,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
})
