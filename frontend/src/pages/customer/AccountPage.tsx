import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import AddCardOutlinedIcon from '@mui/icons-material/AddCardOutlined'
import CreditCardIcon from '@mui/icons-material/CreditCard'
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
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { accountApi } from '@/api/endpoints'
import type { Account, TransactionType } from '@/api/types'
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

/** Card number check digit (Luhn), the same check the server does. */
export function luhnOk(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2
    sum += d
  }
  return sum % 10 === 0
}

/** "4242424242424242" -> "4242 4242 4242 4242" */
const groupDigits = (digits: string) => digits.replace(/(\d{4})(?=\d)/g, '$1 ')

function cardErrors(holder: string, number: string, expiry: string) {
  const [mm, yy] = expiry.split('/')
  const month = Number(mm)
  const year = 2000 + Number(yy)
  const now = new Date()
  return {
    holder: holder.trim().length < 2 ? 'As written on the card' : null,
    number: number.length < 13 ? '13 to 19 digits' : !luhnOk(number) ? 'The number is wrong, check the digits' : null,
    expiry:
      !/^\d{2}\/\d{2}$/.test(expiry) || month < 1 || month > 12
        ? 'MM/YY'
        : year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)
          ? 'The card has expired'
          : null,
  }
}

/** The customer's saved bank card. The server keeps only the holder, brand, last 4 digits and expiry; no CVV is asked. */
export function CardTab({ account }: { account: Account }) {
  const [editing, setEditing] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [holder, setHolder] = useState('')
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [touched, setTouched] = useState(false)
  const queryClient = useQueryClient()
  const notify = useNotify()
  const card = account.card
  const errors = cardErrors(holder, number, expiry)
  const valid = !errors.holder && !errors.number && !errors.expiry

  const reset = () => {
    setEditing(false)
    setHolder('')
    setNumber('')
    setExpiry('')
    setTouched(false)
  }

  const save = useMutation({
    mutationFn: () => {
      const [mm, yy] = expiry.split('/')
      return accountApi.saveCard({ holder, number, exp_month: Number(mm), exp_year: 2000 + Number(yy) })
    },
    onSuccess: (acc) => {
      queryClient.setQueryData(['account'], acc)
      notify.success(`Card •••• ${acc.card?.last4} saved`)
      reset()
    },
    onError: notify.error,
  })

  const remove = useMutation({
    mutationFn: accountApi.removeCard,
    onSuccess: (acc) => {
      queryClient.setQueryData(['account'], acc)
      notify.success('Card removed')
      setConfirmRemove(false)
    },
    onError: notify.error,
  })

  if (!editing) {
    return (
      <Card sx={{ maxWidth: 560 }}>
        <CardContent>
          {card ? (
            <Stack spacing={2}>
              <Box sx={{ p: 2.5, borderRadius: 2, color: 'primary.contrastText', bgcolor: 'primary.main', maxWidth: 360 }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ fontWeight: 700 }}>{card.brand}</Typography>
                  <CreditCardIcon />
                </Stack>
                <Typography sx={{ fontFamily: 'monospace', fontSize: '1.25rem', letterSpacing: 2, my: 2 }}>
                  •••• •••• •••• {card.last4}
                </Typography>
                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography variant="body2">{card.holder}</Typography>
                  <Typography variant="body2">
                    {String(card.exp_month).padStart(2, '0')}/{String(card.exp_year % 100).padStart(2, '0')}
                  </Typography>
                </Stack>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" onClick={() => setEditing(true)}>
                  Replace card
                </Button>
                <Button color="error" onClick={() => setConfirmRemove(true)}>
                  Remove
                </Button>
              </Stack>
            </Stack>
          ) : (
            <>
              <EmptyState title="No card saved" text="Add your bank card details to keep them on your account." />
              <Button variant="contained" startIcon={<AddCardOutlinedIcon />} onClick={() => setEditing(true)} sx={{ mt: 1 }}>
                Add card
              </Button>
            </>
          )}
        </CardContent>
        <Dialog open={confirmRemove} onClose={() => setConfirmRemove(false)}>
          <DialogTitle>Remove the card?</DialogTitle>
          <DialogContent>
            <Typography>{card ? `${card.brand} •••• ${card.last4} will be removed from your account.` : ''}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmRemove(false)}>Cancel</Button>
            <Button color="error" variant="contained" disabled={remove.isPending} onClick={() => remove.mutate()}>
              Remove
            </Button>
          </DialogActions>
        </Dialog>
      </Card>
    )
  }

  const show = (e: string | null) => (touched ? e : null)
  return (
    <Card sx={{ maxWidth: 560 }}>
      <CardContent>
        <Stack
          component="form"
          spacing={2}
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setTouched(true)
            if (valid) save.mutate()
          }}
        >
          <Typography variant="h6">{card ? 'Replace card' : 'Add card'}</Typography>
          <TextField
            label="Card number"
            autoFocus
            value={groupDigits(number)}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 19))}
            error={!!show(errors.number)}
            helperText={show(errors.number) ?? ' '}
            slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'cc-number' } }}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Expiry"
              placeholder="MM/YY"
              value={expiry}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, '').slice(0, 4)
                setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d)
              }}
              error={!!show(errors.expiry)}
              helperText={show(errors.expiry) ?? ' '}
              slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'cc-exp' } }}
              sx={{ width: { sm: 160 } }}
            />
            <TextField
              label="Name on card"
              fullWidth
              value={holder}
              onChange={(e) => setHolder(e.target.value.toUpperCase())}
              error={!!show(errors.holder)}
              helperText={show(errors.holder) ?? ' '}
              slotProps={{ htmlInput: { autoComplete: 'cc-name', maxLength: 100 } }}
            />
          </Stack>
          <Alert severity="info" icon={false}>
            Only the last 4 digits, the name and the expiry date are kept. The CVV is never asked.
          </Alert>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button onClick={reset} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={save.isPending}>
              Save card
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

export function AccountPage() {
  const account = useAccount()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'balance' | 'card'>('balance')

  return (
    <>
      <PageHeader
        title="My account"
        subtitle={account.data ? `Account ${account.data.code} · orders are paid from this balance` : undefined}
      />
      <QueryState isLoading={account.isLoading} error={account.error}>
        {account.data && (
          <Stack spacing={3}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tab value="balance" label="Balance" />
              <Tab value="card" label="Bank card" />
            </Tabs>
            {tab === 'card' ? (
              <CardTab account={account.data} />
            ) : (
            <>
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
            </>
            )}
          </Stack>
        )}
      </QueryState>
      <TopUpDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
