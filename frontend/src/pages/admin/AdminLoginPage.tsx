import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined'
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined'
import PhonelinkLockOutlinedIcon from '@mui/icons-material/PhonelinkLockOutlined'
import { Alert, Box, Button, Card, CardContent, Link, Stack, TextField, Typography } from '@mui/material'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, Link as RouterLink, useNavigate } from 'react-router'
import { errorMessage, retryAfter, statusOf } from '@/api/client'
import { adminAuthApi, staffAuthApi } from '@/api/endpoints'
import type { Role, TokenPair, TwoFactorRequired, WebLoginStarted } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import { formatClock, formatWait, lockMessage } from './parts'

/** Seconds left until `deadline` (ms), ticking once a second. */
export function useCountdown(deadline: number | null): number {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (deadline === null) return
    const id = window.setInterval(() => setTick((t) => t + 1), 250)
    return () => window.clearInterval(id)
  }, [deadline])
  // Read the clock on every render: a stale "now" from before the deadline was set would show 61 s.
  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

/** Where each role works on the website. */
export function homeOf(role: Role | undefined): string | null {
  if (role === 'ADMIN') return '/admin'
  if (role === 'MANAGER') return '/manage'
  return null
}

/** How often the browser asks whether the phone has answered (only while it waits). */
export const STATUS_EVERY_MS = 2000

/** Where the Admin code went decides the field label (Telegram in the demo setup). */
function codeLabel(challenge: TwoFactorRequired | null) {
  return challenge?.sent_via === 'telegram' ? 'Code from Telegram' : 'Code from the email'
}

/**
 * Staff sign in on the website (Admin, Manager): the password, then "Is this you?" on the approved phone, where
 * the person taps the number shown here. Admins and Managers can use the 6-digit sign in code instead.
 */
export function StaffLoginPage() {
  const { user, acceptTokens } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [challenge, setChallenge] = useState<TwoFactorRequired | null>(null)
  // Waiting for the phone: the request, and when it ends on this browser's own clock.
  const [phone, setPhone] = useState<{ req: WebLoginStarted; until: number } | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false) // "Send again" is on its way
  const [sentAt, setSentAt] = useState<number | null>(null)
  // A 429: when it ends (computed once from Retry-After) and the server's text. Counted down here, never polled.
  const [lock, setLock] = useState<{ until: number; text: string } | null>(null)

  const resendIn = useCountdown(challenge && sentAt ? sentAt + challenge.resend_seconds * 1000 : null)
  const codeLeft = useCountdown(challenge && sentAt ? sentAt + challenge.code_seconds * 1000 : null)
  const lockLeft = useCountdown(lock?.until ?? null)
  const phoneLeft = useCountdown(phone?.until ?? null)

  // The wait is over: the lock message goes away and the buttons work again.
  useEffect(() => {
    if (lock && lockLeft === 0) setLock(null)
  }, [lock, lockLeft])

  // The latest callbacks, so the polling below restarts only for a new request (not on every countdown render).
  const onApproved = useRef<(pair: TokenPair) => void>(() => {})
  onApproved.current = (pair) => {
    acceptTokens(pair)
    navigate(homeOf(pair.user.role) ?? '/', { replace: true })
  }

  // While the phone has not answered: ask the server every STATUS_EVERY_MS. Stops as soon as there is an answer.
  useEffect(() => {
    if (!phone) return
    let stopped = false
    const id = window.setInterval(async () => {
      try {
        const state = await staffAuthApi.status(phone.req.request_token)
        if (stopped || state.status !== 'APPROVED' || !state.tokens) return
        stopped = true
        window.clearInterval(id)
        onApproved.current(state.tokens)
      } catch (e) {
        if (stopped) return
        stopped = true
        window.clearInterval(id)
        setPhone(null)
        setError(errorMessage(e))
      }
    }, STATUS_EVERY_MS)
    return () => {
      stopped = true
      window.clearInterval(id)
    }
  }, [phone])

  // Nobody answered on the phone in time.
  useEffect(() => {
    if (phone && phoneLeft === 0) {
      setPhone(null)
      setError('No answer from the phone in time. Sign in again.')
    }
  }, [phone, phoneLeft])

  const home = homeOf(user?.role)
  if (home) return <Navigate to={home} replace />

  const fail = (e: unknown) => {
    setInfo(null)
    const wait = statusOf(e) === 429 ? retryAfter(e) : undefined
    if (wait) {
      setError(null)
      setLock({ until: Date.now() + wait * 1000, text: errorMessage(e) })
    } else {
      setError(errorMessage(e))
    }
  }

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const req = await staffAuthApi.webLogin(email.trim(), password)
      setPassword('') // not kept in memory longer than needed
      setInfo(null)
      if (req.phone_available) {
        setPhone({ req, until: Date.now() + req.seconds * 1000 })
      } else {
        // No approving phone yet (Admin or Manager): straight to the sign in code.
        setChallenge(await staffAuthApi.emailCode(req.request_token))
        setSentAt(Date.now())
      }
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
      navigate(homeOf(pair.user.role) ?? '/', { replace: true })
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

  const switchToEmailCode = async () => {
    if (!phone) return
    setBusy(true)
    setError(null)
    try {
      const c = await staffAuthApi.emailCode(phone.req.request_token)
      setPhone(null)
      setChallenge(c)
      setSentAt(Date.now())
    } catch (err) {
      setPhone(null)
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    if (!challenge) return
    setBusy(true)
    setSending(true)
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
      setSending(false)
    }
  }

  const restart = () => {
    setChallenge(null)
    setPhone(null)
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
            ) : phone ? (
              <PhonelinkLockOutlinedIcon color="primary" sx={{ fontSize: 40 }} />
            ) : (
              <AdminPanelSettingsOutlinedIcon color="primary" sx={{ fontSize: 40 }} />
            )}
            <Typography variant="h5" component="h1">
              {challenge ? 'Enter the code' : phone ? 'Confirm on your phone' : 'KeyFive Staff sign in'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {challenge
                ? challenge.sent_via === 'telegram'
                  ? 'We sent a 6-digit code to Telegram.'
                  : `We sent a 6-digit code to the corporate mailbox ${challenge.sent_to}.`
                : phone
                  ? 'Open KeyFive Staff on your work phone and tap this number:'
                  : 'For Admins and Managers. After the password, you confirm the sign in on your work phone.'}
            </Typography>
          </Stack>

          {lock && lockLeft > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }} role="timer" aria-live="off">
              {lockMessage(lock.text, lockLeft)}
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {info && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {info}
            </Alert>
          )}

          {phone && !challenge ? (
            <Stack spacing={2} sx={{ alignItems: 'center' }}>
              <Typography
                data-testid="phone-number"
                sx={{ fontSize: 56, fontWeight: 700, letterSpacing: 4, fontVariantNumeric: 'tabular-nums' }}
              >
                {phone.req.number}
              </Typography>
              <Typography variant="body2" color="text.secondary" role="timer">
                Waiting for the phone · {formatClock(phoneLeft)}
              </Typography>
              <Button onClick={switchToEmailCode} disabled={busy}>
                Use the email code instead
              </Button>
              <Button color="inherit" size="small" onClick={restart}>
                Cancel
              </Button>
            </Stack>
          ) : !challenge ? (
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
                label={codeLabel(challenge)}
                required
                autoFocus
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': codeLabel(challenge) } }}
                helperText={codeLeft > 0 ? `The code works for ${formatWait(codeLeft)} more` : 'The code has expired: send a new one'}
              />
              <Button type="submit" variant="contained" size="large" disabled={busy || code.length !== 6}>
                Sign in
              </Button>
              <Button onClick={resend} disabled={busy || resendIn > 0 || lockLeft > 0}>
                {sending ? 'Sending…' : resendIn > 0 ? `Send again in ${resendIn} s` : 'Send again'}
              </Button>
              <Button color="inherit" size="small" onClick={restart}>
                Use another account
              </Button>
            </Stack>
          )}

          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 3, textAlign: 'center' }}>
            A customer?{' '}
            <Link component={RouterLink} to="/login">
              Shop sign in
            </Link>
            . Workers use only the KeyFive Staff app.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}

/** The old address of the Admin sign in still works. */
export const AdminLoginPage = StaffLoginPage
