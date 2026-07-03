interface Props {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}

export function Toggle({ label, checked, disabled, onChange }: Props) {
  return (
    <label className={`toggle${disabled ? ' control disabled' : ''}`}>
      <span className="control-label">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="track" />
    </label>
  )
}
