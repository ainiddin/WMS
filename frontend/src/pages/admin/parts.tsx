import {
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  type ChipProps,
} from '@mui/material'
import type { ReactNode } from 'react'
import type { Period, UserStatus } from '@/api/types'

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'warning' | 'error' | 'success'
}) {
  const color = tone === 'default' ? 'primary.main' : `${tone}.main`
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary">
              {label}
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
              {value}
            </Typography>
            {hint && (
              <Typography variant="caption" color="text.secondary">
                {hint}
              </Typography>
            )}
          </Box>
          {icon && <Box sx={{ color, display: 'flex', '& svg': { fontSize: 32 } }}>{icon}</Box>}
        </Stack>
      </CardContent>
    </Card>
  )
}

const USER_COLORS: Record<UserStatus, ChipProps['color']> = {
  PENDING: 'warning',
  ACTIVE: 'success',
  REJECTED: 'default',
  BLOCKED: 'error',
}

export function UserStatusChip({ status }: { status: UserStatus }) {
  return <Chip size="small" label={status} color={USER_COLORS[status]} variant="outlined" />
}

export const PERIOD_LABELS: Record<Period, string> = {
  week: 'Week',
  month: 'Month',
  quarter: '3 months',
  year: 'Year',
}

export function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      color="primary"
      value={value}
      onChange={(_, v: Period | null) => v && onChange(v)}
      aria-label="Period"
    >
      {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
        <ToggleButton key={p} value={p} sx={{ px: 1.5 }}>
          {PERIOD_LABELS[p]}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ mb: 2, alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="h6" component="h2" sx={{ fontSize: '1rem' }}>
            {title}
          </Typography>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  )
}

export function RankBadge({ rank }: { rank: number }) {
  const medal = rank === 1 ? '#d4a017' : rank === 2 ? '#9e9e9e' : rank === 3 ? '#b06a2c' : undefined
  return (
    <Box
      sx={{
        width: 30,
        height: 30,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        fontSize: 14,
        color: medal ? '#fff' : 'text.primary',
        bgcolor: medal ?? 'action.selected',
      }}
    >
      {rank}
    </Box>
  )
}

/** "12 min" / "45 s" for lock timers. */
export function formatWait(seconds: number): string {
  return seconds >= 60 ? `${Math.ceil(seconds / 60)} min` : `${seconds} s`
}
