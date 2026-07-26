/* ============================================================
   Unsaved-changes tracking. "Clean" is the last loaded/saved/
   fresh state; because settings are immutable, a reference
   comparison is exact — undoing back to the baseline object makes
   the project clean again.

   Note the session autosave (utils/session.ts) still protects
   everything on crash/reload; this flag only drives the explicit
   "you'll lose adjustments" confirmations on New / Load / Close.
   ============================================================ */

import { store } from '../store/store'
import type { AppSettings } from '../types'

let baseline: AppSettings | null = null

/** call after load/save/new/session-restore — current state becomes the baseline */
export function markClean(): void {
  baseline = store.get().settings
}

export function isDirty(): boolean {
  return baseline !== null && store.get().settings !== baseline
}
