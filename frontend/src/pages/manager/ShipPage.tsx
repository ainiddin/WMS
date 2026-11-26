import AddIcon from '@mui/icons-material/Add'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import RemoveIcon from '@mui/icons-material/Remove'
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
  Grid,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ordersApi, teamApi } from '@/api/staff'
import type { Order, OrderItem } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import { barcodeInput, pickScan } from '@/barcode'
import { EmptyState, PageHeader, QueryState } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { OrderItemsTable, OrderMeta } from '@/components/OrderParts'
import { formatDateTime } from '@/format'
import { t } from '@/i18n'

/** How often the list refreshes while the page is open (new approved orders). */
export const SHIP_LIST_REFRESH_MS = 20_000

/**
 * Picking: every unit is counted. The first unit of a line needs its barcode (typed or from a USB scanner),
 * which proves the right product is in hand; after that the rest can be typed again, added with +, or the count
 * typed in. Lines without a barcode are counted by hand. Shipping only when every line has its exact quantity.
 */
export function ShipDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const [picked, setPicked] = useState<Record<number, number>>({})
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const queryClient = useQueryClient()
  const notify = useNotify()

  const ship = useMutation({
    mutationFn: () => ordersApi.ship(order.id),
    onSuccess: (o) => {
      notify.success(t('Order {0} shipped', o.code))
      for (const key of ['orders', 'products', 'movements', 'reports', 'performance']) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
      onClose()
    },
    onError: notify.error,
  })

  const count = (id: number) => picked[id] ?? 0
  const unlocked = (item: OrderItem) => !item.barcode || count(item.id) > 0
  const setCount = (item: OrderItem, n: number) => {
    const min = item.barcode ? 1 : 0 // a confirmed line keeps at least the confirmed unit
    setPicked((prev) => ({ ...prev, [item.id]: Math.max(min, Math.min(item.quantity, n)) }))
  }

  const onScan = () => {
    if (!code) return
    const result = pickScan(code, order.items, picked)
    if (result.kind === 'wrong-product') {
      setMessage({ ok: false, text: t('Barcode {0} is not in this order — wrong product', result.code) })
    } else if (result.kind === 'already-complete') {
      setMessage({
        ok: false,
        text: t('All {0} × {1} are already picked — put this one back', result.item.quantity, t(result.item.product_name)),
      })
    } else {
      setPicked((prev) => ({ ...prev, [result.item.id]: result.picked }))
      setMessage({ ok: true, text: t('{0}: {1} of {2}', t(result.item.product_name), result.picked, result.item.quantity) })
    }
    setCode('')
  }

  const total = order.items.reduce((sum, i) => sum + i.quantity, 0)
  const done = order.items.reduce((sum, i) => sum + count(i.id), 0)
  const allPicked = order.items.every((i) => count(i.id) === i.quantity)

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('Ship order {0}', order.code)}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <OrderMeta order={order} staff />
          <TextField
            label={t('Barcode of every unit')}
            autoFocus
            value={code}
            onChange={(e) => setCode(barcodeInput(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onScan()
              }
            }}
            helperText={t('Type the digits and press Enter (a USB scanner does it for you)')}
            slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off' } }}
          />
          {message && (
            <Alert severity={message.ok ? 'success' : 'error'} role="status">
              {message.text}
            </Alert>
          )}
          <Box>
            <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                {t('Picked')}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {t('{0} of {1} units', done, total)}
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={(done / total) * 100}
              color={allPicked ? 'success' : 'primary'}
              sx={{ height: 6, borderRadius: 3 }}
            />
          </Box>
          <List dense disablePadding>
            {order.items.map((item) => {
              const n = count(item.id)
              const complete = n === item.quantity
              const open = unlocked(item)
              return (
                <ListItem key={item.id} divider sx={{ gap: 1, flexWrap: 'wrap', py: 1 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    {complete ? <CheckCircleIcon color="success" /> : <RadioButtonUncheckedIcon color="disabled" />}
                  </ListItemIcon>
                  <ListItemText
                    sx={{ flex: '1 1 180px' }}
                    primary={`${item.quantity} × ${t(item.product_name)}`}
                    secondary={
                      item.barcode
                        ? `${item.product_code} · ${item.barcode}${open ? '' : ' · ' + t('type or scan it first')}`
                        : `${item.product_code} · ` + t('no barcode: count by hand')
                    }
                  />
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                    <IconButton
                      size="small"
                      aria-label={t('One less {0}', t(item.product_name))}
                      disabled={!open || n <= (item.barcode ? 1 : 0)}
                      onClick={() => setCount(item, n - 1)}
                    >
                      <RemoveIcon fontSize="small" />
                    </IconButton>
                    <TextField
                      size="small"
                      value={n}
                      disabled={!open}
                      onChange={(e) => setCount(item, Number(e.target.value.replace(/\D/g, '') || 0))}
                      sx={{ width: 64 }}
                      slotProps={{
                        htmlInput: {
                          inputMode: 'numeric',
                          'aria-label': t('Picked {0}', t(item.product_name)),
                          style: { textAlign: 'center' },
                        },
                      }}
                    />
                    <IconButton
                      size="small"
                      aria-label={t('One more {0}', t(item.product_name))}
                      disabled={!open || complete}
                      onClick={() => setCount(item, n + 1)}
                    >
                      <AddIcon fontSize="small" />
                    </IconButton>
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 28 }}>
                      / {item.quantity}
                    </Typography>
                  </Stack>
                </ListItem>
              )
            })}
          </List>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button
          variant="contained"
          startIcon={<LocalShippingOutlinedIcon />}
          disabled={!allPicked || ship.isPending}
          onClick={() => ship.mutate()}
        >
          {t('Ship (OUT)')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** Approved orders of the Manager's team (given to his Workers or to himself); the server refuses any other. */
export function ShipPage() {
  const { user } = useAuth()
  const orders = useQuery({
    queryKey: ['orders', 'APPROVED'],
    queryFn: () => ordersApi.list('APPROVED'),
    refetchInterval: SHIP_LIST_REFRESH_MS,
  })
  const members = useQuery({ queryKey: ['team', 'members'], queryFn: teamApi.members })
  const [shipping, setShipping] = useState<Order | null>(null)

  const team = new Set([...(members.data ?? []).map((m) => m.employee_id), user?.employee_id])
  const mine = (orders.data ?? []).filter((o) => o.assigned_to && team.has(o.assigned_to.id))
  const units = mine.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0)

  return (
    <>
      <PageHeader
        title={t('Orders to ship')}
        subtitle={t('Approved orders of your team, oldest first: {0} orders, {1} units. Every unit is checked by its barcode.', mine.length, units)}
      />
      <QueryState isLoading={orders.isLoading || members.isLoading} error={orders.error ?? members.error}>
        {mine.length ? (
          <Grid container spacing={2}>
            {mine.map((order) => (
              <Grid key={order.id} size={{ xs: 12, lg: 6 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1, gap: 1 }}>
                      <Typography variant="h6">{order.code}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t('approved {0}', formatDateTime(order.approved_at))}
                      </Typography>
                    </Stack>
                    <OrderMeta order={order} staff />
                    <Box sx={{ mt: 1.5 }}>
                      <OrderItemsTable order={order} showStock />
                    </Box>
                    <Button
                      fullWidth
                      variant="contained"
                      size="large"
                      startIcon={<LocalShippingOutlinedIcon />}
                      sx={{ mt: 2 }}
                      onClick={() => setShipping(order)}
                    >
                      {t('Pick & ship {0}', order.code)}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        ) : (
          <Card>
            <EmptyState title={t('Nothing to ship')} text={t('Approved orders of your team appear here.')} />
          </Card>
        )}
      </QueryState>
      {shipping && <ShipDialog order={shipping} onClose={() => setShipping(null)} />}
    </>
  )
}
