export type ToastKind = 'ok' | 'err' | 'info'

export type ToastPayload = { text: string; kind: ToastKind } | null

let timer: number | null = null
const listeners = new Set<(toast: ToastPayload) => void>()

export function showToast(text: string, kind: ToastKind = 'info') {
  const payload: ToastPayload = { text, kind }
  listeners.forEach((l) => l(payload))
  if (timer) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    listeners.forEach((l) => l(null))
    timer = null
  }, 2400)
}

export function subscribeToast(fn: (toast: ToastPayload) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
