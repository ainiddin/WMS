import { Alert, Button, Card, CardContent, Stack, TextField } from '@mui/material'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { errorMessage } from '@/api/client'
import { adminAuthApi } from '@/api/endpoints'
import { useAuth } from '@/auth/AuthContext'
import { PageHeader } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { formatDate } from '@/format'
import { passwordExpired } from './AdminLayout'

/** Change the Admin password. Required every 180 days; the new one must differ from the previous. */
export function PasswordPage() {
  const { user, acceptTokens } = useAuth()
  const navigate = useNavigate()
  const notify = useNotify()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const expired = passwordExpired(user?.password_expires_at)

  const mismatch = repeat.length > 0 && next !== repeat
  const tooShort = next.length > 0 && next.length < 8
  const same = next.length > 0 && next === current

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const pair = await adminAuthApi.changePassword(current, next)
      acceptTokens(pair) // the old tokens no longer work: every other session is signed out
      setCurrent('')
      setNext('')
      setRepeat('')
      notify.success('Password changed. Other sessions were signed out.')
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Change password"
        subtitle={user?.password_expires_at ? `Current password valid until ${formatDate(user.password_expires_at)}` : undefined}
      />
      <Card sx={{ maxWidth: 480 }}>
        <CardContent>
          <Stack component="form" spacing={2} onSubmit={submit}>
            {expired && (
              <Alert severity="warning">Your password has expired. Change it to continue working.</Alert>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Current password"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              value={next}
              onChange={(e) => setNext(e.target.value)}
              error={tooShort || same}
              helperText={same ? 'Must differ from the current password' : tooShort ? 'At least 8 characters' : ' '}
            />
            <TextField
              label="Repeat the new password"
              type="password"
              autoComplete="new-password"
              required
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              error={mismatch}
              helperText={mismatch ? 'The passwords do not match' : ' '}
            />
            <Button type="submit" variant="contained" disabled={busy || !current || next.length < 8 || next !== repeat || same}>
              Change password
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </>
  )
}
