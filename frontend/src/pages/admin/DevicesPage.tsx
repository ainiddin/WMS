import { Button, Card, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { adminApi } from '@/api/endpoints'
import type { DeviceStatus, StaffDevice } from '@/api/types'
import { ConfirmDialog, EmptyState, PageHeader, QueryState } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { formatDateTime, roleLabel } from '@/format'

const LABEL: Record<DeviceStatus, string> = { PENDING: 'Waiting', APPROVED: 'Approved', REVOKED: 'Blocked' }
const COLOR = { PENDING: 'warning', APPROVED: 'success', REVOKED: 'error' } as const

/** Phones staff signed in from. A new phone waits here; blocking one signs it out at once. */
export function DevicesPage() {
  const [status, setStatus] = useState<DeviceStatus | 'ALL'>('PENDING')
  const devices = useQuery({
    queryKey: ['admin', 'devices', status],
    queryFn: () => adminApi.devices(status === 'ALL' ? undefined : status),
  })
  const queryClient = useQueryClient()
  const notify = useNotify()
  const [busy, setBusy] = useState(false)
  const [revoking, setRevoking] = useState<StaffDevice | null>(null)

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
        title="Staff phones"
        subtitle="Staff work only on phones approved here. Approve a phone only after the employee confirms it is theirs."
        actions={
          <ToggleButtonGroup size="small" exclusive value={status} onChange={(_, v) => v && setStatus(v)} aria-label="Status">
            <ToggleButton value="PENDING">Waiting</ToggleButton>
            <ToggleButton value="APPROVED">Approved</ToggleButton>
            <ToggleButton value="REVOKED">Blocked</ToggleButton>
            <ToggleButton value="ALL">All</ToggleButton>
          </ToggleButtonGroup>
        }
      />
      <Card>
        <QueryState isLoading={devices.isLoading} error={devices.error}>
          {devices.data?.length ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Phone</TableCell>
                    <TableCell>Employee</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Last seen</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {devices.data.map((d) => (
                    <TableRow key={d.id} hover>
                      <TableCell>
                        {d.device_name}
                        <Typography variant="caption" color="text.secondary" component="div">
                          requested {formatDateTime(d.created_at)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {d.user_full_name}
                        <Typography variant="caption" color="text.secondary" component="div">
                          {roleLabel[d.user_role]} · {d.user_email}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5}>
                          <Chip size="small" variant="outlined" color={COLOR[d.status]} label={LABEL[d.status]} />
                          {d.current && <Chip size="small" color="success" label="This phone" />}
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, whiteSpace: 'nowrap' }}>
                        {formatDateTime(d.last_seen_at)}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {d.status !== 'APPROVED' && (
                          <Button size="small" color="success" disabled={busy}
                            onClick={() => run(() => adminApi.approveDevice(d.id), 'Phone approved')}>
                            Approve
                          </Button>
                        )}
                        {d.status !== 'REVOKED' && !d.current && (
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
            <EmptyState title="No phones here" text={status === 'PENDING' ? 'New phone requests will appear here.' : undefined} />
          )}
        </QueryState>
      </Card>
      <ConfirmDialog
        open={Boolean(revoking)}
        title="Block this phone?"
        text={revoking ? `${revoking.device_name} of ${revoking.user_full_name} is signed out at once and cannot sign in again.` : undefined}
        confirmLabel="Block"
        color="error"
        loading={busy}
        onConfirm={() => revoking && run(() => adminApi.revokeDevice(revoking.id), 'Phone blocked')}
        onClose={() => setRevoking(null)}
      />
    </>
  )
}
