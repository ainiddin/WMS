import HourglassTopIcon from '@mui/icons-material/HourglassTop'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link as RouterLink, Navigate, useLocation, useNavigate } from 'react-router'
import { errorMessage, statusOf } from '@/api/client'
import { authApi } from '@/api/endpoints'
import { homePath, useAuth } from '@/auth/AuthContext'
import { ThemeToggle } from '@/components/Layout'
import { PHONE_HINT, phoneError } from '@/format'

const RESEND_SECONDS = 60

/** "Send code" button + code input. The emailed code proves that the address exists and belongs to the user. */
function EmailCodeField({ email, code, onCode }: { email: string; code: string; onCode: (code: string) => void }) {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [wait, setWait] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  const normalized = email.trim().toLowerCase()
  const sent = sentTo === normalized // editing the email after sending asks for a new code
  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      await authApi.sendCode(normalized)
      setSentTo(normalized)
      setWait(RESEND_SECONDS)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <TextField
          label="Code from email"
          required
          disabled={!sent}
          value={code}
          onChange={(e) => onCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          autoComplete="one-time-code"
          sx={{ flex: 1 }}
          helperText={sent ? `Sent to ${sentTo}. Check the spam folder too.` : 'We email a 6-digit code to confirm the address'}
          slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6 } }}
        />
        <Button
          variant="outlined"
          onClick={send}
          disabled={busy || !/^\S+@\S+\.\S+$/.test(normalized) || (sent && wait > 0)}
          sx={{ height: 56, minWidth: 120, whiteSpace: 'nowrap' }}
        >
          {sent ? (wait > 0 ? `Resend (${wait})` : 'Resend') : 'Send code'}
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  )
}

function PhoneField({ value, onChange }: { value: string; onChange: React.ChangeEventHandler<HTMLInputElement> }) {
  const error = phoneError(value)
  return (
    <TextField
      label="Phone"
      type="tel"
      value={value}
      onChange={onChange}
      autoComplete="tel"
      placeholder={PHONE_HINT}
      error={!!error}
      helperText={error ?? 'Optional'}
    />
  )
}

/** Checks shared by both sign-up forms. Returns an error message or null. */
function signUpError(form: { code: string; phone: string; password: string; confirm: string }) {
  if (!/^\d{6}$/.test(form.code)) return 'Enter the 6-digit code from the email'
  if (form.password !== form.confirm) return 'Passwords do not match'
  return phoneError(form.phone)
}

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', px: 2, py: 4, bgcolor: 'background.default' }}>
      <Box sx={{ position: 'fixed', top: 8, right: 8 }}>
        <ThemeToggle />
      </Box>
      <Box sx={{ width: '100%', maxWidth: 420 }}>
        <Stack
          component={RouterLink}
          to="/"
          direction="row"
          spacing={1}
          sx={{ mb: 3, justifyContent: 'center', alignItems: 'center', color: 'text.primary', textDecoration: 'none' }}
        >
          <Box component="img" src="/favicon.svg" alt="" sx={{ width: 36, height: 36 }} />
          <Typography variant="h5">KeyFive WMS</Typography>
        </Stack>
        <Card>
          <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Typography variant="h6" component="h1">
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1 }}>
                {subtitle}
              </Typography>
            )}
            <Box sx={{ mt: 2 }}>{children}</Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}

export function LoginPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={from ?? homePath(user.role)} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const u = await login(email, password)
      navigate(from ?? (u.role === 'CUSTOMER' ? '/' : homePath(u.role)), { replace: true })
    } catch (err) {
      const message = errorMessage(err)
      // Staff accounts waiting for the admin get their own page.
      if (statusOf(err) === 403 && message.includes('waiting')) navigate('/waiting', { state: { email } })
      else setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Sign in" subtitle="Customers and warehouse staff use the same login.">
      <Stack component="form" spacing={2} onSubmit={submit}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          size="medium"
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          size="medium"
        />
        <Button type="submit" variant="contained" size="large" disabled={busy} startIcon={<LockOutlinedIcon />}>
          Sign in
        </Button>
        <Typography variant="body2" sx={{ textAlign: 'center' }}>
          New customer?{' '}
          <Link component={RouterLink} to="/signup">
            Create an account
          </Link>
        </Typography>
        <Typography variant="body2" sx={{ textAlign: 'center' }}>
          Joining the warehouse team?{' '}
          <Link component={RouterLink} to="/staff-signup">
            Staff sign up
          </Link>
        </Typography>
      </Stack>
    </AuthCard>
  )
}

export function SignUpPage() {
  const { acceptTokens } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ full_name: '', email: '', code: '', phone: '', address: '', password: '', confirm: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const invalid = signUpError(form)
    if (invalid) return setError(invalid)
    setBusy(true)
    setError(null)
    try {
      const pair = await authApi.register({
        email: form.email,
        code: form.code,
        password: form.password,
        full_name: form.full_name,
        phone: form.phone || undefined,
        address: form.address || undefined,
      })
      acceptTokens(pair) // customers are signed in right away
      navigate('/catalog', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Create a customer account" subtitle="Shop household goods and track your orders.">
      <Stack component="form" spacing={2} onSubmit={submit}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Full name" required value={form.full_name} onChange={set('full_name')} autoComplete="name" />
        <TextField label="Email" type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
        <EmailCodeField email={form.email} code={form.code} onCode={(code) => setForm((f) => ({ ...f, code }))} />
        <PhoneField value={form.phone} onChange={set('phone')} />
        <TextField
          label="Delivery address"
          value={form.address}
          onChange={set('address')}
          autoComplete="street-address"
          placeholder="City, street, building, apartment"
        />
        <TextField
          label="Password"
          type="password"
          required
          value={form.password}
          onChange={set('password')}
          autoComplete="new-password"
          helperText="At least 8 characters"
          slotProps={{ htmlInput: { minLength: 8 } }}
        />
        <TextField label="Repeat password" type="password" required value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
        <Button type="submit" variant="contained" size="large" disabled={busy}>
          Sign up
        </Button>
        <Typography variant="body2" sx={{ textAlign: 'center' }}>
          Already have an account?{' '}
          <Link component={RouterLink} to="/login">
            Sign in
          </Link>
        </Typography>
      </Stack>
    </AuthCard>
  )
}

export function StaffSignUpPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    code: '',
    phone: '',
    password: '',
    confirm: '',
    requested_role: 'WORKER' as 'WORKER' | 'MANAGER',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const invalid = signUpError(form)
    if (invalid) return setError(invalid)
    setBusy(true)
    setError(null)
    try {
      await authApi.registerStaff({
        email: form.email,
        code: form.code,
        password: form.password,
        full_name: form.full_name,
        phone: form.phone || undefined,
        requested_role: form.requested_role,
      })
      navigate('/waiting', { replace: true, state: { email: form.email, justRegistered: true } })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard
      title="Staff sign up"
      subtitle="For Managers and Workers. You can sign in after an administrator approves your account."
    >
      <Stack component="form" spacing={2} onSubmit={submit}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Full name" required value={form.full_name} onChange={set('full_name')} autoComplete="name" />
        <TextField label="Work email" type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
        <EmailCodeField email={form.email} code={form.code} onCode={(code) => setForm((f) => ({ ...f, code }))} />
        <PhoneField value={form.phone} onChange={set('phone')} />
        <TextField select label="I am joining as" value={form.requested_role} onChange={set('requested_role')}>
          <MenuItem value="WORKER">Worker</MenuItem>
          <MenuItem value="MANAGER">Manager</MenuItem>
        </TextField>
        <TextField
          label="Password"
          type="password"
          required
          value={form.password}
          onChange={set('password')}
          autoComplete="new-password"
          helperText="At least 8 characters"
          slotProps={{ htmlInput: { minLength: 8 } }}
        />
        <TextField label="Repeat password" type="password" required value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
        <Button type="submit" variant="contained" size="large" disabled={busy}>
          Send request
        </Button>
        <Typography variant="body2" sx={{ textAlign: 'center' }}>
          <Link component={RouterLink} to="/login">
            Back to sign in
          </Link>
        </Typography>
      </Stack>
    </AuthCard>
  )
}

export function WaitingApprovalPage() {
  const state = useLocation().state as { email?: string; justRegistered?: boolean } | null
  return (
    <AuthCard title="Waiting for approval">
      <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
        <HourglassTopIcon color="warning" sx={{ fontSize: 56 }} />
        <Typography>
          {state?.justRegistered ? 'Your request was sent. ' : ''}
          The account {state?.email ? <b>{state.email}</b> : ''} is waiting for admin approval.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The administrator will set your role and team. After that you can sign in with the same email and password.
        </Typography>
        <Button component={RouterLink} to="/login" variant="outlined">
          Back to sign in
        </Button>
      </Stack>
    </AuthCard>
  )
}

export function ErrorPage({ code }: { code: 403 | 404 }) {
  const { user } = useAuth()
  return (
    <AuthCard title={code === 403 ? 'Access denied' : 'Page not found'}>
      <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
        <Typography variant="h2" color="text.secondary">
          {code}
        </Typography>
        <Typography color="text.secondary">
          {code === 403 ? 'Your role does not have access to this page.' : 'This page does not exist.'}
        </Typography>
        <Button component={RouterLink} to={user ? homePath(user.role) : '/'} variant="contained">
          Go to start page
        </Button>
      </Stack>
    </AuthCard>
  )
}
