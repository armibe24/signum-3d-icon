/* ============================================================
   Electron main process for Signum 3D Icon Studio.

   The renderer is the unmodified Vite build in dist/. It is
   served through a privileged custom scheme (app://) instead of
   file:// because the app relies on capabilities Chromium denies
   to file:// pages: module Web Workers (geometry + GIF encoding)
   and fetch() of bundled assets (the 3D-text TTF fonts). The
   app:// scheme behaves like a proper secure origin, so the
   exact same bundle that works in the browser works here.

   Security: context isolation on, node integration off, sandbox
   on, navigation & window.open locked down. The renderer needs
   no Node APIs — everything (geometry, export encoders) runs in
   web workers / WebCodecs, exactly like in the browser.
   ============================================================ */

const { app, BrowserWindow, protocol, shell, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const DIST = path.join(__dirname, '..', 'dist')
const APP_ORIGIN = 'app://bundle'

// must run before app.ready — grants app:// standard-scheme semantics
// (workers, fetch, streams) that plain custom protocols don't get.
// corsEnabled matters for FONTS: @font-face requests are always made in
// CORS mode per spec, and without it they can fail on custom schemes.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportsFetchAPI: true,
      stream: true,
      codeCache: true,
      corsEnabled: true,
    },
  },
])

// explicit MIME types — a wrong/missing Content-Type is the classic reason
// fonts and module scripts silently fail on custom protocols
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain',
}

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url)
    let rel = decodeURIComponent(url.pathname)
    if (rel === '/' || rel === '') rel = '/index.html'
    const file = path.normalize(path.join(DIST, rel))
    // never serve anything outside dist/
    if (!file.startsWith(DIST + path.sep) && file !== path.join(DIST, 'index.html')) {
      return new Response('Not found', { status: 404 })
    }
    try {
      const data = await fs.promises.readFile(file)
      return new Response(data, {
        headers: {
          'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
          // fonts are fetched in CORS mode — answer it explicitly
          'Access-Control-Allow-Origin': '*',
        },
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#071219', // matches the app shell — no white flash
    // window icon (Linux/Windows taskbar); installer icons come from
    // branding/ via electron-builder's buildResources
    icon: path.join(__dirname, '..', 'branding', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // exports: show a save dialog instead of silently dropping files in ~/Downloads
  win.webContents.session.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: 'Save export', defaultPath: item.getFilename() })
  })

  // the app is single-page and local-only — block navigation and popups
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN) && !url.startsWith(devServerUrl())) event.preventDefault()
  })

  const dev = devServerUrl()
  if (dev) {
    win.loadURL(dev)
  } else {
    win.loadURL(`${APP_ORIGIN}/index.html`).catch(() => {
      dialog.showErrorBox(
        'Missing build',
        'dist/ was not found. Run "npm run build" first (or use "npm run electron:dev" against the Vite dev server).',
      )
      app.quit()
    })
  }
  return win
}

/** `npm run electron:dev` passes --dev-server=<url> to load Vite's HMR server */
function devServerUrl() {
  const arg = process.argv.find((a) => a.startsWith('--dev-server='))
  return arg ? arg.slice('--dev-server='.length) : ''
}

app.whenReady().then(() => {
  registerAppProtocol()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
