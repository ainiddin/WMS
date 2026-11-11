import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  Stack,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router'
import { ordersApi } from '@/api/endpoints'
import { ConfirmDialog, EmptyState, OrderStatusChip, PageHeader, QueryState } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { OrderItemsTable, OrderMeta, OrderProgress, WaitingNotice } from '@/components/OrderParts'
import { formatDateTime, formatMoney } from '@/format'

export function MyOrdersPage() {
  const highlight = (useLocation().state as { highlight?: number } | null)?.highlight
  const orders = useQuery({ queryKey: ['orders', 'mine'], queryFn: () => ordersApi.list(), refetchInterval: 20_000 })
  const [expanded, setExpanded] = useState<number | false>(highlight ?? false)
  const [cancelId, setCancelId] = useState<number | null>(null)
  const queryClient = useQueryClient()
  const notify = useNotify()

  const cancel = useMutation({
    mutationFn: (id: number) => ordersApi.cancel(id),
    onSuccess: (o) => {
      notify.success(`Order ${o.code} cancelled`)
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      setCancelId(null)
    },
    onError: notify.error,
  })

  return (
    <>
      <PageHeader title="My orders" subtitle="Statuses update automatically." />
      <QueryState isLoading={orders.isLoading} error={orders.error}>
        {orders.data?.length ? (
          <Box>
            {orders.data.map((order) => (
              <Accordion
                key={order.id}
                expanded={expanded === order.id}
                onChange={(_, open) => setExpanded(open ? order.id : false)}
                variant="outlined"
                disableGutters
                sx={{ mb: 1.5, borderRadius: 2, '&:before': { display: 'none' } }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={{ xs: 0.5, sm: 2 }}
                    sx={{ width: '100%', alignItems: { sm: 'center' }, pr: 1 }}
                  >
                    <Typography sx={{ fontWeight: 600, minWidth: 70 }}>{order.code}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 160 }}>
                      {formatDateTime(order.created_at)}
                    </Typography>
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      {order.items.length} item{order.items.length > 1 ? 's' : ''}
                    </Typography>
                    <Typography sx={{ fontWeight: 600, minWidth: 100 }}>{formatMoney(order.total_amount)}</Typography>
                    <Box>
                      <OrderStatusChip status={order.status} />
                    </Box>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={2.5}>
                    {order.waiting && (
                      <WaitingNotice
                        waiting={order.waiting}
                        etaMin={order.eta_min_days}
                        etaMax={order.eta_max_days}
                        footer="The order is confirmed automatically when the goods arrive. If you cannot wait, cancel it: the money goes back to your account at once."
                      />
                    )}
                    <OrderProgress order={order} />
                    <OrderMeta order={order} />
                    <OrderItemsTable order={order} />
                    {(order.status === 'PENDING' || order.status === 'APPROVED') && (
                      <Box>
                        <Button color="error" variant="outlined" onClick={() => setCancelId(order.id)}>
                          Cancel order
                        </Button>
                      </Box>
                    )}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        ) : (
          <Card>
            <EmptyState
              title="No orders yet"
              action={
                <Button variant="contained" component={RouterLink} to="/catalog" sx={{ mt: 1 }}>
                  Start shopping
                </Button>
              }
            />
          </Card>
        )}
      </QueryState>
      <ConfirmDialog
        open={cancelId !== null}
        title="Cancel this order?"
        text="You can cancel until the order is shipped. The money goes back to your account at once."
        confirmLabel="Cancel order"
        color="error"
        loading={cancel.isPending}
        onConfirm={() => cancelId && cancel.mutate(cancelId)}
        onClose={() => setCancelId(null)}
      />
    </>
  )
}
