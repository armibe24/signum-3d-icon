/* ============================================================
   Animation evaluation — pure function of (settings, time) so the
   viewport preview and the frame-exact exporter share identical
   motion. No state, no clocks. A future keyframe timeline can
   replace `evaluatePose` while keeping the same Pose contract.
   ============================================================ */

import type { AnimationSettings, EasingId } from '../types'

export interface Pose {
  /** radians */
  rotation: { x: number; y: number; z: number }
  /** world units */
  position: { x: number; y: number; z: number }
  scale: number
}

const TAU = Math.PI * 2
const D2R = Math.PI / 180

export function applyEasing(easing: EasingId, t: number): number {
  switch (easing) {
    case 'ease-in':
      return t * t * t
    case 'ease-out':
      return 1 - Math.pow(1 - t, 3)
    case 'ease-in-out':
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    default:
      return t
  }
}

/** ease-out with overshoot, for bounce-in */
function backOut(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

export function evaluatePose(a: AnimationSettings, time: number): Pose {
  const duration = Math.max(a.duration, 0.01)
  const tn = Math.min(Math.max(time / duration, 0), 1)
  const e = applyEasing(a.easing, tn)
  const dir = a.direction
  const speed = a.speed

  const rotation = {
    x: a.startRotation.x * D2R,
    y: a.startRotation.y * D2R,
    z: a.startRotation.z * D2R,
  }
  const position = { x: 0, y: 0, z: 0 }
  let scale = 1

  switch (a.preset) {
    case 'static':
      break

    case 'spin-y':
      rotation.y += dir * TAU * speed * e
      break

    case 'spin-x':
      rotation.x += dir * TAU * speed * e
      break

    case 'turntable':
      // classic product turn: fixed downward tilt + full yaw
      rotation.x += -14 * D2R
      rotation.y += dir * TAU * speed * e
      break

    case 'slow-turn':
      rotation.y += dir * TAU * speed * 0.35 * e
      break

    case 'wobble':
      // integer sine cycles → seamless loop
      rotation.x += Math.sin(tn * TAU) * 0.14 * speed
      rotation.z += Math.sin(tn * TAU * 2) * 0.08 * speed
      break

    case 'float':
      rotation.x += Math.sin(tn * TAU) * 0.1 * speed
      rotation.z += Math.sin(tn * TAU * 2) * 0.06 * speed
      rotation.y += Math.sin(tn * TAU) * 0.12 * speed
      position.y = Math.sin(tn * TAU) * 0.14 * speed
      break

    case 'reveal': {
      // interpolate start → end rotation once over the duration
      rotation.x += (a.endRotation.x - a.startRotation.x) * D2R * e
      rotation.y += dir * (a.endRotation.y - a.startRotation.y) * D2R * e
      rotation.z += (a.endRotation.z - a.startRotation.z) * D2R * e
      break
    }

    case 'bounce-in': {
      // pop in with overshoot, then settle with a quarter-turn
      const sT = Math.min(tn / 0.45, 1)
      scale = Math.max(backOut(sT), 0.001)
      const rT = applyEasing('ease-out', Math.min(tn / 0.7, 1))
      rotation.y += dir * (1 - rT) * (-Math.PI / 2)
      break
    }
  }

  return { rotation, position, scale }
}

/** wrap or clamp raw playback time according to loop mode */
export function normalizePlayTime(a: AnimationSettings, time: number): number {
  const d = Math.max(a.duration, 0.01)
  if (a.loop) {
    const w = time % d
    return w < 0 ? w + d : w
  }
  return Math.min(Math.max(time, 0), d)
}
