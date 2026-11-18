import { Button, Card, CardContent, Chip, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { adminApi, type AuditFilters } from '@/api/endpoints'
import type { AuditAction, AuditRow } from '@/api/types'
import { EmptyState, PageHeader, QueryState } from '@/components/common'
import { formatDateTime } from '@/format'

export const ACTION_LABEL: Record<AuditAction, string> = {
  USER_APPROVED: 'Account approved',
  USER_REJECTED: 'Account rejected',
  USER_BLOCKED: 'Account blocked',
  USER_UNBLOCKED: 'Account unblocked',
  ROLE_CHANGED: 'Role changed',
  TEAM_CHANGED: 'Team changed',
  LOGIN_TIMER_CLEARED: 'Login timer cleared',
  DEVICE_APPROVED: 'Phone approved',
  DEVICE_REVOKED: 'Phone blocked',
  TWO_FACTOR_CODE_SENT: 'Admin code sent',
  TWO_FACTOR_FAILED: 'Wrong admin code',
  TWO_FACTOR_PASSED: 'Admin signed in',
  PASSWORD_CHANGED: 'Password changed',
  INVITE_SENT: 'Invitation sent',
  INVITE_RESENT: 'Invitation sent again',
  INVITE_REVOKED: 'Invitation revoked',
  INVITE_ACCEPTED: 'Joined by invitation',
  INVITE_CODE_FAILED: 'Wrong invitation code',
}

const DANGER: AuditAction[] = ['TWO_FACTOR_FAILED', 'INVITE_CODE_FAILED', 'USER_BLOCKED', 'DEVICE_REVOKED']
const PAGE = 50

/** The details object as short "key: value" text; values are data from the server, shown as plain text. */
export function detailsText(details: Record<string, unknown>): string {
  return Object.entries(details)
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value === null ? '—' : String(value)}`)
    .join(' · ')
}

/** Who did what to whom, when, from which IP. Read-only: nobody can change or delete a row. */
export function AuditPage() {
  const [action, setAction] = useState<AuditAction | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const filters: AuditFilters = {
    action: action || undefined,
    date_from: from || undefined,
    date_to: to || undefined,
    limit: PAGE,
    offset: page * PAGE,
  }
  const rows = useQuery({
    queryKey: ['admin', 'audit', filters],
    queryFn: () => adminApi.audit(filters),
    placeholderData: keepPreviousData,
  })
  const badRange = Boolean(from && to && from > to)

  const change = (fn: () => void) => {
    fn()
    setPage(0)
  }

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every admin action and Admin sign in. Rows cannot be changed or deleted." />
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField select label="Action" value={action} onChange={(e) => change(() => setAction(e.target.value as AuditAction | ''))} sx={{ minWidth: 220 }}>
              <MenuItem value="">All actions</MenuItem>
              {(Object.keys(ACTION_LABEL) as AuditAction[]).map((a) => (
                <MenuItem key={a} value={a}>
                  {ACTION_LABEL[a]}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="From" type="date" value={from} onChange={(e) => change(() => setFrom(e.target.value))} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField
              label="To"
              type="date"
              value={to}
              onChange={(e) => change(() => setTo(e.target.value))}
              slotProps={{ inputLabel: { shrink: true } }}
              error={badRange}
              helperText={badRange ? '"From" is after "To"' : ' '}
            />
          </Stack>
          {badRange ? null : (
            <QueryState isLoading={rows.isLoading} error={rows.error}>
              {rows.data?.length ? (
                <AuditTable rows={rows.data} />
              ) : (
                <EmptyState title="Nothing logged for these filters" />
              )}
            </QueryState>
          )}
          <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: 'flex-end', alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              Page {page + 1}
            </Typography>
            <Button size="small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Newer
            </Button>
            <Button size="small" disabled={(rows.data?.length ?? 0) < PAGE} onClick={() => setPage((p) => p + 1)}>
              Older
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </>
  )
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>When</TableCell>
            <TableCell>Action</TableCell>
            <TableCell>Who</TableCell>
            <TableCell>To whom</TableCell>
            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>IP</TableCell>
            <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Details</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} hover>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.created_at)}</TableCell>
              <TableCell>
                <Chip size="small" variant="outlined" color={DANGER.includes(r.action) ? 'error' : 'default'} label={ACTION_LABEL[r.action] ?? r.action} />
              </TableCell>
              <TableCell>{r.actor_email ?? 'system'}</TableCell>
              <TableCell>{r.target_email ?? '—'}</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{r.ip ?? '—'}</TableCell>
              <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>
                <Typography variant="caption" color="text.secondary">
                  {detailsText(r.details)}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
