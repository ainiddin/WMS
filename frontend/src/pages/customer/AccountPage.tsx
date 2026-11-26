import AddCardOutlinedIcon from '@mui/icons-material/AddCardOutlined'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router'
import { accountApi, paymentsApi } from '@/api/endpoints'
import type { Payment, TransactionType } from '@/api/types'
import { EmptyState, PageHeader, QueryState } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { formatDateTime, formatMoney } from '@/format'

import { t } from '@/i18n'
const QUICK_AMOUNTS = [5_000, 10_000, 20_000, 50_000, 100_000]
// The server checks the limits (also 1 000 000 KZT a day); these only help to type a right amount.
const MIN_TOP_UP = 100
const MAX_TOP_UP = 300_000
/** After coming back from the gateway: ask the server every 2 s, at most this long, until the webhook decided. */
export const PAYMENT_CHECK_MS = 2000
export const PAYMENT_WAIT_MS = 30_000

const TX_LABEL: Record<TransactionType, { label: string; color: 'success' | 'default' | 'info' }> = {
  TOPUP: { label: 'Top-up', color: 'success' },
  PAYMENT: { label: 'Payment', color: 'default' },
  REFUND: { label: 'Refund', color: 'info' },
}

export function useAccount() {
  return useQuery({ queryKey: ['account'], queryFn: accountApi.get })
}

/** Leaves the site for the gateway's page (a real redirect: the card is typed there, never in our forms). */
export const gateway = { open: (url: string) => window.location.assign(url) }

/**
 * Top-up by card: the amount here, then the CardPay Fake page (another "company") takes the card.
 * The money is added only when the gateway confirms it to the server.
 */
export function TopUpDialog({ open, onClose, suggested }: { open: boolean; onClose: () => void; suggested?: number }) {
  const [amount, setAmount] = useState('')
  const notify = useNotify()

  const value = Number(amount || suggested || 0)
  const error =
    !Number.isInteger(value) || value < MIN_TOP_UP || value > MAX_TOP_UP
      ? t('Whole tenge, {0} – {1} at a time', formatMoney(MIN_TOP_UP), formatMoney(MAX_TOP_UP))
      : null

  const close = () => {
    setAmount('')
    onClose()
  }

  const start = useMutation({
    mutationFn: () => paymentsApi.topUp(value),
    onSuccess: (started) => gateway.open(started.checkout_url),
    onError: notify.error,
  })

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>{t('Top up your account')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label={t('Amount')}
            autoFocus
            value={amount || (suggested ? String(suggested) : '')}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            error={!!amount && !!error}
            helperText={error ?? t('Up to 1 000 000 ₸ a day')}
            slotProps={{
              input: { endAdornment: <InputAdornment position="end">₸</InputAdornment> },
              htmlInput: { inputMode: 'numeric' },
            }}
          />
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {QUICK_AMOUNTS.map((a) => (
              <Chip key={a} label={formatMoney(a)} onClick={() => setAmount(String(a))} variant="outlined" />
            ))}
          </Stack>
          <Alert severity="info" icon={false}>
            {t('You will pay by card on the CardPay Fake page: a pretend payment gateway for this course project. ' +
              'Do not type a real card there; no real money is charged.')}
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={start.isPending}>
          {t('Cancel')}
        </Button>
        <Button variant="contained" disabled={!!error || start.isPending} onClick={() => start.mutate()}>
          {start.isPending ? t('Opening…') : t('Pay by card')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export function paymentTone(p: Payment): 'success' | 'info' | 'warning' {
  return p.status === 'SUCCEEDED' ? 'success' : p.status === 'PENDING' ? 'info' : 'warning'
}

export function paymentText(p: Payment, waitedLong = false): string {
  switch (p.status) {
    case 'SUCCEEDED':
      return p.card_last4
        ? t('{0} added by {1} •• {2}.', formatMoney(p.amount), p.card_brand, p.card_last4)
        : t('{0} added.', formatMoney(p.amount))
    case 'FAILED':
      return t('The payment was not made: {0}. Nothing was charged.', p.failure_reason ?? t('cancelled'))
    case 'EXPIRED':
      return t('The payment link expired. Nothing was charged; start a new top-up.')
    default:
      return waitedLong
        ? t('The payment is not confirmed yet. If you paid, the money appears in a moment; refresh the page.')
        : t('Waiting for the payment gateway to confirm…')
  }
}

/** What the customer sees after coming back from the gateway. Only the server's answer counts, not the return. */
export function PaymentResult({ code, onDone }: { code: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [gaveUp, setGaveUp] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setGaveUp(true), PAYMENT_WAIT_MS)
    return () => window.clearTimeout(id)
  }, [code])
  const payment = useQuery({
    queryKey: ['payment', code],
    queryFn: () => paymentsApi.status(code),
    refetchInterval: (q) => (q.state.data?.status === 'PENDING' && !gaveUp ? PAYMENT_CHECK_MS : false),
  })
  const status = payment.data?.status
  useEffect(() => {
    if (status === 'SUCCEEDED') {
      queryClient.invalidateQueries({ queryKey: ['account'] })
      queryClient.invalidateQueries({ queryKey: ['customers', 'me'] })
    }
  }, [status, queryClient])

  if (payment.isError)
    return (
      <Alert severity="error" onClose={onDone}>
        {t('This payment was not found.')}
      </Alert>
    )
  if (!payment.data) return <Alert severity="info">{t('Checking the payment…')}</Alert>
  const done = payment.data.status !== 'PENDING'
  return (
    <Alert severity={paymentTone(payment.data)} onClose={done ? onDone : undefined} role="status">
      {paymentText(payment.data, gaveUp)}
    </Alert>
  )
}

export function AccountPage() {
  const account = useAccount()
  const [open, setOpen] = useState(false)
  const [params, setParams] = useSearchParams()
  const returned = params.get('payment')

  return (
    <>
      <PageHeader
        title={t('My account')}
        subtitle={account.data ? t('Account {0} · orders are paid from this balance', account.data.code) : undefined}
      />
      <QueryState isLoading={account.isLoading} error={account.error}>
        {account.data && (
          <Stack spacing={3}>
            {returned && <PaymentResult code={returned} onDone={() => setParams({}, { replace: true })} />}
            <Card sx={{ maxWidth: 560 }}>
              <CardContent>
                <Typography color="text.secondary">{t('Balance')}</Typography>
                <Typography variant="h3" sx={{ fontWeight: 700, my: 1 }}>
                  {formatMoney(account.data.balance)}
                </Typography>
                <Button variant="contained" startIcon={<AddCardOutlinedIcon />} onClick={() => setOpen(true)}>
                  {t('Top up')}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {t('History')}
                </Typography>
                {account.data.transactions.length ? (
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>{t('Date')}</TableCell>
                          <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('Operation')}</TableCell>
                          <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('Details')}</TableCell>
                          <TableCell align="right">{t('Amount')}</TableCell>
                          <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                            {t('Balance')}
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {account.data.transactions.map((tx) => (
                          <TableRow key={tx.id}>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(tx.created_at)}</TableCell>
                            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                              <Chip size="small" label={t(TX_LABEL[tx.tx_type].label)} color={TX_LABEL[tx.tx_type].color} />
                            </TableCell>
                            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                              {tx.order_id ? (
                                <Link component={RouterLink} to="/my-orders" state={{ highlight: tx.order_id }}>
                                  {tx.note}
                                </Link>
                              ) : (
                                tx.note
                              )}
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                whiteSpace: 'nowrap',
                                fontWeight: 600,
                                color: tx.tx_type === 'PAYMENT' ? 'text.primary' : 'success.main',
                              }}
                            >
                              {tx.tx_type === 'PAYMENT' ? '−' : '+'}
                              {formatMoney(tx.amount)}
                            </TableCell>
                            <TableCell align="right" sx={{ whiteSpace: 'nowrap', display: { xs: 'none', sm: 'table-cell' } }}>
                              {formatMoney(tx.balance_after)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                ) : (
                  <EmptyState title={t('No operations yet')} text={t('Top up your account to start shopping.')} />
                )}
              </CardContent>
            </Card>
          </Stack>
        )}
      </QueryState>
      <TopUpDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
