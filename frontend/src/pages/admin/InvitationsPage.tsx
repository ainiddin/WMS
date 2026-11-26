import LinkIcon from '@mui/icons-material/Link'
import { Alert, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage } from '@/api/client'
import { adminApi } from '@/api/endpoints'
import type { Invitation, InvitationCreated, InvitationStatus } from '@/api/types'
import { ConfirmDialog, PageHeader, QueryState } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { t } from '@/i18n'
import { InvitationRows, NewLink } from './invitationParts'

const STATUSES: InvitationStatus[] = ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']

/**
 * Managers invite their staff by one-time links. The Admin sees every link and can revoke it, and makes a link
 * only for the very first Manager of a company that has none.
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

  const revoke = async () => {
    if (!revoking) return
    setBusy(true)
    try {
      await adminApi.revokeInvitation(revoking.id)
      notify.success(t('Invitation revoked'))
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
        title={t('Invitations')}
        subtitle={t('Staff join only by a one-time link from a Manager: a Worker into his team, a Manager with a team of his own.')}
        actions={
          <TextField select size="small" label={t('Status')} value={status} onChange={(e) => setStatus(e.target.value as InvitationStatus | '')} sx={{ minWidth: 160 }}>
            <MenuItem value="">{t('All')}</MenuItem>
            {STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {t(s)}
              </MenuItem>
            ))}
          </TextField>
        }
      />
      {managers.data && managers.data.length === 0 && <FirstManagerLink />}
      <Card>
        <QueryState isLoading={invitations.isLoading} error={invitations.error}>
          <InvitationRows invitations={invitations.data ?? []} busy={busy} onRevoke={setRevoking} showInviter />
        </QueryState>
      </Card>
      <ConfirmDialog
        open={Boolean(revoking)}
        title={t('Revoke this invitation link?')}
        text={t('The link stops working at once.')}
        confirmLabel={t('Revoke')}
        color="error"
        loading={busy}
        onConfirm={revoke}
        onClose={() => setRevoking(null)}
      />
    </>
  )
}

/** No active Manager: the Admin makes the link for the first one (then Managers invite everybody else). */
function FirstManagerLink() {
  const queryClient = useQueryClient()
  const [created, setCreated] = useState<InvitationCreated | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      setCreated(await adminApi.inviteFirstManager())
      queryClient.invalidateQueries({ queryKey: ['admin', 'invitations'] })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">{t('No Manager yet')}</Typography>
          <Typography color="text.secondary">
            {t('The company has no active Manager, so nobody can invite staff. Make a link for the first Manager.')}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <Button variant="contained" startIcon={<LinkIcon />} disabled={busy} onClick={create} sx={{ alignSelf: 'flex-start' }}>
            {t('Invite the first Manager')}
          </Button>
          {created && <NewLink path={created.link} expiresAt={created.expires_at} />}
        </Stack>
      </CardContent>
    </Card>
  )
}
