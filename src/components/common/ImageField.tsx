/* Image slot control — "Load…" button when empty; thumbnail (optional),
   filename and a remove button when set. Used for background images,
   HDRI environments and object textures. */

import { pickFile } from '../../utils/file'
import { Icon } from './Icon'

interface Props {
  label: string
  /** data URL, or '' when empty */
  value: string
  /** display filename of the loaded image */
  name: string
  /** file-picker accept string */
  accept: string
  buttonText: string
  /** hide the <img> thumbnail (e.g. .hdr files browsers can't preview) */
  noPreview?: boolean
  onPick: (file: File) => void | Promise<void>
  onClear: () => void
}

export function ImageField({ label, value, name, accept, buttonText, noPreview, onPick, onClear }: Props) {
  const load = async () => {
    const file = await pickFile(accept)
    if (file) await onPick(file)
  }

  return (
    <div className="control">
      <div className="control-head">
        <span className="control-label">{label}</span>
      </div>
      {value ? (
        <div className="imgfield">
          {!noPreview && <img className="imgfield-thumb" src={value} alt="" />}
          <span className="imgfield-name" title={name}>
            {name || 'image'}
          </span>
          <button type="button" className="iconbtn" title="Replace image" onClick={load}>
            <Icon name="folder-open" size={12} strokeWidth={2.2} />
          </button>
          <button type="button" className="iconbtn" title="Remove image" onClick={onClear}>
            <Icon name="x" size={12} strokeWidth={2.2} />
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn--sm" style={{ justifyContent: 'center' }} onClick={load}>
          <Icon name="image-plus" size={12} strokeWidth={2.2} />
          {buttonText}
        </button>
      )}
    </div>
  )
}
