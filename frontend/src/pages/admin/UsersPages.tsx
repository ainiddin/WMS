import BlockIcon from '@mui/icons-material/Block'
import CheckIcon from '@mui/icons-material/Check'
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import LockResetIcon from '@mui/icons-material/LockReset'
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined'
import SearchIcon from '@mui/icons-material/Search'
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage } from '@/api/client'
import { adminApi } from '@/api/endpoints'
import type { AdminUser, Employee, Role, UserStatus } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import { ConfirmDialog, EmptyState, PageHeader, QueryState } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { formatDateTime, roleLabel } from '@/format'
import { formatWait, UserStatusChip } from './parts'

import { t } from '@/i18n'
function useManagers() {
  return useQuery({
    queryKey: ['admin', 'employees', 'MANAGER'],
    queryFn: () => adminApi.employees({ role: 'MANAGER' }),
    select: (list) => list.filter((e) => e.is_active),
  })
}

function useRefreshAdmin() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['admin'] })
    queryClient.invalidateQueries({ queryKey: ['performance'] })
    queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
  }
}

function ManagerSelect({ value, onChange, managers, exclude }: {
  value: number | ''
  onChange: (id: number) => void
  managers: Employee[]
  exclude?: number | null
}) {
  return (
    <TextField
      select
      required
      fullWidth
      label={t('Team (Manager)')}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      helperText={managers.length ? t("A Worker always belongs to one Manager's team") : t('Approve a Manager first')}
    >
      {managers
        .filter((m) => m.id !== exclude)
        .map((m) => (
          <MenuItem key={m.id} value={m.id}>
            {m.team_name} — {m.full_name} ({m.code})
          </MenuItem>
        ))}
    </TextField>
  )
}

/** Approve dialog: the Admin sets the final role and, for a Worker, the team. */
function ApproveDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const managers = useManagers()
  const refresh = useRefreshAdmin()
  const notify = useNotify()
  const [role, setRole] = useState<'MANAGER' | 'WORKER'>(user.requested_role === 'MANAGER' ? 'MANAGER' : 'WORKER')
  const [managerId, setManagerId] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const approve = async () => {
    setBusy(true)
    setError(null)
    try {
      const u = await adminApi.approve(user.id, role, role === 'WORKER' ? Number(managerId) || null : null)
      notify.success(t('{0} approved as {1} ({2})', u.full_name, roleLabel[u.role], u.employee?.code))
      refresh()
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Approve {0}', user.full_name)}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2" color="text.secondary">
            {t('{0} asked to join as {1}. You can change the role.', user.email, user.requested_role ? roleLabel[user.requested_role] : '—')}
          </Typography>
          <TextField select label={t('Role')} value={role} onChange={(e) => setRole(e.target.value as 'MANAGER' | 'WORKER')}>
            <MenuItem value="WORKER">{t('Worker')}</MenuItem>
            <MenuItem value="MANAGER">{t('Manager (gets own team)')}</MenuItem>
          </TextField>
          {role === 'WORKER' && <ManagerSelect value={managerId} onChange={setManagerId} managers={managers.data ?? []} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button
          variant="contained"
          color="success"
          startIcon={<CheckIcon />}
          disabled={busy || (role === 'WORKER' && !managerId)}
          onClick={approve}
        >
          {t('Approve')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ---------------- Users ----------------
function RoleDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const managers = useManagers()
  const refresh = useRefreshAdmin()
  const notify = useNotify()
  const [role, setRole] = useState<'ADMIN' | 'MANAGER' | 'WORKER'>(user.role === 'CUSTOMER' ? 'WORKER' : user.role)
  const [managerId, setManagerId] = useState<number | ''>(user.employee?.manager_id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const onlyTeamChange = user.role === 'WORKER' && role === 'WORKER'

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      if (onlyTeamChange && user.employee) {
        await adminApi.changeTeam(user.employee.id, Number(managerId))
        notify.success(t('{0} moved to another team', user.full_name))
      } else {
        const u = await adminApi.changeRole(user.id, role, role === 'WORKER' ? Number(managerId) || null : null)
        notify.success(t('{0} is now {1}', u.full_name, roleLabel[u.role]))
      }
      refresh()
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Role and team · {0}', user.full_name)}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField select label={t('Role')} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <MenuItem value="WORKER">{t('Worker')}</MenuItem>
            <MenuItem value="MANAGER">{t('Manager')}</MenuItem>
            <MenuItem value="ADMIN">{t('Admin')}</MenuItem>
          </TextField>
          {role === 'WORKER' && (
            <ManagerSelect value={managerId} onChange={setManagerId} managers={managers.data ?? []} exclude={user.employee?.id} />
          )}
          {user.role === 'MANAGER' && role !== 'MANAGER' && (
            <Alert severity="info">{t('A Manager with Workers must have them moved to another team first.')}</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={save} disabled={busy || (role === 'WORKER' && !managerId)}>
          {t('Save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** Wrong passwords in the last 15 min, and how long the account still cannot sign in. */
function LoginTimer({ user }: { user: AdminUser }) {
  if (user.login_locked_seconds > 0) {
    return (
      <Tooltip title={t('{0} wrong password(s) or too many codes', user.login_failures)}>
        <Chip size="small" color="error" label={t('Locked · {0}', formatWait(user.login_locked_seconds))} />
      </Tooltip>
    )
  }
  if (user.login_failures > 0) {
    return <Chip size="small" color="warning" variant="outlined" label={t('{0} wrong', user.login_failures)} />
  }
  return (
    <Typography variant="caption" color="text.secondary">
      OK
    </Typography>
  )
}

const STATUSES: UserStatus[] = ['ACTIVE', 'PENDING', 'BLOCKED', 'REJECTED']
const ROLES: Role[] = ['ADMIN', 'MANAGER', 'WORKER', 'CUSTOMER']

export function UsersPage() {
  const { user: me } = useAuth()
  const [status, setStatus] = useState<UserStatus | ''>('')
  const [role, setRole] = useState<Role | ''>('')
  const [search, setSearch] = useState('')
  const filters = { status: status || undefined, role: role || undefined, search: search.trim() || undefined }
  const users = useQuery({ queryKey: ['admin', 'users', filters], queryFn: () => adminApi.users(filters) })
  const managers = useManagers()
  const refresh = useRefreshAdmin()
  const notify = useNotify()
  const [approving, setApproving] = useState<AdminUser | null>(null)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [blocking, setBlocking] = useState<AdminUser | null>(null)
  const [busy, setBusy] = useState(false)

  const teamOf = (u: AdminUser) => {
    if (!u.employee) return '—'
    if (u.employee.role === 'MANAGER') return u.employee.team_name
    if (u.employee.role === 'WORKER') return managers.data?.find((m) => m.id === u.employee!.manager_id)?.team_name ?? '—'
    return '—'
  }

  const clearTimer = async (u: AdminUser) => {
    setBusy(true)
    try {
      await adminApi.clearLoginTimer(u.id)
      notify.success(t('Login timer of {0} cleared', u.full_name))
      refresh()
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(false)
    }
  }

  const toggleBlock = async () => {
    if (!blocking) return
    setBusy(true)
    try {
      if (blocking.status === 'BLOCKED') await adminApi.unblock(blocking.id)
      else await adminApi.block(blocking.id)
      notify.success(blocking.status === 'BLOCKED' ? t('{0} unblocked', blocking.full_name) : t('{0} blocked', blocking.full_name))
      refresh()
      setBlocking(null)
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title={t('Users')} subtitle={t('All accounts. Blocking closes access at once; the history stays.')} />
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              placeholder={t('Search by name or email')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
            />
            <TextField select label={t('Role')} value={role} onChange={(e) => setRole(e.target.value as Role | '')} sx={{ minWidth: 150 }}>
              <MenuItem value="">{t('All roles')}</MenuItem>
              {ROLES.map((r) => (
                <MenuItem key={r} value={r}>
                  {roleLabel[r]}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label={t('Status')} value={status} onChange={(e) => setStatus(e.target.value as UserStatus | '')} sx={{ minWidth: 150 }}>
              <MenuItem value="">{t('All statuses')}</MenuItem>
              {STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {t(s)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <QueryState isLoading={users.isLoading} error={users.error}>
            {users.data?.length ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('User')}</TableCell>
                      <TableCell>{t('Role')}</TableCell>
                      <TableCell>{t('Status')}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{t('Team')}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{t('Signed up')}</TableCell>
                      <TableCell>{t('Sign in')}</TableCell>
                      <TableCell align="right" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users.data.map((u) => (
                      <TableRow key={u.id} hover>
                        <TableCell>
                          {u.full_name}
                          <Typography variant="caption" color="text.secondary" component="div">
                            {u.email}
                            {u.employee ? ` · ${u.employee.code}` : ''}
                          </Typography>
                        </TableCell>
                        <TableCell>{roleLabel[u.role]}</TableCell>
                        <TableCell>
                          <UserStatusChip status={u.status} />
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{teamOf(u)}</TableCell>
                        <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, whiteSpace: 'nowrap' }}>
                          {formatDateTime(u.created_at)}
                        </TableCell>
                        <TableCell>
                          <LoginTimer user={u} />
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {u.status === 'PENDING' && (
                            <Button size="small" color="success" onClick={() => setApproving(u)}>
                              {t('Approve')}
                            </Button>
                          )}
                          {u.status === 'ACTIVE' && u.employee && (
                            <Tooltip title={u.role === 'WORKER' ? t('Change role or team') : t('Change role')}>
                              <IconButton size="small" onClick={() => setEditing(u)} aria-label={t('Change role')}>
                                {u.role === 'WORKER' ? <GroupsOutlinedIcon fontSize="small" /> : <ManageAccountsOutlinedIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                          )}
                          {(u.login_failures > 0 || u.login_locked_seconds > 0) && (
                            <Tooltip title={t('Clear timer: let this account sign in now')}>
                              <IconButton size="small" color="warning" onClick={() => clearTimer(u)} aria-label={t('Clear timer')} disabled={busy}>
                                <LockResetIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {(u.status === 'ACTIVE' || u.status === 'BLOCKED') && u.id !== me?.id && (
                            <Tooltip title={u.status === 'BLOCKED' ? t('Unblock') : t('Block')}>
                              <IconButton
                                size="small"
                                color={u.status === 'BLOCKED' ? 'success' : 'error'}
                                onClick={() => setBlocking(u)}
                                aria-label={u.status === 'BLOCKED' ? t('Unblock') : t('Block')}
                              >
                                {u.status === 'BLOCKED' ? <LockOpenIcon fontSize="small" /> : <BlockIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <EmptyState title={t('No users match')} />
            )}
          </QueryState>
        </CardContent>
      </Card>
      {approving && <ApproveDialog user={approving} onClose={() => setApproving(null)} />}
      {editing && <RoleDialog user={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(blocking)}
        title={blocking?.status === 'BLOCKED' ? t('Unblock {0}?', blocking?.full_name) : t('Block {0}?', blocking?.full_name)}
        text={
          blocking?.status === 'BLOCKED'
            ? t('The user will be able to sign in again.')
            : t('The user is signed out at once and cannot sign in. Orders and movements stay in the history.')
        }
        confirmLabel={blocking?.status === 'BLOCKED' ? t('Unblock') : t('Block')}
        color={blocking?.status === 'BLOCKED' ? 'success' : 'error'}
        loading={busy}
        onConfirm={toggleBlock}
        onClose={() => setBlocking(null)}
      />
    </>
  )
}
