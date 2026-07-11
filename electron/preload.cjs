/* Preload — runs with context isolation. Exposes the minimal bridge the
   web app needs from the desktop shell:
   - isElectron / versions: environment detection
   - setDirty: keeps the main process informed about unsaved changes so
     closing the window can warn first (a renderer-side beforeunload would
     block the close silently in Electron — no dialog is ever shown). */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('signumShell', {
  isElectron: true,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
  setDirty: (dirty) => ipcRenderer.send('signum:set-dirty', !!dirty),
})
