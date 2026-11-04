import { Box, CircularProgress } from '@mui/material'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import type { Role } from '@/api/types'
import { useAuth } from './AuthContext'

/**
 * Hides pages from users without the right role. This is only for convenience:
 * the real protection is require_role() on every FastAPI endpoint.
 */
export function ProtectedRoute({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (roles && !roles.includes(user.role)) return <Navigate to="/403" replace />
  return <>{children}</>
}

export function FullPageSpinner() {
  return (
    <Box sx={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      <CircularProgress />
    </Box>
  )
}
