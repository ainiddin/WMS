import { Alert, Button, Card, CardContent, Chip, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { errorMessage } from '@/api/client'
import { adminApi } from '@/api/endpoints'
import type { Invitation, InvitationStatus } from '@/api/types'
import { ConfirmDialog, EmptyState, PageHeader, QueryState } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { formatDateTime, roleLabel } from '@/format'

const COLOR = { PENDING: 'warning', ACCEPTED: 'success', REVOKED: 'default', EXPIRED: 'error' } as const
const STATUSES: InvitationStatus[] = ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']

/**
 * Managers invite their staff. The Admin sees every invitation, can send one again or revoke it,
 * and invites only the very first Manager of a company that has none.
 */
export function InvitationsPage() {
  const [status, setStatus] = useState<InvitationStatus | ''>('')
  const invitations = useQuery({
    queryKey: ['admin', 'invitations', status],
    queryFn: () => adminApi.invitations(status || undefined),
  })
  const managers = useQuery({
    queryKey: ['admin', 'employees', 'MANAGER'],
    queryFn: () => adminApi.employees({ role: 'MANAGER' }),
    select: (list) => list.filter((e) => e.is_active),
  })
  const queryClient = useQueryClient()
  const notify = useNotify()
  const [busy, setBusy] = useState(false)
  const [revoking, setRevoking] = useState<Invitation | null>(null)

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true)
    try {
      await action()
      notify.success(done)
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      setRevoking(null)
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Invitations"
        subtitle="Staff join only by invitation from a Manager: a Worker into his team, a Manager with a team of his own."
        actions={
          <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value as InvitationStatus | '')} sx={{ minWidth: 160 }}>
            <MenuItem value="">All</MenuItem>
            {STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
        }
      />
      {managers.data && managers.data.length === 0 && <FirstManagerForm />}
      <Card>
        <QueryState isLoading={invitations.isLoading} error={invitations.error}>
          {invitations.data?.length ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Invited</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>By</TableCell>
                    <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Code valid until</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invitations.data.map((inv) => (
                    <TableRow key={inv.id} hover>
                      <TableCell>
                        {inv.full_name}
                        <Typography variant="caption" color="text.secondary" component="div">
                          {inv.email}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {roleLabel[inv.role]}
                        <Typography variant="caption" color="text.secondary" component="div">
                          {inv.team_name ?? 'own new team'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" color={COLOR[inv.status]} label={inv.status} />
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{inv.invited_by_email}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, whiteSpace: 'nowrap' }}>
                        {inv.status === 'PENDING' ? formatDateTime(inv.expires_at) : '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {(inv.status === 'PENDING' || inv.status === 'EXPIRED') && (
                          <Button size="small" disabled={busy} onClick={() => run(() => adminApi.resendInvitation(inv.id), `Invitation sent again to ${inv.email}`)}>
                            Send again
                          </Button>
                        )}
                        {(inv.status === 'PENDING' || inv.status === 'EXPIRED') && (
                          <Button size="small" color="error" disabled={busy} onClick={() => setRevoking(inv)}>
                            Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <EmptyState title="No invitations" text="Managers invite their staff in the KeyFive Staff app." />
          )}
        </QueryState>
      </Card>
      <ConfirmDialog
        open={Boolean(revoking)}
        title={`Revoke the invitation of ${revoking?.full_name}?`}
        text="The code stops working at once. A Manager can invite this person again later."
        confirmLabel="Revoke"
        color="error"
        loading={busy}
        onConfirm={() => revoking && run(() => adminApi.revokeInvitation(revoking.id), 'Invitation revoked')}
        onClose={() => setRevoking(null)}
      />
    </>
  )
}

/** Only shown while there is no active Manager: somebody has to invite the first one. */
export function FirstManagerForm() {
  const queryClient = useQueryClient()
  const notify = useNotify()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const inv = await adminApi.inviteFirstManager(email.trim(), fullName.trim())
      notify.success(`Invitation sent to ${inv.email}`)
      setEmail('')
      setFullName('')
      queryClient.invalidateQueries({ queryKey: ['admin'] })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', mb: 1 }}>
          Invite the first Manager
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          There is no active Manager yet, so nobody can invite staff. Invite one; from then on Managers invite.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack component="form" direction={{ xs: 'column', sm: 'row' }} spacing={2} onSubmit={submit}>
          <TextField label="Full name" required value={fullName} onChange={(e) => setFullName(e.target.value)} sx={{ flex: 1 }} />
          <TextField label="Work email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} sx={{ flex: 1 }} />
          <Button type="submit" variant="contained" disabled={busy || !email.trim() || !fullName.trim()}>
            Invite Manager
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}
