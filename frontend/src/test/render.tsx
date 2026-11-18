import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Routes, useLocation } from 'react-router'
import { AuthProvider } from '@/auth/AuthContext'
import { NotifyProvider } from '@/components/Notify'
import type { TokenPair, User } from '@/api/types'

export function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

/** Renders `routes` inside the real providers at `path`. */
export function renderAt(path: string, routes: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <NotifyProvider>
          <AuthProvider>
            <Routes>{routes}</Routes>
            <LocationProbe />
          </AuthProvider>
        </NotifyProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

export const admin: User = {
  id: 1,
  email: 'admin001@wms.kz',
  full_name: 'System Administrator',
  phone: null,
  role: 'ADMIN',
  status: 'ACTIVE',
  requested_role: null,
  created_at: '2026-01-01T00:00:00Z',
  approved_at: null,
  employee_id: 1,
  employee_code: 'E001',
  manager_id: null,
  customer_id: null,
  customer_code: null,
  password_expires_at: '2099-01-01T00:00:00Z',
}

/** A JWT-shaped string (signature is not checked in the browser) with the given claims. */
export function fakeJwt(claims: Record<string, unknown>): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64({ alg: 'HS256' })}.${b64(claims)}.signature`
}

export function tokenPair(user: User = admin, claims: Record<string, unknown> = {}): TokenPair {
  return {
    access_token: fakeJwt({ sub: String(user.id), ...claims }),
    refresh_token: fakeJwt({ sub: String(user.id), type: 'refresh', ...claims }),
    token_type: 'bearer',
    user,
  }
}
