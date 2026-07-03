export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Signum — 3D Icon Studio</h2>
          <button type="button" className="iconbtn" onClick={onClose} title="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-subhead">Keyboard shortcuts</p>
          <table className="about-table">
            <tbody>
              <tr><td>Undo / Redo</td><td>Ctrl+Z · Ctrl+Shift+Z / Ctrl+Y</td></tr>
              <tr><td>Play / pause</td><td>Space</td></tr>
              <tr><td>Fit object</td><td>F</td></tr>
              <tr><td>Reset camera</td><td>0</td></tr>
            </tbody>
          </table>

          <p className="modal-subhead">Export &amp; transparency</p>
          <p className="modal-note">
            <code>PNG</code> stills and <code>PNG sequences</code> carry full 8-bit alpha — the
            reliable path for transparency. <code>GIF</code> supports 1-bit alpha (hard edges).
            Chrome&rsquo;s video encoders cannot write alpha, so <code>MP4</code> / <code>WebM</code>{' '}
            bake the studio backdrop instead of pretending to be transparent. For{' '}
            <code>MOV + alpha</code>, export a PNG sequence and convert locally, e.g.{' '}
            <code>ffmpeg -framerate 30 -i frame_%04d.png -c:v prores_ks -pix_fmt yuva444p10le out.mov</code>
          </p>

          <p className="modal-subhead">Pipeline</p>
          <p className="modal-note">
            Stroke-based icons (like lucide) are outlined into solid filled shapes, boolean-unioned
            into a single clean object, triangulated and extruded with bevels — all locally in your
            browser, heavy work in a Web Worker.
          </p>
        </div>
      </div>
    </div>
  )
}
