import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { t } from '@/i18n'
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
/** Fired when the server says the Admin password has expired (403 + X-Password-Expired). */
export const PASSWORD_EXPIRED_EVENT = 'kf:password-expired'

/** Calls that must never trigger a token refresh: they are the sign in itself. */
const AUTH_CALLS = ['/auth/login', '/auth/refresh', '/auth/admin/login', '/auth/2fa/', '/auth/web/']

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
  const isAuthCall = AUTH_CALLS.some((path) => original?.url?.startsWith(path))
  if (error.response?.status === 403 && error.response.headers?.['x-password-expired']) {
    window.dispatchEvent(new Event(PASSWORD_EXPIRED_EVENT))
  }
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

/** Seconds from the Retry-After header of a 429, if any. */
export function retryAfter(error: unknown): number | undefined {
  if (!axios.isAxiosError(error)) return undefined
  const value = Number(error.response?.headers?.['retry-after'])
  return Number.isFinite(value) && value > 0 ? value : undefined
}

/** Hard end of an Admin website session (the `web` claim of the access token), or null. */
export function sessionEndsAt(accessToken: string | null): Date | null {
  if (!accessToken) return null
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.web === 'number' ? new Date(payload.web * 1000) : null
  } catch {
    return null
  }
}

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
    if (!error.response) return t('Cannot reach the server. Is the backend running?')
    return t('Request failed ({0})', error.response.status)
  }
  return error instanceof Error ? error.message : t('Something went wrong')
}

export function statusOf(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}
