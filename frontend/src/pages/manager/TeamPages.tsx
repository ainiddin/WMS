import { Alert, Button, Card, CardContent, Chip, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { errorMessage } from '@/api/client'
import { teamApi, type TeamMember } from '@/api/staff'
import type { DeviceStatus, Invitation, StaffDevice } from '@/api/types'
import { ConfirmDialog, EmptyState, PageHeader, QueryState } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { formatDateTime, roleLabel } from '@/format'
import { Section, UserStatusChip } from '@/pages/admin/parts'

function useRun() {
  const queryClient = useQueryClient()
  const notify = useNotify()
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true)
    try {
      await action()
      notify.success(done)
      queryClient.invalidateQueries({ queryKey: ['team'] })
      return true
    } catch (e) {
      notify.error(e)
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

const DEVICE_LABEL: Record<DeviceStatus, string> = { PENDING: 'Waiting', APPROVED: 'Approved', REVOKED: 'Blocked' }
const DEVICE_COLOR = { PENDING: 'warning', APPROVED: 'success', REVOKED: 'error' } as const

/** The Workers of my team and their phones. A Manager sees nobody else. */
export function TeamPage() {
  const members = useQuery({ queryKey: ['team', 'members'], queryFn: teamApi.members })
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | 'ALL'>('PENDING')
  const devices = useQuery({
    queryKey: ['team', 'devices', deviceStatus],
    queryFn: () => teamApi.devices(deviceStatus === 'ALL' ? undefined : deviceStatus),
  })
  const { busy, run } = useRun()
  const [blocking, setBlocking] = useState<TeamMember | null>(null)
  const [revoking, setRevoking] = useState<StaffDevice | null>(null)
  const unblock = blocking?.status === 'BLOCKED'

  return (
    <>
      <PageHeader title="My team" subtitle="Only the Workers of your team. Blocking signs a person out at once; the history stays." />
      <Stack spacing={3}>
        <Section title="Members">
          <QueryState isLoading={members.isLoading} error={members.error}>
            {members.data?.length ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Worker</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Joined</TableCell>
                      <TableCell align="right" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {members.data.map((m) => (
                      <TableRow key={m.user_id} hover>
                        <TableCell>
                          {m.full_name}
                          <Typography variant="caption" color="text.secondary" component="div">
                            {m.code} · {m.email}
                            {m.phone ? ` · ${m.phone}` : ''}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <UserStatusChip status={m.status} />
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, whiteSpace: 'nowrap' }}>
                          {formatDateTime(m.created_at)}
                        </TableCell>
                        <TableCell align="right">
                          {(m.status === 'ACTIVE' || m.status === 'BLOCKED') && (
                            <Button size="small" color={m.status === 'BLOCKED' ? 'success' : 'error'} disabled={busy}
                              onClick={() => setBlocking(m)}>
                              {m.status === 'BLOCKED' ? 'Unblock' : 'Block'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <EmptyState title="No Workers in your team yet" text="Invite them in Invitations." />
            )}
          </QueryState>
        </Section>

        <Section
          title="Their phones"
          action={
            <ToggleButtonGroup size="small" exclusive value={deviceStatus} onChange={(_, v) => v && setDeviceStatus(v)} aria-label="Phone status">
              <ToggleButton value="PENDING">Waiting</ToggleButton>
              <ToggleButton value="APPROVED">Approved</ToggleButton>
              <ToggleButton value="REVOKED">Blocked</ToggleButton>
              <ToggleButton value="ALL">All</ToggleButton>
            </ToggleButtonGroup>
          }
        >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Approve a phone only after the person confirms it is theirs. An unexpected request means their password leaked.
          </Typography>
          <QueryState isLoading={devices.isLoading} error={devices.error}>
            {devices.data?.length ? (
              <TableContainer>
                <Table size="small">
                  <TableBody>
                    {devices.data.map((d) => (
                      <TableRow key={d.id} hover>
                        <TableCell>
                          {d.device_name}
                          <Typography variant="caption" color="text.secondary" component="div">
                            {d.user_full_name} · requested {formatDateTime(d.created_at)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" variant="outlined" color={DEVICE_COLOR[d.status]} label={DEVICE_LABEL[d.status]} />
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {d.status !== 'APPROVED' && (
                            <Button size="small" color="success" disabled={busy}
                              onClick={() => run(() => teamApi.approveDevice(d.id), 'Phone approved')}>
                              Approve
                            </Button>
                          )}
                          {d.status !== 'REVOKED' && (
                            <Button size="small" color="error" disabled={busy} onClick={() => setRevoking(d)}>
                              Block
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <EmptyState title={deviceStatus === 'PENDING' ? 'No phones waiting' : 'No phones'} />
            )}
          </QueryState>
        </Section>
      </Stack>

      <ConfirmDialog
        open={Boolean(blocking)}
        title={unblock ? `Unblock ${blocking?.full_name}?` : `Block ${blocking?.full_name}?`}
        text={unblock ? 'The person will be able to sign in again.' : 'The person is signed out at once and cannot sign in.'}
        confirmLabel={unblock ? 'Unblock' : 'Block'}
        color={unblock ? 'success' : 'error'}
        loading={busy}
        onConfirm={async () => {
          if (!blocking) return
          const ok = await run(() => (unblock ? teamApi.unblock(blocking.user_id) : teamApi.block(blocking.user_id)),
            `${blocking.full_name} ${unblock ? 'unblocked' : 'blocked'}`)
          if (ok) setBlocking(null)
        }}
        onClose={() => setBlocking(null)}
      />
      <ConfirmDialog
        open={Boolean(revoking)}
        title="Block this phone?"
        text={revoking ? `${revoking.device_name} of ${revoking.user_full_name} is signed out at once.` : undefined}
        confirmLabel="Block"
        color="error"
        loading={busy}
        onConfirm={async () => {
          if (revoking && (await run(() => teamApi.revokeDevice(revoking.id), 'Phone blocked'))) setRevoking(null)
        }}
        onClose={() => setRevoking(null)}
      />
    </>
  )
}

const INVITE_COLOR = { PENDING: 'warning', ACCEPTED: 'success', REVOKED: 'default', EXPIRED: 'error' } as const

/** Invite a Worker into my team, or a Manager (who gets his own team). Never above my rank. */
export function ManagerInvitationsPage() {
  const invitations = useQuery({ queryKey: ['team', 'invitations'], queryFn: teamApi.invitations })
  const { busy, run } = useRun()
  const notify = useNotify()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'WORKER' | 'MANAGER'>('WORKER')
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<Invitation | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const inv = await teamApi.invite(email.trim(), fullName.trim(), role)
      notify.success(`Invitation sent to ${inv.email}`)
      setEmail('')
      setFullName('')
      await invitations.refetch()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const open = (status: Invitation['status']) => status === 'PENDING' || status === 'EXPIRED'

  return (
    <>
      <PageHeader title="Invitations" subtitle="Staff join only by invitation. The person gets a code by email and joins in the KeyFive Staff app." />
      <Card sx={{ mb: 3 }}>
        <CardContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Stack component="form" direction={{ xs: 'column', md: 'row' }} spacing={2} onSubmit={submit}>
            <TextField select label="Role" value={role} onChange={(e) => setRole(e.target.value as 'WORKER' | 'MANAGER')} sx={{ minWidth: 220 }}>
              <MenuItem value="WORKER">Worker (joins my team)</MenuItem>
              <MenuItem value="MANAGER">Manager (gets own team)</MenuItem>
            </TextField>
            <TextField label="Full name" required value={fullName} onChange={(e) => setFullName(e.target.value)} sx={{ flex: 1 }} />
            <TextField label="Work email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} sx={{ flex: 1 }} />
            <Button type="submit" variant="contained" disabled={busy || !email.includes('@') || !fullName.trim()}>
              Send invitation
            </Button>
          </Stack>
        </CardContent>
      </Card>
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
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Code valid until</TableCell>
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
                      <TableCell>{roleLabel[inv.role]}</TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" color={INVITE_COLOR[inv.status]} label={inv.status} />
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, whiteSpace: 'nowrap' }}>
                        {inv.status === 'PENDING' ? formatDateTime(inv.expires_at) : '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {open(inv.status) && (
                          <>
                            <Button size="small" disabled={busy}
                              onClick={() => run(() => teamApi.resendInvitation(inv.id), `Sent again to ${inv.email}`)}>
                              Send again
                            </Button>
                            <Button size="small" color="error" disabled={busy} onClick={() => setRevoking(inv)}>
                              Revoke
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <EmptyState title="No invitations yet" />
          )}
        </QueryState>
      </Card>
      <ConfirmDialog
        open={Boolean(revoking)}
        title={`Revoke the invitation of ${revoking?.full_name}?`}
        text="The code stops working at once."
        confirmLabel="Revoke"
        color="error"
        loading={busy}
        onConfirm={async () => {
          if (revoking && (await run(() => teamApi.revokeInvitation(revoking.id), 'Invitation revoked'))) setRevoking(null)
        }}
        onClose={() => setRevoking(null)}
      />
    </>
  )
}
