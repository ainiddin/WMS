import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined'
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined'
import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined'
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined'
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Grid,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router'
import { performanceApi } from '@/api/endpoints'
import type { Metrics, Period, TeamSummary } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import { TimelineChart } from '@/components/charts'
import { EmptyState, PageHeader, PERIOD_LABELS, PeriodToggle, QueryState, RankBadge, Section, StatCard } from '@/components/common'
import { formatDate, formatNumber, roleLabel } from '@/format'

const FORMULA = 'Points = orders shipped × 10 + orders approved × 2 + stock IN × 1'

/** Keeps the selected period between pages during the session. */
let lastPeriod: Period = 'month'
function usePeriod() {
  const [period, setPeriod] = useState<Period>(lastPeriod)
  return [
    period,
    (p: Period) => {
      lastPeriod = p
      setPeriod(p)
    },
  ] as const
}

function rangeText(start?: string, end?: string) {
  return start && end ? `${formatDate(start)} – ${formatDate(end)}` : undefined
}

function MetricCards({ m, showManager, showWorker }: { m: Metrics; showManager: boolean; showWorker: boolean }) {
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 6, md: 3 }}>
        <StatCard label="Points" value={formatNumber(m.points)} icon={<EmojiEventsOutlinedIcon />} tone="success" />
      </Grid>
      {showWorker && (
        <>
          <Grid size={{ xs: 6, md: 3 }}>
            <StatCard
              label="Orders shipped"
              value={formatNumber(m.orders_shipped)}
              hint={`${formatNumber(m.units_shipped)} units`}
              icon={<LocalShippingOutlinedIcon />}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <StatCard
              label="Stock IN received"
              value={formatNumber(m.stock_in_count)}
              hint={`${formatNumber(m.units_in)} units`}
              icon={<MoveToInboxOutlinedIcon />}
            />
          </Grid>
        </>
      )}
      {showManager && (
        <>
          <Grid size={{ xs: 6, md: 3 }}>
            <StatCard
              label="Orders approved"
              value={formatNumber(m.orders_approved)}
              hint={`${m.orders_rejected} rejected`}
              icon={<TaskAltOutlinedIcon />}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <StatCard
              label="Avg time to approve"
              value={m.avg_approval_hours === null ? '—' : `${m.avg_approval_hours} h`}
              icon={<TimerOutlinedIcon />}
            />
          </Grid>
        </>
      )}
    </Grid>
  )
}

function WorkersTable({ workers, managerRow }: { workers: Metrics[]; managerRow?: Metrics }) {
  const max = Math.max(1, ...workers.map((w) => w.points))
  if (!workers.length && !managerRow) return <EmptyState title="No workers in this team yet" />
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Employee</TableCell>
            <TableCell align="right">Shipped</TableCell>
            <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Units</TableCell>
            <TableCell align="right">Stock IN</TableCell>
            <TableCell align="right">Points</TableCell>
            <TableCell sx={{ width: 160, display: { xs: 'none', md: 'table-cell' } }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {workers.map((w) => (
            <TableRow key={w.employee_id} hover>
              <TableCell>
                <RankBadge rank={w.rank ?? 0} />
              </TableCell>
              <TableCell>
                {w.full_name}
                <Typography variant="caption" color="text.secondary" component="div">
                  {w.code}
                  {!w.is_active && ' · inactive'}
                </Typography>
              </TableCell>
              <TableCell align="right">{formatNumber(w.orders_shipped)}</TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                {formatNumber(w.units_shipped)}
              </TableCell>
              <TableCell align="right">{formatNumber(w.stock_in_count)}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                {formatNumber(w.points)}
              </TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                <LinearProgress variant="determinate" value={(w.points / max) * 100} sx={{ height: 6, borderRadius: 3 }} />
              </TableCell>
            </TableRow>
          ))}
          {managerRow && (
            <TableRow sx={{ bgcolor: 'action.hover' }}>
              <TableCell />
              <TableCell>
                {managerRow.full_name}
                <Typography variant="caption" color="text.secondary" component="div">
                  Manager · approved {managerRow.orders_approved}
                </Typography>
              </TableCell>
              <TableCell align="right">{formatNumber(managerRow.orders_shipped)}</TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                {formatNumber(managerRow.units_shipped)}
              </TableCell>
              <TableCell align="right">{formatNumber(managerRow.stock_in_count)}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                {formatNumber(managerRow.points)}
              </TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }} />
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function TeamsTable({ teams, onOpen, highlight }: { teams: TeamSummary[]; onOpen?: (t: TeamSummary) => void; highlight?: number | null }) {
  const max = Math.max(1, ...teams.map((t) => t.points))
  if (!teams.length) return <EmptyState title="No teams yet" text="A team appears when a Manager is approved." />
  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Place</TableCell>
            <TableCell>Team</TableCell>
            <TableCell align="right">Points</TableCell>
            <TableCell align="right">Shipped</TableCell>
            <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Approved</TableCell>
            <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Stock IN</TableCell>
            <TableCell sx={{ width: 200, display: { xs: 'none', md: 'table-cell' } }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {teams.map((t) => (
            <TableRow
              key={t.manager_id}
              hover
              onClick={onOpen ? () => onOpen(t) : undefined}
              selected={highlight === t.manager_id}
              sx={{ cursor: onOpen ? 'pointer' : undefined }}
            >
              <TableCell>
                <RankBadge rank={t.rank} />
              </TableCell>
              <TableCell>
                <Typography sx={{ fontWeight: 600 }}>{t.team_name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {t.manager_name} · {t.members} member{t.members > 1 ? 's' : ''}
                </Typography>
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
                {formatNumber(t.points)}
              </TableCell>
              <TableCell align="right">{formatNumber(t.orders_shipped)}</TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                {formatNumber(t.orders_approved)}
              </TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                {formatNumber(t.stock_in_count)}
              </TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                <LinearProgress
                  variant="determinate"
                  color={t.rank === 1 ? 'success' : 'primary'}
                  value={(t.points / max) * 100}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

// ---------------- My performance (every employee) ----------------
export function MyPerformancePage() {
  const [period, setPeriod] = usePeriod()
  const { user } = useAuth()
  const data = useQuery({ queryKey: ['performance', 'me', period], queryFn: () => performanceApi.me(period) })
  const isWorker = user?.role === 'WORKER'

  return (
    <>
      <PageHeader
        title="My performance"
        subtitle={rangeText(data.data?.start, data.data?.end)}
        actions={<PeriodToggle value={period} onChange={setPeriod} />}
      />
      <QueryState isLoading={data.isLoading} error={data.error}>
        {data.data && (
          <Stack spacing={3}>
            {data.data.team && (
              <Alert severity="success" icon={<EmojiEventsOutlinedIcon />}>
                <b>{data.data.team.team_name}</b> is in place <b>{data.data.team.rank}</b> of {data.data.team.teams_total}{' '}
                with {formatNumber(data.data.team.points)} points.
                {isWorker && data.data.rank_in_team && (
                  <>
                    {' '}
                    Your place in the team: <b>{data.data.rank_in_team}</b> of {data.data.team_size}.
                  </>
                )}{' '}
                <Button component={RouterLink} to="/leaderboard" size="small">
                  Leaderboard
                </Button>
              </Alert>
            )}
            <MetricCards m={data.data.me} showWorker showManager={!isWorker} />
            <Section title={`Activity · ${PERIOD_LABELS[period]}`}>
              <TimelineChart data={data.data.timeline} bucket={data.data.bucket} showApproved={!isWorker} />
            </Section>
            <Typography variant="caption" color="text.secondary">
              {FORMULA}. Numbers come from shipped orders, approvals and stock movements — nobody types them in.
            </Typography>
          </Stack>
        )}
      </QueryState>
    </>
  )
}

// ---------------- Team performance (Manager: own team; Admin: any team) ----------------
export function TeamPerformancePage() {
  const { user } = useAuth()
  const params = useParams()
  const managerId = params.managerId ? Number(params.managerId) : user?.employee_id ?? 0
  const [period, setPeriod] = usePeriod()
  const data = useQuery({
    queryKey: ['performance', 'team', managerId, period],
    queryFn: () => performanceApi.team(managerId, period),
    enabled: managerId > 0,
  })
  const team = data.data?.team

  return (
    <>
      {params.managerId && (
        <Button component={RouterLink} to="/admin/performance" startIcon={<ArrowBackIcon />} sx={{ mb: 1 }}>
          All teams
        </Button>
      )}
      <PageHeader
        title={team ? team.team_name : 'Team performance'}
        subtitle={rangeText(data.data?.start, data.data?.end)}
        actions={<PeriodToggle value={period} onChange={setPeriod} />}
      />
      <QueryState isLoading={data.isLoading} error={data.error}>
        {data.data && (
          <Stack spacing={3}>
            {team && (
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, md: 3 }}>
                  <StatCard label="Team place" value={`${team.rank}`} hint={`${team.members} members`} icon={<EmojiEventsOutlinedIcon />} tone="success" />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <StatCard label="Team points" value={formatNumber(team.points)} />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <StatCard label="Orders shipped" value={formatNumber(team.orders_shipped)} hint={`${formatNumber(team.units_shipped)} units`} />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <StatCard label="Stock IN" value={formatNumber(team.stock_in_count)} />
                </Grid>
              </Grid>
            )}
            <Section title={`Manager · ${data.data.manager.full_name}`}>
              <MetricCards m={data.data.manager} showManager showWorker={false} />
            </Section>
            <Section title="Workers ranking">
              <WorkersTable workers={data.data.workers} managerRow={data.data.manager} />
            </Section>
            <Section title={`Team activity · ${PERIOD_LABELS[period]}`}>
              <TimelineChart data={data.data.timeline} bucket={data.data.bucket} />
            </Section>
          </Stack>
        )}
      </QueryState>
    </>
  )
}

// ---------------- Admin: all teams ----------------
export function AdminPerformancePage() {
  const [period, setPeriod] = usePeriod()
  const navigate = useNavigate()
  const data = useQuery({ queryKey: ['performance', 'all', period], queryFn: () => performanceApi.all(period) })
  const totals = data.data?.totals

  return (
    <>
      <PageHeader
        title="Performance"
        subtitle={rangeText(data.data?.start, data.data?.end)}
        actions={<PeriodToggle value={period} onChange={setPeriod} />}
      />
      <QueryState isLoading={data.isLoading} error={data.error}>
        {data.data && totals && (
          <Stack spacing={3}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, md: 3 }}>
                <StatCard label="Orders shipped" value={formatNumber(totals.orders_shipped)} hint={`${formatNumber(totals.units_shipped)} units`} icon={<LocalShippingOutlinedIcon />} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <StatCard label="Orders approved" value={formatNumber(totals.orders_approved)} icon={<TaskAltOutlinedIcon />} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <StatCard label="Stock IN" value={formatNumber(totals.stock_in_count)} icon={<MoveToInboxOutlinedIcon />} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <StatCard label="Total points" value={formatNumber(totals.points)} icon={<EmojiEventsOutlinedIcon />} tone="success" />
              </Grid>
            </Grid>
            <Section title="Teams" action={<Typography variant="caption" color="text.secondary">Click a team to see its workers</Typography>}>
              <TeamsTable teams={data.data.teams} onOpen={(t) => navigate(`/admin/teams/${t.manager_id}`)} />
            </Section>
            <Section title={`All teams activity · ${PERIOD_LABELS[period]}`}>
              <TimelineChart data={data.data.timeline} bucket={data.data.bucket} />
            </Section>
          </Stack>
        )}
      </QueryState>
    </>
  )
}

// ---------------- Leaderboard (all staff) ----------------
export function LeaderboardPage() {
  const [period, setPeriod] = usePeriod()
  const { user } = useAuth()
  const navigate = useNavigate()
  const data = useQuery({ queryKey: ['leaderboard', period], queryFn: () => performanceApi.leaderboard(period) })
  const myTeam = user?.role === 'MANAGER' ? user.employee_id : user?.role === 'WORKER' ? user.manager_id : null
  const leader = data.data?.teams[0]

  return (
    <>
      <PageHeader
        title="Leaderboard"
        subtitle={rangeText(data.data?.start, data.data?.end)}
        actions={<PeriodToggle value={period} onChange={setPeriod} />}
      />
      <QueryState isLoading={data.isLoading} error={data.error}>
        {data.data && (
          <Stack spacing={3}>
            {leader && leader.points > 0 && (
              <Card sx={{ p: 3, textAlign: 'center', background: 'linear-gradient(135deg, #d4a01722, transparent)' }}>
                <EmojiEventsOutlinedIcon sx={{ fontSize: 48, color: '#d4a017' }} />
                <Typography variant="h5">{leader.team_name}</Typography>
                <Typography color="text.secondary">
                  leads with {formatNumber(leader.points)} points · {formatNumber(leader.orders_shipped)} orders shipped
                </Typography>
              </Card>
            )}
            <Section title="Teams">
              <TeamsTable
                teams={data.data.teams}
                highlight={myTeam}
                onOpen={
                  user?.role === 'ADMIN'
                    ? (t) => navigate(`/admin/teams/${t.manager_id}`)
                    : user?.role === 'MANAGER'
                      ? (t) => t.manager_id === user.employee_id && navigate('/team')
                      : undefined
                }
              />
            </Section>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip size="small" label={FORMULA} variant="outlined" />
              {user && (
                <Typography variant="caption" color="text.secondary">
                  You: {roleLabel[user.role]}
                  {myTeam ? ' · your team is highlighted' : ''}
                </Typography>
              )}
            </Stack>
            <Box />
          </Stack>
        )}
      </QueryState>
    </>
  )
}
