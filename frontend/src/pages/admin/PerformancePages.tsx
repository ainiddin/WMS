import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined'
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined'
import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined'
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined'
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined'
import {
  Button,
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
import { EmptyState, PageHeader, QueryState } from '@/components/common'
import { PERIOD_LABELS, PeriodToggle, RankBadge, Section, StatCard } from './parts'
import { formatDate, formatNumber } from '@/format'

import { t } from '@/i18n'
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
        <StatCard label={t('Points')} value={formatNumber(m.points)} icon={<EmojiEventsOutlinedIcon />} tone="success" />
      </Grid>
      {showWorker && (
        <>
          <Grid size={{ xs: 6, md: 3 }}>
            <StatCard
              label={t('Orders shipped')}
              value={formatNumber(m.orders_shipped)}
              hint={t('{0} units', formatNumber(m.units_shipped))}
              icon={<LocalShippingOutlinedIcon />}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <StatCard
              label={t('Stock IN received')}
              value={formatNumber(m.stock_in_count)}
              hint={t('{0} units', formatNumber(m.units_in))}
              icon={<MoveToInboxOutlinedIcon />}
            />
          </Grid>
        </>
      )}
      {showManager && (
        <>
          <Grid size={{ xs: 6, md: 3 }}>
            <StatCard
              label={t('Orders approved')}
              value={formatNumber(m.orders_approved)}
              hint={t('{0} rejected', m.orders_rejected)}
              icon={<TaskAltOutlinedIcon />}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <StatCard
              label={t('Avg time to approve')}
              value={m.avg_approval_hours === null ? '—' : t('{0} h', m.avg_approval_hours)}
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
  if (!workers.length && !managerRow) return <EmptyState title={t('No workers in this team yet')} />
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>{t('Employee')}</TableCell>
            <TableCell align="right">{t('Shipped')}</TableCell>
            <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('Units')}</TableCell>
            <TableCell align="right">{t('Stock IN')}</TableCell>
            <TableCell align="right">{t('Points')}</TableCell>
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
                  {!w.is_active && ' · ' + t('inactive')}
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
                  {t('Manager')} · {t('approved {0}', managerRow.orders_approved)}
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
  const max = Math.max(1, ...teams.map((team) => team.points))
  if (!teams.length) return <EmptyState title={t('No teams yet')} text={t('A team appears when a Manager is approved.')} />
  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>{t('Place')}</TableCell>
            <TableCell>{t('Team')}</TableCell>
            <TableCell align="right">{t('Points')}</TableCell>
            <TableCell align="right">{t('Shipped')}</TableCell>
            <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('Approved')}</TableCell>
            <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('Stock IN')}</TableCell>
            <TableCell sx={{ width: 200, display: { xs: 'none', md: 'table-cell' } }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {teams.map((team) => (
            <TableRow
              key={team.manager_id}
              hover
              onClick={onOpen ? () => onOpen(team) : undefined}
              selected={highlight === team.manager_id}
              sx={{ cursor: onOpen ? 'pointer' : undefined }}
            >
              <TableCell>
                <RankBadge rank={team.rank} />
              </TableCell>
              <TableCell>
                <Typography sx={{ fontWeight: 600 }}>{team.team_name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {team.manager_name} · {team.members > 1 ? t('{0} members', team.members) : t('{0} member', team.members)}
                </Typography>
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
                {formatNumber(team.points)}
              </TableCell>
              <TableCell align="right">{formatNumber(team.orders_shipped)}</TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                {formatNumber(team.orders_approved)}
              </TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                {formatNumber(team.stock_in_count)}
              </TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                <LinearProgress
                  variant="determinate"
                  color={team.rank === 1 ? 'success' : 'primary'}
                  value={(team.points / max) * 100}
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
      {params.managerId && user?.role === 'ADMIN' && (
        <Button component={RouterLink} to="/admin/performance" startIcon={<ArrowBackIcon />} sx={{ mb: 1 }}>
          {t('All teams')}
        </Button>
      )}
      <PageHeader
        title={team ? team.team_name : t('Team performance')}
        subtitle={rangeText(data.data?.start, data.data?.end)}
        actions={<PeriodToggle value={period} onChange={setPeriod} />}
      />
      <QueryState isLoading={data.isLoading} error={data.error}>
        {data.data && (
          <Stack spacing={3}>
            {team && (
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, md: 3 }}>
                  <StatCard label={t('Team place')} value={`${team.rank}`} hint={t('{0} members', team.members)} icon={<EmojiEventsOutlinedIcon />} tone="success" />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <StatCard label={t('Team points')} value={formatNumber(team.points)} />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <StatCard label={t('Orders shipped')} value={formatNumber(team.orders_shipped)} hint={t('{0} units', formatNumber(team.units_shipped))} />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <StatCard label={t('Stock IN')} value={formatNumber(team.stock_in_count)} />
                </Grid>
              </Grid>
            )}
            <Section title={`${t('Manager')} · ${data.data.manager.full_name}`}>
              <MetricCards m={data.data.manager} showManager showWorker={false} />
            </Section>
            <Section title={t('Workers ranking')}>
              <WorkersTable workers={data.data.workers} managerRow={data.data.manager} />
            </Section>
            <Section title={`${t('Team activity')} · ${PERIOD_LABELS[period]}`}>
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
        title={t('Performance')}
        subtitle={rangeText(data.data?.start, data.data?.end)}
        actions={<PeriodToggle value={period} onChange={setPeriod} />}
      />
      <QueryState isLoading={data.isLoading} error={data.error}>
        {data.data && totals && (
          <Stack spacing={3}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, md: 3 }}>
                <StatCard label={t('Orders shipped')} value={formatNumber(totals.orders_shipped)} hint={t('{0} units', formatNumber(totals.units_shipped))} icon={<LocalShippingOutlinedIcon />} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <StatCard label={t('Orders approved')} value={formatNumber(totals.orders_approved)} icon={<TaskAltOutlinedIcon />} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <StatCard label={t('Stock IN')} value={formatNumber(totals.stock_in_count)} icon={<MoveToInboxOutlinedIcon />} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <StatCard label={t('Total points')} value={formatNumber(totals.points)} icon={<EmojiEventsOutlinedIcon />} tone="success" />
              </Grid>
            </Grid>
            <Section title={t('Teams')} action={<Typography variant="caption" color="text.secondary">{t('Click a team to see its workers')}</Typography>}>
              <TeamsTable teams={data.data.teams} onOpen={(team) => navigate(`/admin/teams/${team.manager_id}`)} />
            </Section>
            <Section title={`${t('All teams activity')} · ${PERIOD_LABELS[period]}`}>
              <TimelineChart data={data.data.timeline} bucket={data.data.bucket} />
            </Section>
          </Stack>
        )}
      </QueryState>
    </>
  )
}

