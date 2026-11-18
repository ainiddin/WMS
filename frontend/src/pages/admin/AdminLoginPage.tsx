import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined'
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined'
import { Alert, Box, Button, Card, CardContent, Link, Stack, TextField, Typography } from '@mui/material'
import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, Link as RouterLink, useNavigate } from 'react-router'
import { errorMessage, retryAfter, statusOf } from '@/api/client'
import { adminAuthApi } from '@/api/endpoints'
import type { TwoFactorRequired } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import { formatWait } from './parts'

/** Seconds left until `deadline` (ms), ticking once a second. */
export function useCountdown(deadline: number | null): number {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (deadline === null) return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [deadline])
  // Read the clock on every render: a stale "now" from before the deadline was set would show 61 s.
  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

/**
 * Admin sign in, two steps: the password, then the 6-digit code that the server mails ONLY to the corporate
 * mailbox. The code itself is never seen by the browser until the Admin types it.
 */
export function AdminLoginPage() {
  const { user, acceptTokens } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [challenge, setChallenge] = useState<TwoFactorRequired | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)

  const resendIn = useCountdown(challenge && sentAt ? sentAt + challenge.resend_seconds * 1000 : null)
  const codeLeft = useCountdown(challenge && sentAt ? sentAt + challenge.code_seconds * 1000 : null)
  const lockLeft = useCountdown(lockedUntil)

  if (user?.role === 'ADMIN') return <Navigate to="/admin" replace />

  const fail = (e: unknown) => {
    setInfo(null)
    setError(errorMessage(e))
    const wait = statusOf(e) === 429 ? retryAfter(e) : undefined
    if (wait) setLockedUntil(Date.now() + wait * 1000)
  }

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const c = await adminAuthApi.login(email.trim(), password)
      setPassword('') // not kept in memory longer than needed
      setChallenge(c)
      setSentAt(Date.now())
      setInfo(null)
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async (e: FormEvent) => {
    e.preventDefault()
    if (!challenge) return
    setBusy(true)
    setError(null)
    try {
      const pair = await adminAuthApi.verify(challenge.challenge_token, code)
      acceptTokens(pair)
      navigate('/admin', { replace: true })
    } catch (err) {
      setCode('')
      const message = errorMessage(err)
      if (message.includes('new code was sent')) {
        setSentAt(Date.now()) // the server mailed a fresh code: restart the timers
        setError(null)
        setInfo(message)
      } else if (message.includes('Sign in again')) {
        setChallenge(null)
        fail(err)
      } else {
        fail(err)
      }
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    if (!challenge) return
    setBusy(true)
    setError(null)
    try {
      setChallenge(await adminAuthApi.resend(challenge.challenge_token))
      setSentAt(Date.now())
      setCode('')
      setInfo('A new code was sent. The previous one no longer works.')
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const restart = () => {
    setChallenge(null)
    setCode('')
    setError(null)
    setInfo(null)
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, bgcolor: 'background.default' }}>
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack spacing={1} sx={{ alignItems: 'center', mb: 3, textAlign: 'center' }}>
            {challenge ? (
              <MarkEmailReadOutlinedIcon color="primary" sx={{ fontSize: 40 }} />
            ) : (
              <AdminPanelSettingsOutlinedIcon color="primary" sx={{ fontSize: 40 }} />
            )}
            <Typography variant="h5" component="h1">
              {challenge ? 'Enter the code' : 'KeyFive Admin'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {challenge
                ? `We sent a 6-digit code to the corporate mailbox ${challenge.sent_to}.`
                : 'Sign in with your password. A code will then go to the corporate mailbox.'}
            </Typography>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
              {lockLeft > 0 && ` (${formatWait(lockLeft)} left)`}
            </Alert>
          )}
          {info && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {info}
            </Alert>
          )}

          {!challenge ? (
            <Stack component="form" spacing={2} onSubmit={submitPassword}>
              <TextField
                label="Email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <TextField
                label="Password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button type="submit" variant="contained" size="large" disabled={busy || lockLeft > 0}>
                Continue
              </Button>
            </Stack>
          ) : (
            <Stack component="form" spacing={2} onSubmit={submitCode}>
              <TextField
                label="Code from the email"
                required
                autoFocus
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': 'Code from the email' } }}
                helperText={codeLeft > 0 ? `The code works for ${formatWait(codeLeft)} more` : 'The code has expired: send a new one'}
              />
              <Button type="submit" variant="contained" size="large" disabled={busy || code.length !== 6}>
                Sign in
              </Button>
              <Button onClick={resend} disabled={busy || resendIn > 0 || lockLeft > 0}>
                {resendIn > 0 ? `Send again in ${resendIn} s` : 'Send again'}
              </Button>
              <Button color="inherit" size="small" onClick={restart}>
                Use another account
              </Button>
            </Stack>
          )}

          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 3, textAlign: 'center' }}>
            Not an Admin?{' '}
            <Link component={RouterLink} to="/login">
              Shop sign in
            </Link>
            . Managers and Workers use the KeyFive Staff app.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
