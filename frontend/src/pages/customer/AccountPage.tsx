import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
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
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { accountApi } from '@/api/endpoints'
import type { TransactionType } from '@/api/types'
import { EmptyState, PageHeader, QueryState } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { formatDateTime, formatMoney } from '@/format'

const QUICK_AMOUNTS = [5_000, 10_000, 20_000, 50_000, 100_000]
const MIN_TOP_UP = 100
const MAX_TOP_UP = 1_000_000

const TX_LABEL: Record<TransactionType, { label: string; color: 'success' | 'default' | 'info' }> = {
  TOPUP: { label: 'Top-up', color: 'success' },
  PAYMENT: { label: 'Payment', color: 'default' },
  REFUND: { label: 'Refund', color: 'info' },
}

export function useAccount() {
  return useQuery({ queryKey: ['account'], queryFn: accountApi.get })
}

/**
 * Top-up through the simulated "KeyFive Demo Bank": step 1 the amount, step 2 the bank confirms the transfer.
 * No card data is asked and no real money moves.
 */
export function TopUpDialog({ open, onClose, suggested }: { open: boolean; onClose: () => void; suggested?: number }) {
  const account = useAccount()
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<'amount' | 'bank'>('amount')
  const queryClient = useQueryClient()
  const notify = useNotify()

  const value = Number(amount || suggested || 0)
  const error =
    !Number.isInteger(value) || value < MIN_TOP_UP || value > MAX_TOP_UP
      ? `Whole tenge, ${formatMoney(MIN_TOP_UP)} – ${formatMoney(MAX_TOP_UP)}`
      : null

  const close = () => {
    setAmount('')
    setStep('amount')
    onClose()
  }

  const topUp = useMutation({
    mutationFn: () => accountApi.topUp(value),
    onSuccess: (acc) => {
      queryClient.setQueryData(['account'], acc)
      queryClient.invalidateQueries({ queryKey: ['customers', 'me'] })
      notify.success(`${formatMoney(value)} added. Balance ${formatMoney(acc.balance)}`)
      close()
    },
    onError: notify.error,
  })

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      {step === 'amount' ? (
        <>
          <DialogTitle>Top up your account</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField
                label="Amount"
                autoFocus
                value={amount || (suggested ? String(suggested) : '')}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                error={!!amount && !!error}
                helperText={error ?? ' '}
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
                Demo payment: the money comes from <b>{account.data?.bank ?? 'KeyFive Demo Bank'}</b>, a simulated bank. No
                card data is needed and no real money is charged.
              </Alert>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>Cancel</Button>
            <Button variant="contained" disabled={!!error} onClick={() => setStep('bank')}>
              Continue to bank
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccountBalanceIcon color="primary" /> {account.data?.bank ?? 'KeyFive Demo Bank'}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={1.5}>
              <Typography color="text.secondary">Confirm the transfer</Typography>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                {formatMoney(value)}
              </Typography>
              <Typography variant="body2">
                To: KeyFive WMS shop account <b>{account.data?.code}</b>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Simulation for the course project. In a real shop this step is the bank's own payment page.
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setStep('amount')} disabled={topUp.isPending}>
              Back
            </Button>
            <Button variant="contained" onClick={() => topUp.mutate()} disabled={topUp.isPending}>
              Confirm transfer
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  )
}

export function AccountPage() {
  const account = useAccount()
  const [open, setOpen] = useState(false)

  return (
    <>
      <PageHeader
        title="My account"
        subtitle={account.data ? `Account ${account.data.code} · orders are paid from this balance` : undefined}
      />
      <QueryState isLoading={account.isLoading} error={account.error}>
        {account.data && (
          <Stack spacing={3}>
            <Card sx={{ maxWidth: 560 }}>
              <CardContent>
                <Typography color="text.secondary">Balance</Typography>
                <Typography variant="h3" sx={{ fontWeight: 700, my: 1 }}>
                  {formatMoney(account.data.balance)}
                </Typography>
                <Button variant="contained" startIcon={<AddCardOutlinedIcon />} onClick={() => setOpen(true)}>
                  Top up
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  History
                </Typography>
                {account.data.transactions.length ? (
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Date</TableCell>
                          <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Operation</TableCell>
                          <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Details</TableCell>
                          <TableCell align="right">Amount</TableCell>
                          <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                            Balance
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {account.data.transactions.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(t.created_at)}</TableCell>
                            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                              <Chip size="small" label={TX_LABEL[t.tx_type].label} color={TX_LABEL[t.tx_type].color} />
                            </TableCell>
                            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                              {t.order_id ? (
                                <Link component={RouterLink} to="/my-orders" state={{ highlight: t.order_id }}>
                                  {t.note}
                                </Link>
                              ) : (
                                t.note
                              )}
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                whiteSpace: 'nowrap',
                                fontWeight: 600,
                                color: t.tx_type === 'PAYMENT' ? 'text.primary' : 'success.main',
                              }}
                            >
                              {t.tx_type === 'PAYMENT' ? '−' : '+'}
                              {formatMoney(t.amount)}
                            </TableCell>
                            <TableCell align="right" sx={{ whiteSpace: 'nowrap', display: { xs: 'none', sm: 'table-cell' } }}>
                              {formatMoney(t.balance_after)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                ) : (
                  <EmptyState title="No operations yet" text="Top up your account to start shopping." />
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
