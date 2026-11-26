import LinkIcon from '@mui/icons-material/Link'
import { Alert, Button, Card, CardContent, Chip, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage } from '@/api/client'
import { teamApi, type TeamMember } from '@/api/staff'
import type { DeviceStatus, Invitation, InvitationCreated, StaffDevice } from '@/api/types'
import { ConfirmDialog, EmptyState, PageHeader, QueryState } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { formatDateTime } from '@/format'
import { InvitationRows, NewLink } from '@/pages/admin/invitationParts'
import { Section, UserStatusChip } from '@/pages/admin/parts'

import { t } from '@/i18n'
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

const DEVICE_LABEL: Record<DeviceStatus, string> = { PENDING: 'Waiting', APPROVED: 'Approved', REVOKED: 'Blocked' } // t() keys
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
      <PageHeader title={t('My team')} subtitle={t('Only the Workers of your team. Blocking signs a person out at once; the history stays.')} />
      <Stack spacing={3}>
        <Section title={t('Members')}>
          <QueryState isLoading={members.isLoading} error={members.error}>
            {members.data?.length ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('Worker')}</TableCell>
                      <TableCell>{t('Status')}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{t('Joined')}</TableCell>
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
                              {m.status === 'BLOCKED' ? t('Unblock') : t('Block')}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <EmptyState title={t('No Workers in your team yet')} text={t('Invite them in Invitations.')} />
            )}
          </QueryState>
        </Section>

        <Section
          title={t('Their phones')}
          action={
            <ToggleButtonGroup size="small" exclusive value={deviceStatus} onChange={(_, v) => v && setDeviceStatus(v)} aria-label={t('Phone status')}>
              <ToggleButton value="PENDING">{t('Waiting')}</ToggleButton>
              <ToggleButton value="APPROVED">{t('Approved')}</ToggleButton>
              <ToggleButton value="REVOKED">{t('Blocked')}</ToggleButton>
              <ToggleButton value="ALL">{t('All')}</ToggleButton>
            </ToggleButtonGroup>
          }
        >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('Approve a phone only after the person confirms it is theirs. An unexpected request means their password leaked.')}
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
                            {d.user_full_name} · {t('requested {0}', formatDateTime(d.created_at))}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" variant="outlined" color={DEVICE_COLOR[d.status]} label={t(DEVICE_LABEL[d.status])} />
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {d.status !== 'APPROVED' && (
                            <Button size="small" color="success" disabled={busy}
                              onClick={() => run(() => teamApi.approveDevice(d.id), t('Phone approved'))}>
                              {t('Approve')}
                            </Button>
                          )}
                          {d.status !== 'REVOKED' && (
                            <Button size="small" color="error" disabled={busy} onClick={() => setRevoking(d)}>
                              {t('Block')}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <EmptyState title={deviceStatus === 'PENDING' ? t('No phones waiting') : t('No phones')} />
            )}
          </QueryState>
        </Section>
      </Stack>

      <ConfirmDialog
        open={Boolean(blocking)}
        title={unblock ? t('Unblock {0}?', blocking?.full_name) : t('Block {0}?', blocking?.full_name)}
        text={unblock ? t('The person will be able to sign in again.') : t('The person is signed out at once and cannot sign in.')}
        confirmLabel={unblock ? t('Unblock') : t('Block')}
        color={unblock ? 'success' : 'error'}
        loading={busy}
        onConfirm={async () => {
          if (!blocking) return
          const ok = await run(() => (unblock ? teamApi.unblock(blocking.user_id) : teamApi.block(blocking.user_id)),
            unblock ? t('{0} unblocked', blocking.full_name) : t('{0} blocked', blocking.full_name))
          if (ok) setBlocking(null)
        }}
        onClose={() => setBlocking(null)}
      />
      <ConfirmDialog
        open={Boolean(revoking)}
        title={t('Block this phone?')}
        text={revoking ? t('{0} of {1} is signed out at once.', revoking.device_name, revoking.user_full_name) : undefined}
        confirmLabel={t('Block')}
        color="error"
        loading={busy}
        onConfirm={async () => {
          if (revoking && (await run(() => teamApi.revokeDevice(revoking.id), t('Phone blocked')))) setRevoking(null)
        }}
        onClose={() => setRevoking(null)}
      />
    </>
  )
}

/** Invite a Worker into my team, or a Manager (who gets his own team), by a one-time link. Never above my rank. */
export function ManagerInvitationsPage() {
  const invitations = useQuery({ queryKey: ['team', 'invitations'], queryFn: teamApi.invitations })
  const { busy, run } = useRun()
  const [role, setRole] = useState<'WORKER' | 'MANAGER'>('WORKER')
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<InvitationCreated | null>(null)
  const [revoking, setRevoking] = useState<Invitation | null>(null)

  const create = async () => {
    setError(null)
    try {
      setCreated(await teamApi.invite(role))
      await invitations.refetch()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title={t('Invitations')}
        subtitle={t('Make a link and send it to the person. They type their name, work email, phone and a password, get an employee id and sign in in the KeyFive Staff app; you approve their phone.')}
      />
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField select label={t('Role')} value={role} onChange={(e) => setRole(e.target.value as 'WORKER' | 'MANAGER')} sx={{ minWidth: 240 }}>
                <MenuItem value="WORKER">{t('Worker (joins my team)')}</MenuItem>
                <MenuItem value="MANAGER">{t('Manager (gets own team)')}</MenuItem>
              </TextField>
              <Button variant="contained" startIcon={<LinkIcon />} disabled={busy} onClick={create}>
                {t('Create invitation link')}
              </Button>
            </Stack>
            {created && <NewLink path={created.link} expiresAt={created.expires_at} />}
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <QueryState isLoading={invitations.isLoading} error={invitations.error}>
          <InvitationRows invitations={invitations.data ?? []} busy={busy} onRevoke={setRevoking} />
        </QueryState>
      </Card>
      <ConfirmDialog
        open={Boolean(revoking)}
        title={t('Revoke this invitation link?')}
        text={t('The link stops working at once.')}
        confirmLabel={t('Revoke')}
        color="error"
        loading={busy}
        onConfirm={async () => {
          if (revoking && (await run(() => teamApi.revokeInvitation(revoking.id), t('Invitation revoked')))) setRevoking(null)
        }}
        onClose={() => setRevoking(null)}
      />
    </>
  )
}
