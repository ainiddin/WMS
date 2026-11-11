import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import ShuffleIcon from '@mui/icons-material/Shuffle'
import {
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { ordersApi } from '@/api/endpoints'
import type { Order, OrderStatus } from '@/api/types'
import { ConfirmDialog, EmptyState, OrderStatusChip, PageHeader, QueryState, Section } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { formatEta, OrderItemsTable, OrderMeta, OrderProgress, WaitingNotice } from '@/components/OrderParts'
import { formatDateTime, formatMoney } from '@/format'

const TABS: (OrderStatus | 'ALL')[] = ['APPROVED', 'PENDING', 'SHIPPED', 'REJECTED', 'CANCELLED', 'ALL']
const TAB_LABEL: Record<OrderStatus | 'ALL', string> = {
  APPROVED: 'To ship',
  PENDING: 'Waiting for stock',
  SHIPPED: 'Shipped',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  ALL: 'All',
}

/** Open work of every Worker. New orders go to the least loaded one; Rebalance spreads all open orders again. */
function WorkloadCard() {
  const workload = useQuery({ queryKey: ['orders', 'workload'], queryFn: ordersApi.workload, refetchInterval: 30_000 })
  const queryClient = useQueryClient()
  const notify = useNotify()
  const rebalance = useMutation({
    mutationFn: ordersApi.rebalance,
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      notify.success(r.moved ? `${r.moved} orders moved to other Workers` : 'Already balanced: nothing to move')
    },
    onError: notify.error,
  })
  const rows = workload.data ?? []
  const max = Math.max(1, ...rows.map((r) => r.open_units))

  return (
    <Section
      title="Worker workload (open orders)"
      action={
        <Button size="small" startIcon={<ShuffleIcon />} onClick={() => rebalance.mutate()} disabled={rebalance.isPending}>
          Rebalance
        </Button>
      }
    >
      <QueryState isLoading={workload.isLoading} error={workload.error}>
        {rows.length ? (
          <Stack spacing={1}>
            {rows.map((r) => (
              <Stack key={r.worker.id} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Typography variant="body2" sx={{ width: { xs: 110, sm: 170 }, flexShrink: 0 }} noWrap>
                  {r.worker.full_name}
                </Typography>
                <Box sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: 'action.hover', overflow: 'hidden' }}>
                  <Box sx={{ width: `${(r.open_units / max) * 100}%`, height: '100%', bgcolor: 'primary.main' }} />
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ width: 120, textAlign: 'right', flexShrink: 0 }}>
                  {r.open_orders} {r.open_orders === 1 ? 'order' : 'orders'} · {r.open_units} {r.open_units === 1 ? 'unit' : 'units'}
                </Typography>
              </Stack>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No active Workers: approved orders wait in a common queue until a Worker is approved.
          </Typography>
        )}
      </QueryState>
    </Section>
  )
}

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
  const open = order.status === 'PENDING' || order.status === 'APPROVED'

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
          {order.waiting && (
            <WaitingNotice
              waiting={order.waiting}
              etaMin={order.eta_min_days}
              etaMax={order.eta_max_days}
              footer="The system approves it and gives it to a Worker as soon as the goods arrive (stock IN). No action needed."
            />
          )}
          <OrderItemsTable order={order} showStock={open} />
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
        {open && (
          <Button color="error" onClick={() => setCancelling(true)} disabled={busy} sx={{ mr: 'auto' }}>
            Cancel order
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
        {open &&
          (rejecting ? (
            <Button color="error" variant="contained" disabled={busy} onClick={() => act(() => ordersApi.reject(order.id, reason), 'rejected')}>
              Confirm reject
            </Button>
          ) : (
            <>
              <Button color="error" variant="outlined" startIcon={<CloseIcon />} onClick={() => setRejecting(true)} disabled={busy}>
                Reject
              </Button>
              {order.status === 'PENDING' && !order.waiting && (
                <Button
                  color="success"
                  variant="contained"
                  startIcon={<CheckIcon />}
                  disabled={busy}
                  onClick={() => act(() => ordersApi.approve(order.id), 'approved')}
                >
                  Approve now
                </Button>
              )}
            </>
          ))}
      </DialogActions>
      <ConfirmDialog
        open={cancelling}
        title={`Cancel order ${order.code}?`}
        text="The order is not shipped yet, so stock is not changed. The money goes back to the customer's account."
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
  const tab = (params.get('status') as OrderStatus | 'ALL' | null) ?? 'APPROVED'
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
      <PageHeader
        title="Orders"
        subtitle="Orders are approved and given to the least loaded Worker automatically. You handle the exceptions."
      />
      <Box sx={{ mb: 3 }}>
        <WorkloadCard />
      </Box>
      <Card>
        <Tabs
          value={tab}
          onChange={(_, v) => setParams({ status: v }, { replace: true })}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}
        >
          {TABS.map((t) => (
            <Tab key={t} value={t} label={TAB_LABEL[t]} />
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
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Worker</TableCell>
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
                            {o.status === 'PENDING' && formatEta(o.eta_min_days, o.eta_max_days) && (
                              <Typography variant="caption" color="warning.main" sx={{ whiteSpace: 'nowrap' }}>
                                {formatEta(o.eta_min_days, o.eta_max_days)}
                              </Typography>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                          <Box component="span" sx={{ color: 'text.secondary' }}>
                            {(o.status === 'SHIPPED' ? o.shipped_by : o.assigned_to)?.full_name ?? '—'}
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
