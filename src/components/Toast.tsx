import { useEffect, useState } from 'react'
import { useStore } from '../store/store'

export function Toast() {
  const toast = useStore((s) => s.toast)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!toast) return
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 3600)
    return () => clearTimeout(timer)
  }, [toast])

  if (!toast || !visible) return null
  return <div className={`toast${toast.kind === 'error' ? ' error' : ''}`}>{toast.message}</div>
}
