let timer: number | null = null
const listeners = new Set<(text: string | null) => void>()

export function showToast(text: string) {
  listeners.forEach((l) => l(text))
  if (timer) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    listeners.forEach((l) => l(null))
    timer = null
  }, 2400)
}

export function subscribeToast(fn: (text: string | null) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
