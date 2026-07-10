/* Preload — runs with context isolation. The renderer is a plain web app
   and needs no Node APIs today; this file exists so capabilities can be
   exposed later through contextBridge without touching the renderer's
   security settings. */

const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('signumShell', {
  // lets the web app detect it runs inside the desktop shell
  isElectron: true,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
})
