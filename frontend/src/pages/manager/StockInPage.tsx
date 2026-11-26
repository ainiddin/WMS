import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined'
import {
  Alert,
  Autocomplete,
  Button,
  Card,
  CardContent,
  Grid,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { errorMessage } from '@/api/client'
import { catalogApi, movementsApi, type ProductStaff } from '@/api/staff'
import { barcodeInput } from '@/barcode'
import { EmptyState, PageHeader, QueryState } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { formatDateTime } from '@/format'

import { t } from '@/i18n'
const MAX_QUANTITY = 100_000

/**
 * Stock IN on the website: goods received from a supplier. Find the product by its barcode (typed, or a USB
 * scanner) or pick it from the list, enter the quantity. Orders waiting for this product are approved by the server.
 */
export function StockInPage() {
  const [params] = useSearchParams()
  const products = useQuery({ queryKey: ['products', 'staff'], queryFn: () => catalogApi.staffProducts() })
  const recent = useQuery({ queryKey: ['movements', 'IN'], queryFn: () => movementsApi.list({ type: 'IN', limit: 8 }) })
  const [selected, setSelected] = useState<ProductStaff | null>(null)
  const [barcode, setBarcode] = useState('')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const queryClient = useQueryClient()
  const notify = useNotify()

  // ?product=ID preselects a product (the "Stock IN" button of the Restock list).
  const preselectId = Number(params.get('product'))
  const product = selected ?? products.data?.find((p) => p.id === preselectId) ?? null
  const qty = Number(quantity)
  const qtyOk = Number.isInteger(qty) && qty >= 1 && qty <= MAX_QUANTITY

  const findByBarcode = async () => {
    if (!barcode) return
    setLookupError(null)
    try {
      setSelected(await catalogApi.byBarcode(barcode))
      setBarcode('')
    } catch (e) {
      setLookupError(errorMessage(e))
    }
  }

  const save = useMutation({
    mutationFn: () => movementsApi.stockIn({ product_id: product!.id, quantity: qty, note: note.trim() || undefined }),
    onSuccess: (m) => {
      notify.success(`${m.code}: +${m.quantity} × ${t(m.product_name)}`)
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['movements'] })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      setQuantity('')
      setNote('')
      setSelected(null)
    },
    onError: notify.error,
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (product && qtyOk) save.mutate()
  }

  return (
    <>
      <PageHeader
        title={t('Stock IN')}
        subtitle={t('Goods received from a supplier. Type or scan the barcode, or pick the product from the list.')}
      />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Stack spacing={2.5}>
                <TextField
                  label={t('Barcode')}
                  autoFocus
                  value={barcode}
                  onChange={(e) => setBarcode(barcodeInput(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      findByBarcode()
                    }
                  }}
                  helperText={t('Type the digits and press Enter (a USB scanner does it for you)')}
                  slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off' } }}
                />
                {lookupError && <Alert severity="warning">{lookupError}</Alert>}
                <Autocomplete
                  options={products.data?.filter((p) => p.is_active) ?? []}
                  loading={products.isLoading}
                  value={product}
                  onChange={(_, v) => setSelected(v)}
                  getOptionLabel={(p) => `${p.code} · ${t(p.product_name)}`}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  renderInput={(p) => <TextField {...p} label={t('Product')} />}
                />
                {product && (
                  <Alert severity={product.below_min ? 'warning' : 'info'} icon={false}>
                    <b>{t(product.product_name)}</b> — now in stock: <b>{product.quantity}</b> (minimum{' '}
                    {product.min_quantity})
                  </Alert>
                )}
                <Stack component="form" spacing={2} onSubmit={submit} noValidate>
                  <TextField
                    label={t('Quantity received')}
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    error={!!quantity && !qtyOk}
                    helperText={quantity && !qtyOk ? `1 to ${MAX_QUANTITY.toLocaleString('en')}` : ' '}
                    slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                  />
                  <TextField
                    label={t('Note (optional)')}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t('Invoice number, supplier…')}
                    slotProps={{ htmlInput: { maxLength: 255 } }}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    startIcon={<MoveToInboxOutlinedIcon />}
                    disabled={!product || !qtyOk || save.isPending}
                  >
                    {t('Save stock IN')}
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>
                {t('Latest stock IN')}
              </Typography>
              <QueryState isLoading={recent.isLoading} error={recent.error}>
                {recent.data?.length ? (
                  <List dense disablePadding>
                    {recent.data.map((m) => (
                      <ListItem key={m.id} disableGutters divider>
                        <ListItemText
                          primary={`+${m.quantity} × ${t(m.product_name)}`}
                          secondary={`${m.code} · ${formatDateTime(m.movement_time)} · ${m.employee_name}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <EmptyState title={t('Nothing received yet')} text={t('Stock IN records appear here.')} />
                )}
              </QueryState>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  )
}
