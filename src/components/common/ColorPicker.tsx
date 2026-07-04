/* ============================================================
   Color picker popover — app-styled replacement for the native
   picker, matching the Sonitus reference: SV field, hue slider,
   eyedropper (Chrome EyeDropper API), preview, hex + RGB inputs.

   Drag behavior: SV/hue surfaces take pointer capture, so moving
   outside the popover keeps updating the color and can never
   close the picker mid-drag (outside-close listens to pointerdown
   only). Drags are wrapped in a single undo gesture.
   ============================================================ */

import { useEffect, useRef, useState } from 'react'
import { store } from '../../store/store'
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv, type HSV } from '../../utils/color'
import { Icon } from './Icon'

interface Props {
  value: string
  onChange: (hex: string) => void
}

interface EyeDropperResult {
  sRGBHex: string
}
type EyeDropperCtor = new () => { open: () => Promise<EyeDropperResult> }

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1)

export function ColorPicker({ value, onChange }: Props) {
  // HSV working state — kept locally so hue survives s/v extremes
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(hexToRgb(value) ?? { r: 95, g: 198, b: 232 }))
  const lastEmitted = useRef(value)
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)

  // adopt external changes (hex field, undo) without fighting drags
  useEffect(() => {
    if (value !== lastEmitted.current) {
      const rgb = hexToRgb(value)
      if (rgb) setHsv(rgbToHsv(rgb))
      lastEmitted.current = value
    }
  }, [value])

  const hex = rgbToHex(hsvToRgb(hsv))
  const rgb = hsvToRgb(hsv)

  const commit = (next: HSV) => {
    setHsv(next)
    const nextHex = rgbToHex(hsvToRgb(next))
    lastEmitted.current = nextHex
    onChange(nextHex)
  }

  const svFrom = (e: { clientX: number; clientY: number }) => {
    const rect = svRef.current!.getBoundingClientRect()
    return {
      s: clamp01((e.clientX - rect.left) / rect.width),
      v: 1 - clamp01((e.clientY - rect.top) / rect.height),
    }
  }

  const hueFrom = (e: { clientX: number }) => {
    const rect = hueRef.current!.getBoundingClientRect()
    return clamp01((e.clientX - rect.left) / rect.width) * 360
  }

  const dragHandlers = (update: (e: React.PointerEvent) => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      store.beginGesture()
      update(e)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) update(e)
    },
    onPointerUp: () => store.endGesture(),
  })

  const eyeDropper = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper

  return (
    <div className="cpick" onPointerDown={(e) => e.stopPropagation()}>
      <div
        ref={svRef}
        className="cpick-sv"
        style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
        {...dragHandlers((e) => commit({ ...hsv, ...svFrom(e) }))}
      >
        <span
          className="cpick-sv-thumb"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }}
        />
      </div>

      <div className="cpick-huerow">
        {eyeDropper && (
          <button
            type="button"
            className="iconbtn cpick-eyedrop"
            title="Pick a color from the screen"
            onClick={async () => {
              try {
                const result = await new eyeDropper().open()
                const rgbPicked = hexToRgb(result.sRGBHex)
                if (rgbPicked) commit(rgbToHsv(rgbPicked))
              } catch {
                /* user cancelled */
              }
            }}
          >
            <Icon name="pipette" size={13} strokeWidth={2} />
          </button>
        )}
        <span className="cpick-preview" style={{ background: hex }} />
        <div ref={hueRef} className="cpick-hue" {...dragHandlers((e) => commit({ ...hsv, h: hueFrom(e) }))}>
          <span className="cpick-hue-thumb" style={{ left: `${(hsv.h / 360) * 100}%` }} />
        </div>
      </div>

      <div className="cpick-inputs">
        <PickerField
          label="hex"
          value={hex}
          commit={(text) => {
            const parsed = hexToRgb(text)
            if (parsed) commit(rgbToHsv(parsed))
          }}
        />
        {(['r', 'g', 'b'] as const).map((ch) => (
          <PickerField
            key={ch}
            label={ch}
            value={String(Math.round(rgb[ch]))}
            commit={(text) => {
              const n = parseInt(text, 10)
              if (!isFinite(n)) return
              const next = { ...rgb, [ch]: Math.min(Math.max(n, 0), 255) }
              commit(rgbToHsv(next))
            }}
          />
        ))}
      </div>
    </div>
  )
}

function PickerField({ label, value, commit }: { label: string; value: string; commit: (text: string) => void }) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(value)
  }, [value, focused])

  return (
    <div className="cpick-field">
      <input
        value={draft}
        spellCheck={false}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false)
          commit(draft)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          e.stopPropagation()
        }}
      />
      <span>{label}</span>
    </div>
  )
}
