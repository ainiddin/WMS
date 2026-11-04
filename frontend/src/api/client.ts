import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { TokenPair } from './types'

const ACCESS_KEY = 'kf.access'
const REFRESH_KEY = 'kf.refresh'

// Tokens live in localStorage so a page reload keeps the user signed in.
export const tokens = {
  get access() {
    return safeGet(ACCESS_KEY)
  },
  get refresh() {
    return safeGet(REFRESH_KEY)
  },
  save(pair: Pick<TokenPair, 'access_token' | 'refresh_token'>) {
    safeSet(ACCESS_KEY, pair.access_token)
    safeSet(REFRESH_KEY, pair.refresh_token)
  },
  clear() {
    safeSet(ACCESS_KEY, null)
    safeSet(REFRESH_KEY, null)
  },
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage blocked: the session just will not survive a reload */
  }
}

// Vite proxies /api to FastAPI on :8000 (vite.config.ts).
export const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = tokens.access
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/** Fired when the session cannot be restored; AuthContext listens and signs the user out. */
export const SESSION_EXPIRED_EVENT = 'kf:session-expired'

let refreshing: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const refresh = tokens.refresh
  if (!refresh) throw new Error('No refresh token')
  const { data } = await axios.post<TokenPair>('/api/auth/refresh/', { refresh_token: refresh })
  tokens.save(data)
  return data.access_token
}

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
  const isAuthCall = original?.url?.startsWith('/auth/login') || original?.url?.startsWith('/auth/refresh')
  if (error.response?.status === 401 && original && !original._retried && !isAuthCall && tokens.refresh) {
    original._retried = true
    try {
      // Several requests may fail at once: they all wait for one refresh.
      refreshing ??= refreshAccessToken().finally(() => (refreshing = null))
      const access = await refreshing
      original.headers.Authorization = `Bearer ${access}`
      return api(original)
    } catch {
      tokens.clear()
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    }
  }
  return Promise.reject(error)
})

/** Human-readable message from a FastAPI error ({detail: string} or a validation list). */
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length) {
      return detail
        .map((d: { loc?: (string | number)[]; msg?: string }) => {
          const field = d.loc?.filter((p) => p !== 'body').join('.')
          return field ? `${field}: ${d.msg}` : d.msg
        })
        .join('; ')
    }
    if (!error.response) return 'Cannot reach the server. Is the backend running?'
    return `Request failed (${error.response.status})`
  }
  return error instanceof Error ? error.message : 'Something went wrong'
}

export function statusOf(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}
