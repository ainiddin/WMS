import BlockIcon from '@mui/icons-material/Block'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined'
import LockOpenIcon from '@mui/icons-material/LockOpen'
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
  Grid,
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
import { ConfirmDialog, EmptyState, PageHeader, QueryState, UserStatusChip } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { formatDateTime, roleLabel } from '@/format'

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
      label="Team (Manager)"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      helperText={managers.length ? 'A Worker always belongs to one Manager’s team' : 'Approve a Manager first'}
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
      notify.success(`${u.full_name} approved as ${roleLabel[u.role]} (${u.employee?.code})`)
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
      <DialogTitle>Approve {user.full_name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2" color="text.secondary">
            {user.email} asked to join as <b>{user.requested_role ? roleLabel[user.requested_role] : '—'}</b>. You can change the role.
          </Typography>
          <TextField select label="Role" value={role} onChange={(e) => setRole(e.target.value as 'MANAGER' | 'WORKER')}>
            <MenuItem value="WORKER">Worker</MenuItem>
            <MenuItem value="MANAGER">Manager (gets own team)</MenuItem>
          </TextField>
          {role === 'WORKER' && <ManagerSelect value={managerId} onChange={setManagerId} managers={managers.data ?? []} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="success"
          startIcon={<CheckIcon />}
          disabled={busy || (role === 'WORKER' && !managerId)}
          onClick={approve}
        >
          Approve
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ---------------- Pending approvals ----------------
export function PendingApprovalsPage() {
  const users = useQuery({
    queryKey: ['admin', 'users', { status: 'PENDING' }],
    queryFn: () => adminApi.users({ status: 'PENDING' }),
  })
  const refresh = useRefreshAdmin()
  const notify = useNotify()
  const [approving, setApproving] = useState<AdminUser | null>(null)
  const [rejecting, setRejecting] = useState<AdminUser | null>(null)
  const [busy, setBusy] = useState(false)

  const reject = async () => {
    if (!rejecting) return
    setBusy(true)
    try {
      await adminApi.reject(rejecting.id)
      notify.success(`${rejecting.full_name} rejected`)
      refresh()
      setRejecting(null)
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Pending approvals" subtitle="Staff who signed up and cannot sign in until you approve them." />
      <QueryState isLoading={users.isLoading} error={users.error}>
        {users.data?.length ? (
          <Grid container spacing={2}>
            {users.data.map((u) => (
              <Grid key={u.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                      <div>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          {u.full_name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {u.email}
                          {u.phone ? ` · ${u.phone}` : ''}
                        </Typography>
                      </div>
                      <Chip size="small" color="warning" label={u.requested_role ? roleLabel[u.requested_role] : '—'} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                      Signed up {formatDateTime(u.created_at)}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                      <Button variant="contained" color="success" startIcon={<CheckIcon />} onClick={() => setApproving(u)}>
                        Approve
                      </Button>
                      <Button color="error" startIcon={<CloseIcon />} onClick={() => setRejecting(u)}>
                        Reject
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        ) : (
          <Card>
            <EmptyState title="No pending requests" text="New staff sign-ups will appear here." />
          </Card>
        )}
      </QueryState>
      {approving && <ApproveDialog user={approving} onClose={() => setApproving(null)} />}
      <ConfirmDialog
        open={Boolean(rejecting)}
        title={`Reject ${rejecting?.full_name}?`}
        text="The account will not be able to sign in."
        confirmLabel="Reject"
        color="error"
        loading={busy}
        onConfirm={reject}
        onClose={() => setRejecting(null)}
      />
    </>
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
        notify.success(`${user.full_name} moved to another team`)
      } else {
        const u = await adminApi.changeRole(user.id, role, role === 'WORKER' ? Number(managerId) || null : null)
        notify.success(`${u.full_name} is now ${roleLabel[u.role]}`)
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
      <DialogTitle>Role and team · {user.full_name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField select label="Role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <MenuItem value="WORKER">Worker</MenuItem>
            <MenuItem value="MANAGER">Manager</MenuItem>
            <MenuItem value="ADMIN">Admin</MenuItem>
          </TextField>
          {role === 'WORKER' && (
            <ManagerSelect value={managerId} onChange={setManagerId} managers={managers.data ?? []} exclude={user.employee?.id} />
          )}
          {user.role === 'MANAGER' && role !== 'MANAGER' && (
            <Alert severity="info">A Manager with Workers must have them moved to another team first.</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy || (role === 'WORKER' && !managerId)}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
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

  const toggleBlock = async () => {
    if (!blocking) return
    setBusy(true)
    try {
      if (blocking.status === 'BLOCKED') await adminApi.unblock(blocking.id)
      else await adminApi.block(blocking.id)
      notify.success(`${blocking.full_name} ${blocking.status === 'BLOCKED' ? 'unblocked' : 'blocked'}`)
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
      <PageHeader title="Users" subtitle="All accounts. Blocking closes access at once; the history stays." />
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
            />
            <TextField select label="Role" value={role} onChange={(e) => setRole(e.target.value as Role | '')} sx={{ minWidth: 150 }}>
              <MenuItem value="">All roles</MenuItem>
              {ROLES.map((r) => (
                <MenuItem key={r} value={r}>
                  {roleLabel[r]}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Status" value={status} onChange={(e) => setStatus(e.target.value as UserStatus | '')} sx={{ minWidth: 150 }}>
              <MenuItem value="">All statuses</MenuItem>
              {STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
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
                      <TableCell>User</TableCell>
                      <TableCell>Role</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Team</TableCell>
                      <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Signed up</TableCell>
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
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {u.status === 'PENDING' && (
                            <Button size="small" color="success" onClick={() => setApproving(u)}>
                              Approve
                            </Button>
                          )}
                          {u.status === 'ACTIVE' && u.employee && (
                            <Tooltip title={u.role === 'WORKER' ? 'Change role or team' : 'Change role'}>
                              <IconButton size="small" onClick={() => setEditing(u)} aria-label="Change role">
                                {u.role === 'WORKER' ? <GroupsOutlinedIcon fontSize="small" /> : <ManageAccountsOutlinedIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                          )}
                          {(u.status === 'ACTIVE' || u.status === 'BLOCKED') && u.id !== me?.id && (
                            <Tooltip title={u.status === 'BLOCKED' ? 'Unblock' : 'Block'}>
                              <IconButton
                                size="small"
                                color={u.status === 'BLOCKED' ? 'success' : 'error'}
                                onClick={() => setBlocking(u)}
                                aria-label={u.status === 'BLOCKED' ? 'Unblock' : 'Block'}
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
              <EmptyState title="No users match" />
            )}
          </QueryState>
        </CardContent>
      </Card>
      {approving && <ApproveDialog user={approving} onClose={() => setApproving(null)} />}
      {editing && <RoleDialog user={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(blocking)}
        title={blocking?.status === 'BLOCKED' ? `Unblock ${blocking?.full_name}?` : `Block ${blocking?.full_name}?`}
        text={
          blocking?.status === 'BLOCKED'
            ? 'The user will be able to sign in again.'
            : 'The user is signed out at once and cannot sign in. Orders and movements stay in the history.'
        }
        confirmLabel={blocking?.status === 'BLOCKED' ? 'Unblock' : 'Block'}
        color={blocking?.status === 'BLOCKED' ? 'success' : 'error'}
        loading={busy}
        onConfirm={toggleBlock}
        onClose={() => setBlocking(null)}
      />
    </>
  )
}
