import { createPortal } from 'react-dom'
import { Icon } from './common/Icon'

/* Rendered through a portal: the topbar's backdrop-filter makes it a
   containing block for position:fixed, which would trap the overlay
   inside the header strip (the original "bugged About" layout). */
export function AboutModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Signum — 3D Icon Studio</h2>
          <button type="button" className="iconbtn" onClick={onClose} title="Close">
            <Icon name="x" size={13} strokeWidth={2.2} />
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-note">
            Create dimensional icon animations from Lucide and SVG sources. Convert stroke icons
            into solid 3D forms, adjust geometry, materials and motion, then export stills or
            animations.
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
          <p className="modal-note">
            All processing runs locally in your browser — no uploads, no external services.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
