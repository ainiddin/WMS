import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import {
  Alert,
  AlertTitle,
  Box,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import type { ReactNode } from 'react'
import type { Order, WaitingLine } from '@/api/types'
import { formatDateTime, formatMoney } from '@/format'

/** Order lines. Staff see the current stock next to each line, so shortages are visible before approving. */
export function OrderItemsTable({ order, showStock = false }: { order: Order; showStock?: boolean }) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Product</TableCell>
            <TableCell align="right">Qty</TableCell>
            {showStock && <TableCell align="right">In stock</TableCell>}
            <TableCell align="right">Price</TableCell>
            <TableCell align="right">Sum</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {order.items.map((item) => {
            const short =
              showStock && item.available_quantity !== null && item.available_quantity < item.quantity
            return (
              <TableRow key={item.id}>
                <TableCell>
                  <Typography variant="body2">{item.product_name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.product_code}
                    {item.barcode ? ` · ${item.barcode}` : ''}
                  </Typography>
                </TableCell>
                <TableCell align="right">{item.quantity}</TableCell>
                {showStock && (
                  <TableCell align="right" sx={{ color: short ? 'error.main' : undefined, whiteSpace: 'nowrap' }}>
                    {short && (
                      <Tooltip title="Not enough stock">
                        <WarningAmberIcon fontSize="inherit" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
                      </Tooltip>
                    )}
                    {item.available_quantity}
                  </TableCell>
                )}
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {formatMoney(item.unit_price)}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {formatMoney(item.line_total)}
                </TableCell>
              </TableRow>
            )
          })}
          <TableRow>
            <TableCell colSpan={showStock ? 4 : 3} sx={{ fontWeight: 600, borderBottom: 0 }}>
              Total
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap', borderBottom: 0 }}>
              {formatMoney(order.total_amount)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export const formatEta = (min: number | null, max: number | null) =>
  min === null || max === null ? null : `${min}–${max} days`

/** What an order (or a cart at checkout) waits for, and roughly how long. */
export function WaitingNotice({
  waiting,
  etaMin,
  etaMax,
  footer,
}: {
  waiting: WaitingLine[]
  etaMin: number | null
  etaMax: number | null
  footer?: ReactNode
}) {
  const eta = formatEta(etaMin, etaMax)
  return (
    <Alert severity="warning">
      <AlertTitle>Waiting for stock{eta ? ` · expected in ${eta}` : ''}</AlertTitle>
      {waiting.map((w) => (
        <Typography key={w.product_id} variant="body2">
          {w.product_name}: {w.missing} more needed
        </Typography>
      ))}
      {footer && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          {footer}
        </Typography>
      )}
    </Alert>
  )
}

/** PENDING -> APPROVED -> SHIPPED progress, or the reason why the order stopped. */
export function OrderProgress({ order }: { order: Order }) {
  if (order.status === 'REJECTED' || order.status === 'CANCELLED') {
    return (
      <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
        <Typography variant="body2">
          {order.status === 'REJECTED' ? 'Rejected' : 'Cancelled'}{' '}
          {formatDateTime(order.status === 'REJECTED' ? order.approved_at : order.cancelled_at)}
          {order.rejection_reason ? ` — ${order.rejection_reason}` : ''}
        </Typography>
      </Box>
    )
  }
  const steps = [
    { label: 'Placed', at: order.created_at },
    { label: 'Confirmed', at: order.approved_at },
    { label: 'Shipped', at: order.shipped_at },
  ]
  const active = order.status === 'SHIPPED' ? 3 : order.status === 'APPROVED' ? 2 : 1
  return (
    <Stepper activeStep={active} alternativeLabel>
      {steps.map((s, i) => (
        <Step key={s.label} completed={i < active}>
          <StepLabel
            icon={i < active ? <CheckCircleIcon color="success" /> : <RadioButtonUncheckedIcon color="disabled" />}
            optional={
              <Typography variant="caption" color="text.secondary">
                {s.at ? formatDateTime(s.at) : ' '}
              </Typography>
            }
          >
            {s.label}
          </StepLabel>
        </Step>
      ))}
    </Stepper>
  )
}

const PAYMENT_LABEL = {
  PAID: 'Paid from the KeyFive account',
  REFUNDED: 'Refunded to the KeyFive account',
  NONE: 'On delivery',
}

export function OrderMeta({ order, staff = false }: { order: Order; staff?: boolean }) {
  const rows: [string, string | null | undefined][] = [
    ['Customer', staff ? `${order.customer.full_name} (${order.customer.code})` : null],
    ['Delivery address', order.delivery_address],
    ['Payment', PAYMENT_LABEL[order.payment_status ?? 'NONE']],
    ['Comment', order.comment],
    ['Approved by', staff && order.approved_at ? (order.approved_by?.full_name ?? 'System (automatic)') : null],
    ['Assigned to', staff && order.status === 'APPROVED' ? (order.assigned_to?.full_name ?? 'Nobody yet (no active Workers)') : null],
    ['Shipped by', staff ? order.shipped_by?.full_name : null],
  ]
  return (
    <Stack spacing={0.5}>
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <Typography key={k} variant="body2">
            <Box component="span" sx={{ color: 'text.secondary' }}>
              {k}:
            </Box>{' '}
            {v}
          </Typography>
        ))}
    </Stack>
  )
}
