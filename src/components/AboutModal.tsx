import { createPortal } from 'react-dom'
import { Icon } from './common/Icon'
import logoUrl from '../../branding/logo.svg'
import pkg from '../../package.json'

/* Rendered through a portal: the topbar's backdrop-filter makes it a
   containing block for position:fixed, which would trap the overlay
   inside the header strip (the original "bugged About" layout).
   Structure mirrors the Sonitus About modal: app header with logo +
   version, app license, third-party libraries / icons / fonts with
   their licenses, then the practical reference tables. */

const LIBRARIES: [name: string, license: string, usedFor: string][] = [
  ['react / react-dom', 'MIT', 'user interface'],
  ['three', 'MIT', '3D engine & rendering'],
  ['polygon-clipping', 'MIT', 'outline boolean union'],
  ['opentype.js', 'MIT', 'font glyph outlines'],
  ['gifenc', 'MIT', 'GIF encoding'],
  ['mp4-muxer / webm-muxer', 'MIT', 'video export containers'],
  ['fflate', 'MIT', 'PNG-sequence ZIP'],
  ['vite', 'MIT', 'build tooling'],
  ['typescript', 'Apache-2.0', 'build tooling'],
]

const ICON_SETS: [name: string, license: string][] = [
  ['Lucide', 'ISC'],
  ['Tabler Icons', 'MIT'],
  ['Phosphor Icons', 'MIT'],
  ['Remix Icon', 'Apache-2.0'],
]

export function AboutModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>About</h2>
          <button type="button" className="iconbtn" onClick={onClose} title="Close">
            <Icon name="x" size={13} strokeWidth={2.2} />
          </button>
        </div>
        <div className="modal-body">
          <div className="about-head">
            <img className="about-logo" src={logoUrl} alt="" width={44} height={44} />
            <div>
              <h3 className="about-name">Signum — 3D Icon Studio</h3>
              <p className="about-version">Version {pkg.version}</p>
            </div>
          </div>
          <p className="modal-note">
            A professional 3D icon studio. Convert stroke icons, SVGs and text into solid 3D forms,
            adjust geometry, materials, lighting and motion, then export stills or animations. All
            processing runs locally — no uploads, no external services.
          </p>

          <p className="modal-subhead">App license</p>
          <p className="modal-note">© {new Date().getFullYear()} Signum. All rights reserved.</p>

          <p className="modal-subhead">Third-party libraries</p>
          <table className="about-table">
            <thead>
              <tr><th>Library</th><th>License</th><th>Used for</th></tr>
            </thead>
            <tbody>
              {LIBRARIES.map(([name, license, usedFor]) => (
                <tr key={name}><td>{name}</td><td>{license}</td><td>{usedFor}</td></tr>
              ))}
            </tbody>
          </table>

          <p className="modal-subhead">Icons</p>
          <table className="about-table">
            <thead>
              <tr><th>Icon set</th><th>License</th></tr>
            </thead>
            <tbody>
              {ICON_SETS.map(([name, license]) => (
                <tr key={name}><td>{name}</td><td>{license}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="modal-note">
            All icon sets are bundled locally; their license texts ship with the app
            (<code>src/icons/data/</code>). UI icons come from the bundled Lucide data.
          </p>

          <p className="modal-subhead">Fonts</p>
          <p className="modal-note">
            DM Sans and JetBrains Mono — SIL Open Font License 1.1, bundled locally with their
            license texts. 3D text can additionally use fonts installed on this machine (they are
            never uploaded or redistributed).
          </p>

          <p className="modal-subhead">Keyboard shortcuts</p>
          <table className="about-table">
            <tbody>
              <tr><td>Undo / Redo</td><td>Ctrl+Z · Ctrl+Shift+Z</td></tr>
              <tr><td>Play / pause</td><td>Space</td></tr>
              <tr><td>Fit object</td><td>F</td></tr>
              <tr><td>Reset camera</td><td>0</td></tr>
            </tbody>
          </table>

          <p className="modal-subhead">Transparency in exports</p>
          <table className="about-table">
            <tbody>
              <tr><td>PNG / PNG sequence</td><td>full 8-bit alpha</td></tr>
              <tr><td>GIF</td><td>1-bit alpha</td></tr>
              <tr><td>MP4 / WebM</td><td>no alpha (baked backdrop)</td></tr>
              <tr><td>MOV + alpha</td><td>convert PNG sequence locally</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body,
  )
}
