import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  type ChipProps,
} from '@mui/material'
import type { ReactNode } from 'react'
import { errorMessage } from '@/api/client'
import type { OrderStatus, Period, UserStatus } from '@/api/types'

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={2}
      sx={{ mb: 3, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' } }}
    >
      <Box>
        <Typography variant="h5" component="h1">
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, '& > *': { m: '0 !important' } }}>
          {actions}
        </Stack>
      )}
    </Stack>
  )
}

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

const ORDER_COLORS: Record<OrderStatus, ChipProps['color']> = {
  PENDING: 'warning',
  APPROVED: 'info',
  SHIPPED: 'success',
  REJECTED: 'error',
  CANCELLED: 'default',
}

/** PENDING now only means "waiting for stock": nobody approves orders by hand. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'WAITING FOR STOCK',
  APPROVED: 'APPROVED',
  SHIPPED: 'SHIPPED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
}

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  return <Chip size="small" label={ORDER_STATUS_LABEL[status]} color={ORDER_COLORS[status]} variant="outlined" />
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

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <Stack spacing={1} sx={{ py: 6, alignItems: 'center', textAlign: 'center', color: 'text.secondary' }}>
      <InboxOutlinedIcon sx={{ fontSize: 48, opacity: 0.6 }} />
      <Typography variant="subtitle1" color="text.primary">
        {title}
      </Typography>
      {text && <Typography variant="body2">{text}</Typography>}
      {action}
    </Stack>
  )
}

/** Shows a spinner while loading and an error box on failure; renders children only when data is ready. */
export function QueryState({
  isLoading,
  error,
  children,
}: {
  isLoading: boolean
  error: unknown
  children: ReactNode
}) {
  if (isLoading)
    return (
      <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    )
  if (error) return <Alert severity="error">{errorMessage(error)}</Alert>
  return <>{children}</>
}

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel = 'Confirm',
  color = 'primary',
  loading,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean
  title: string
  text?: ReactNode
  confirmLabel?: string
  color?: 'primary' | 'error' | 'success' | 'warning'
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
  children?: ReactNode
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {text && <DialogContentText>{text}</DialogContentText>}
        {children}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color={color} onClick={onConfirm} disabled={loading}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
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
