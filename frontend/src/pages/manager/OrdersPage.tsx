import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { ordersApi } from '@/api/endpoints'
import type { Order, OrderStatus } from '@/api/types'
import { ConfirmDialog, EmptyState, OrderStatusChip, PageHeader, QueryState } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { hasShortage, OrderItemsTable, OrderMeta, OrderProgress } from '@/components/OrderParts'
import { formatDateTime, formatMoney } from '@/format'

const TABS: (OrderStatus | 'ALL')[] = ['PENDING', 'APPROVED', 'SHIPPED', 'REJECTED', 'CANCELLED', 'ALL']

function useOrderAction() {
  const queryClient = useQueryClient()
  const notify = useNotify()
  return (fn: () => Promise<Order>, done: string, after?: () => void) =>
    fn()
      .then((o) => {
        notify.success(`Order ${o.code} ${done}`)
        queryClient.invalidateQueries({ queryKey: ['orders'] })
        queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        queryClient.invalidateQueries({ queryKey: ['performance'] })
        queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
        after?.()
      })
      .catch(notify.error)
}

function OrderDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const run = useOrderAction()
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const short = hasShortage(order)

  const act = (fn: () => Promise<Order>, done: string) => {
    setBusy(true)
    run(fn, done, onClose).finally(() => setBusy(false))
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        Order {order.code} <OrderStatusChip status={order.status} />
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5}>
          <OrderProgress order={order} />
          <OrderMeta order={order} staff />
          {order.status === 'PENDING' && short && (
            <Alert severity="warning">Some lines are larger than the current stock — the order cannot be approved yet.</Alert>
          )}
          <OrderItemsTable order={order} showStock={order.status === 'PENDING' || order.status === 'APPROVED'} />
          {rejecting && (
            <TextField
              label="Reason (shown to the customer)"
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Not enough stock, address outside the delivery area"
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {order.status === 'APPROVED' && (
          <Button color="error" onClick={() => setCancelling(true)} disabled={busy} sx={{ mr: 'auto' }}>
            Cancel order
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
        {order.status === 'PENDING' &&
          (rejecting ? (
            <Button color="error" variant="contained" disabled={busy} onClick={() => act(() => ordersApi.reject(order.id, reason), 'rejected')}>
              Confirm reject
            </Button>
          ) : (
            <>
              <Button color="error" variant="outlined" startIcon={<CloseIcon />} onClick={() => setRejecting(true)} disabled={busy}>
                Reject
              </Button>
              <Button
                color="success"
                variant="contained"
                startIcon={<CheckIcon />}
                disabled={busy || short}
                onClick={() => act(() => ordersApi.approve(order.id), 'approved')}
              >
                Approve
              </Button>
            </>
          ))}
      </DialogActions>
      <ConfirmDialog
        open={cancelling}
        title={`Cancel order ${order.code}?`}
        text="The order was approved but not shipped yet. Stock is not changed."
        confirmLabel="Cancel order"
        color="error"
        loading={busy}
        onClose={() => setCancelling(false)}
        onConfirm={() => act(() => ordersApi.cancel(order.id), 'cancelled')}
      />
    </Dialog>
  )
}

export function OrdersPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('status') as OrderStatus | 'ALL' | null) ?? 'PENDING'
  const status = tab === 'ALL' ? undefined : tab
  const orders = useQuery({
    queryKey: ['orders', status ?? 'ALL'],
    queryFn: () => ordersApi.list(status, 300),
    refetchInterval: 30_000,
  })
  const [openId, setOpenId] = useState<number | null>(null)
  const open = orders.data?.find((o) => o.id === openId) ?? null

  return (
    <>
      <PageHeader title="Orders" subtitle="Approve or reject new orders. Workers ship approved ones." />
      <Card>
        <Tabs
          value={tab}
          onChange={(_, v) => setParams({ status: v }, { replace: true })}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}
        >
          {TABS.map((t) => (
            <Tab key={t} value={t} label={t === 'ALL' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()} />
          ))}
        </Tabs>
        <CardContent>
          <QueryState isLoading={orders.isLoading} error={orders.error}>
            {orders.data?.length ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Order</TableCell>
                      <TableCell>Created</TableCell>
                      <TableCell>Customer</TableCell>
                      <TableCell align="right">Lines</TableCell>
                      <TableCell align="right">Total</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Handled by</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {orders.data.map((o) => (
                      <TableRow key={o.id} hover onClick={() => setOpenId(o.id)} sx={{ cursor: 'pointer' }}>
                        <TableCell sx={{ fontWeight: 600 }}>{o.code}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(o.created_at)}</TableCell>
                        <TableCell>{o.customer.full_name}</TableCell>
                        <TableCell align="right">{o.items.length}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {formatMoney(o.total_amount)}
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                            <OrderStatusChip status={o.status} />
                            {o.status === 'PENDING' && hasShortage(o) && (
                              <Typography variant="caption" color="warning.main">
                                short
                              </Typography>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                          <Box component="span" sx={{ color: 'text.secondary' }}>
                            {[o.approved_by?.full_name, o.shipped_by?.full_name].filter(Boolean).join(' → ') || '—'}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <EmptyState title="No orders here" />
            )}
          </QueryState>
        </CardContent>
      </Card>
      {open && <OrderDialog order={open} onClose={() => setOpenId(null)} />}
    </>
  )
}
