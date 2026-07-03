/* ============================================================
   JSON presets — full AppSettings serialization with defensive
   validation on import. Unknown fields are dropped, missing ones
   fall back to defaults, numbers are clamped to sane ranges, so a
   hand-edited or truncated file can never produce broken state.
   ============================================================ */

import type { AppSettings } from '../types'
import { defaultSettings } from '../types'
import { hasIcon } from '../icons/lucide'
import { MATERIAL_PRESETS } from '../engine/materials'

export function serializePreset(settings: AppSettings): string {
  return JSON.stringify({ app: 'signum-3d-icon', ...settings }, null, 2)
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' && isFinite(v) ? v : fallback
  return Math.min(Math.max(n, min), max)
}

function str<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

function color(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function vec3(v: unknown, fallback: { x: number; y: number; z: number }) {
  const o = (v ?? {}) as Record<string, unknown>
  return {
    x: num(o.x, fallback.x, -3600, 3600),
    y: num(o.y, fallback.y, -3600, 3600),
    z: num(o.z, fallback.z, -3600, 3600),
  }
}

/**
 * Parse + sanitize a preset JSON string. Throws with a readable
 * message when the file is not a preset at all.
 */
export function parsePreset(json: string): AppSettings {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('This file is not valid JSON.')
  }
  if (typeof raw !== 'object' || raw === null || !('icon' in raw)) {
    throw new Error('This file does not look like a Signum preset.')
  }

  const d = defaultSettings()
  const icon = (raw.icon ?? {}) as Record<string, unknown>
  const g = (raw.geometry ?? {}) as Record<string, unknown>
  const m = (raw.material ?? {}) as Record<string, unknown>
  const l = (raw.lighting ?? {}) as Record<string, unknown>
  const b = (raw.background ?? {}) as Record<string, unknown>
  const a = (raw.animation ?? {}) as Record<string, unknown>
  const e = (raw.export ?? {}) as Record<string, unknown>
  const c = (raw.camera ?? {}) as Record<string, unknown>

  const iconType = str(icon.type, ['lucide', 'custom'] as const, 'lucide')
  const iconName = typeof icon.name === 'string' && icon.name ? icon.name : d.icon.name
  const iconSvg = typeof icon.svg === 'string' ? icon.svg : undefined
  const validIcon =
    iconType === 'custom'
      ? iconSvg
        ? { type: 'custom' as const, name: iconName, svg: iconSvg }
        : d.icon
      : hasIcon(iconName)
        ? { type: 'lucide' as const, name: iconName }
        : d.icon

  const presetIds = [...MATERIAL_PRESETS.map((p) => p.id), 'custom']

  const camPos = Array.isArray(c.position) && c.position.length === 3 ? c.position : d.camera.position
  const camTgt = Array.isArray(c.target) && c.target.length === 3 ? c.target : d.camera.target

  return {
    version: 1,
    icon: validIcon,
    geometry: {
      strokeWidth: num(g.strokeWidth, d.geometry.strokeWidth, 0.2, 4),
      extrudeDepth: num(g.extrudeDepth, d.geometry.extrudeDepth, 1, 60),
      bevelAmount: num(g.bevelAmount, d.geometry.bevelAmount, 0, 10),
      bevelSegments: Math.round(num(g.bevelSegments, d.geometry.bevelSegments, 1, 12)),
      bevelStyle: str(g.bevelStyle, ['none', 'hard', 'rounded'] as const, d.geometry.bevelStyle),
      combine: str(g.combine, ['union', 'separate'] as const, d.geometry.combine),
      quality: str(g.quality, ['fast', 'balanced', 'high'] as const, d.geometry.quality),
      normalizeSize: bool(g.normalizeSize, d.geometry.normalizeSize),
      scale: num(g.scale, d.geometry.scale, 0.2, 3),
    },
    material: {
      preset: str(m.preset, presetIds, 'custom'),
      mode: str(
        m.mode,
        ['solid', 'clay', 'plastic', 'metal', 'chrome', 'soft-metal', 'glass', 'emissive'] as const,
        d.material.mode,
      ),
      color: color(m.color, d.material.color),
      roughness: num(m.roughness, d.material.roughness, 0, 1),
      metalness: num(m.metalness, d.material.metalness, 0, 1),
      opacity: num(m.opacity, d.material.opacity, 0.05, 1),
      emissiveColor: color(m.emissiveColor, d.material.emissiveColor),
      emissiveIntensity: num(m.emissiveIntensity, d.material.emissiveIntensity, 0, 8),
      clearcoat: num(m.clearcoat, d.material.clearcoat, 0, 1),
      envIntensity: num(m.envIntensity, d.material.envIntensity, 0, 3),
    },
    lighting: {
      preset: str(l.preset, ['studio', 'softbox', 'dramatic', 'top', 'custom'] as const, d.lighting.preset),
      ambient: num(l.ambient, d.lighting.ambient, 0, 3),
      key: num(l.key, d.lighting.key, 0, 8),
      fill: num(l.fill, d.lighting.fill, 0, 8),
      rim: num(l.rim, d.lighting.rim, 0, 8),
      keyAzimuth: num(l.keyAzimuth, d.lighting.keyAzimuth, -180, 180),
      keyElevation: num(l.keyElevation, d.lighting.keyElevation, 5, 85),
      shadows: bool(l.shadows, d.lighting.shadows),
      softShadows: bool(l.softShadows, d.lighting.softShadows),
    },
    background: {
      mode: str(
        b.mode,
        ['transparent', 'checkerboard', 'solid', 'gradient', 'studio'] as const,
        d.background.mode,
      ),
      color: color(b.color, d.background.color),
      color2: color(b.color2, d.background.color2),
    },
    animation: {
      preset: str(
        a.preset,
        ['static', 'spin-y', 'spin-x', 'turntable', 'slow-turn', 'wobble', 'float', 'reveal', 'bounce-in'] as const,
        d.animation.preset,
      ),
      duration: num(a.duration, d.animation.duration, 0.2, 30),
      fps: Math.round(num(a.fps, d.animation.fps, 1, 60)),
      loop: bool(a.loop, d.animation.loop),
      speed: num(a.speed, d.animation.speed, 0.25, 4),
      direction: a.direction === -1 ? -1 : 1,
      easing: str(a.easing, ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const, d.animation.easing),
      startRotation: vec3(a.startRotation, d.animation.startRotation),
      endRotation: vec3(a.endRotation, d.animation.endRotation),
    },
    export: {
      stillFormat: str(e.stillFormat, ['png', 'jpg', 'webp'] as const, d.export.stillFormat),
      animFormat: str(e.animFormat, ['mp4', 'webm', 'gif', 'png-seq'] as const, d.export.animFormat),
      sizePreset: str(e.sizePreset, ['512', '1024', '2048', 'custom'] as const, d.export.sizePreset),
      width: Math.round(num(e.width, d.export.width, 16, 4096)),
      height: Math.round(num(e.height, d.export.height, 16, 4096)),
    },
    camera: {
      position: [
        num(camPos[0], d.camera.position[0], -100, 100),
        num(camPos[1], d.camera.position[1], -100, 100),
        num(camPos[2], d.camera.position[2], -100, 100),
      ],
      target: [
        num(camTgt[0], d.camera.target[0], -100, 100),
        num(camTgt[1], d.camera.target[1], -100, 100),
        num(camTgt[2], d.camera.target[2], -100, 100),
      ],
      autoRotate: bool(c.autoRotate, d.camera.autoRotate),
    },
  }
}
