import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { SESSION_EXPIRED_EVENT, tokens } from '@/api/client'
import { authApi } from '@/api/endpoints'
import type { Role, TokenPair, User } from '@/api/types'

interface AuthState {
  user: User | null
  /** true while the saved token is being checked on page load */
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  /** stores tokens returned by sign up (customers are signed in at once) */
  acceptTokens: (pair: TokenPair) => void
  logout: () => void
  refreshUser: () => Promise<void>
  hasRole: (...roles: Role[]) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(() => Boolean(tokens.access))
  const queryClient = useQueryClient()

  const logout = useCallback(() => {
    tokens.clear()
    setUser(null)
    queryClient.clear()
  }, [queryClient])

  const refreshUser = useCallback(async () => {
    setUser(await authApi.me())
  }, [])

  useEffect(() => {
    if (!tokens.access) return
    authApi
      .me()
      .then(setUser)
      .catch(() => tokens.clear())
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, logout)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, logout)
  }, [logout])

  const acceptTokens = useCallback(
    (pair: TokenPair) => {
      tokens.save(pair)
      queryClient.clear()
      setUser(pair.user)
    },
    [queryClient],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const pair = await authApi.login(email, password)
      acceptTokens(pair)
      return pair.user
    },
    [acceptTokens],
  )

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login,
      acceptTokens,
      logout,
      refreshUser,
      hasRole: (...roles) => Boolean(user && roles.includes(user.role)),
    }),
    [user, loading, login, acceptTokens, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

/** Start page after login for each role. */
export function homePath(role: Role | undefined): string {
  switch (role) {
    case 'ADMIN':
      return '/admin/performance'
    case 'MANAGER':
      return '/dashboard'
    case 'WORKER':
      return '/performance'
    default:
      return '/'
  }
}
