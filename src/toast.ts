export type ToastKind = 'ok' | 'err' | 'info'

export type ToastPayload = { text: string; kind: ToastKind } | null

let timer: number | null = null
const listeners = new Set<(toast: ToastPayload) => void>()

export function showToast(text: string, kind: ToastKind = 'info') {
  const payload: ToastPayload = { text, kind }
  listeners.forEach((l) => l(payload))
  if (timer) window.clearTimeout(timer)
  // 错误停留更久：教师快节奏点名时不再被下一条冲掉
  const duration = kind === 'err' ? 5000 : 2400
  timer = window.setTimeout(() => {
    listeners.forEach((l) => l(null))
    timer = null
  }, duration)
}

export function subscribeToast(fn: (toast: ToastPayload) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
