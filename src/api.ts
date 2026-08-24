/** 与服务端交互的最小封装：同源 fetch + 会话 cookie + CSRF 自定义头。 */

export interface ApiResult<T = unknown> {
  ok: boolean
  status: number
  data: T | null
  error: string | null
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'fetch',
      },
      ...init,
    })
    let data: unknown = null
    try {
      data = await res.json()
    } catch {
      /* empty body */
    }
    const err = (data as { error?: string } | null)?.error ?? null
    return { ok: res.ok, status: res.status, data: (data as T) ?? null, error: res.ok ? null : err ?? `请求失败（${res.status}）` }
  } catch {
    return { ok: false, status: 0, data: null, error: '网络异常：连不上服务器' }
  }
}

export function apiGet<T>(path: string) {
  return request<T>(path)
}

export function apiPost<T>(path: string, body?: unknown) {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
}
