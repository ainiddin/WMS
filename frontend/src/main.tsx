import { CssBaseline, ThemeProvider } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { statusOf } from '@/api/client'
import App from '@/App'
import { AuthProvider } from '@/auth/AuthContext'
import { CartProvider } from '@/cart/CartContext'
import { NotifyProvider } from '@/components/Notify'
import { theme } from '@/theme'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      // 4xx answers (no permission, not found) will not change on retry.
      retry: (count, error) => {
        const status = statusOf(error)
        return count < 2 && (status === undefined || status >= 500)
      },
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline enableColorScheme />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <NotifyProvider>
            <AuthProvider>
              <CartProvider>
                <App />
              </CartProvider>
            </AuthProvider>
          </NotifyProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
