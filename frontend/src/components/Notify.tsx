import { Alert, Snackbar, type AlertColor } from '@mui/material'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { errorMessage } from '@/api/client'

interface Notice {
  key: number
  message: string
  severity: AlertColor
}

interface NotifyApi {
  success: (message: string) => void
  error: (errorOrMessage: unknown) => void
  info: (message: string) => void
}

const NotifyContext = createContext<NotifyApi | null>(null)

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null)

  const show = useCallback((message: string, severity: AlertColor) => {
    setNotice({ key: Date.now(), message, severity })
  }, [])

  const [api] = useState<NotifyApi>(() => ({
    success: (m) => show(m, 'success'),
    info: (m) => show(m, 'info'),
    error: (e) => show(typeof e === 'string' ? e : errorMessage(e), 'error'),
  }))

  return (
    <NotifyContext.Provider value={api}>
      {children}
      <Snackbar
        key={notice?.key}
        open={Boolean(notice)}
        autoHideDuration={notice?.severity === 'error' ? 7000 : 3500}
        onClose={(_, reason) => reason !== 'clickaway' && setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {notice ? (
          <Alert severity={notice.severity} variant="filled" onClose={() => setNotice(null)} sx={{ width: '100%' }}>
            {notice.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </NotifyContext.Provider>
  )
}

export function useNotify() {
  const ctx = useContext(NotifyContext)
  if (!ctx) throw new Error('useNotify must be used inside NotifyProvider')
  return ctx
}
