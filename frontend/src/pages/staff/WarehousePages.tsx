import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined'
import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import SearchIcon from '@mui/icons-material/Search'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  InputAdornment,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { errorMessage } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { catalogApi, movementsApi, ordersApi, type MovementFilters } from '@/api/endpoints'
import type { MovementType, Order, ProductStaff } from '@/api/types'
import { BarcodeField } from '@/components/BarcodeScanner'
import { EmptyState, PageHeader, QueryState, Section } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { OrderItemsTable, OrderMeta } from '@/components/OrderParts'
import { formatDateTime, formatNumber } from '@/format'

function useStaffProducts() {
  return useQuery({ queryKey: ['products', 'staff'], queryFn: () => catalogApi.staffProducts({ sort: 'code' }) })
}

function StockLevel({ product }: { product: Pick<ProductStaff, 'quantity' | 'min_quantity'> }) {
  const ratio = product.min_quantity ? Math.min(1, product.quantity / (product.min_quantity * 3)) : 1
  const low = product.quantity < product.min_quantity
  return (
    <Box sx={{ minWidth: 90 }}>
      <LinearProgress
        variant="determinate"
        value={ratio * 100}
        color={product.quantity === 0 ? 'error' : low ? 'warning' : 'success'}
        sx={{ height: 6, borderRadius: 3 }}
      />
    </Box>
  )
}

// ---------------- Stock list ----------------
export function StockPage() {
  const products = useStaffProducts()
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => catalogApi.categories() })
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [lowOnly, setLowOnly] = useState(false)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (products.data ?? []).filter(
      (p) =>
        (!q || p.product_name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.barcode?.includes(q)) &&
        (!category || String(p.category.id) === category) &&
        (!lowOnly || p.below_min),
    )
  }, [products.data, search, category, lowOnly])
  const lowCount = products.data?.filter((p) => p.below_min).length ?? 0

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle={
          lowCount ? (
            <Box component="span" sx={{ color: 'warning.main' }}>
              {lowCount} product{lowCount > 1 ? 's are' : ' is'} below the minimum
            </Box>
          ) : (
            'All products are above the minimum'
          )
        }
      />
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              placeholder="Search by name, code or barcode"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
            />
            <TextField select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ minWidth: 180 }}>
              <MenuItem value="">All</MenuItem>
              {categories.data?.map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={<Switch checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />}
              label="Below minimum only"
            />
          </Stack>
          <QueryState isLoading={products.isLoading} error={products.error}>
            {rows.length ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Code</TableCell>
                      <TableCell>Product</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Category</TableCell>
                      <TableCell align="right">Qty</TableCell>
                      <TableCell align="right">Min</TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Level</TableCell>
                      <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Barcode</TableCell>
                      <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Updated</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((p) => (
                      <TableRow
                        key={p.id}
                        hover
                        sx={p.below_min ? { bgcolor: 'rgba(237, 108, 2, 0.08)' } : undefined}
                      >
                        <TableCell>{p.code}</TableCell>
                        <TableCell>
                          {p.product_name}
                          {p.below_min && (
                            <Chip
                              size="small"
                              color={p.quantity === 0 ? 'error' : 'warning'}
                              icon={<WarningAmberIcon />}
                              label={p.quantity === 0 ? 'Out of stock' : 'Below min'}
                              sx={{ ml: 1 }}
                            />
                          )}
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{p.category.name}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {formatNumber(p.quantity)}
                        </TableCell>
                        <TableCell align="right">{p.min_quantity}</TableCell>
                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                          <StockLevel product={p} />
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, fontFamily: 'monospace' }}>{p.barcode}</TableCell>
                        <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, whiteSpace: 'nowrap' }}>
                          {formatDateTime(p.last_updated)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <EmptyState title="No products match" />
            )}
          </QueryState>
        </CardContent>
      </Card>
    </>
  )
}

// ---------------- Stock IN ----------------
export function StockInPage() {
  const products = useStaffProducts()
  const [params] = useSearchParams()
  const [selected, setSelected] = useState<ProductStaff | null>(null)
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const notify = useNotify()

  // ?product=ID preselects a product (link from the Restock list).
  const preselectId = Number(params.get('product'))
  const product = selected ?? products.data?.find((p) => p.id === preselectId) ?? null

  const recent = useQuery({
    queryKey: ['movements', { type: 'IN', limit: 8 }],
    queryFn: () => movementsApi.list({ type: 'IN', limit: 8 }),
  })

  const save = useMutation({
    mutationFn: () => movementsApi.stockIn({ product_id: product!.id, quantity: Number(quantity), note: note.trim() || undefined }),
    onSuccess: (m) => {
      notify.success(`${m.code}: +${m.quantity} × ${m.product_name}`)
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['movements'] })
      queryClient.invalidateQueries({ queryKey: ['performance'] })
      setQuantity('')
      setNote('')
      setSelected(null)
    },
    onError: notify.error,
  })

  const findByBarcode = async (code: string) => {
    setLookupError(null)
    try {
      const found = await catalogApi.byBarcode(code)
      setSelected(found)
    } catch (e) {
      setLookupError(errorMessage(e))
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (product && Number(quantity) > 0) save.mutate()
  }

  return (
    <>
      <PageHeader title="Stock IN" subtitle="Register goods received from a supplier. Scan the barcode or pick the product." />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Stack spacing={2.5}>
                <BarcodeField onSubmit={findByBarcode} autoFocus />
                {lookupError && <Alert severity="warning">{lookupError}</Alert>}
                <Autocomplete
                  options={products.data?.filter((p) => p.is_active) ?? []}
                  loading={products.isLoading}
                  value={product}
                  onChange={(_, v) => setSelected(v)}
                  getOptionLabel={(p) => `${p.code} · ${p.product_name}`}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  renderInput={(p) => <TextField {...p} label="Product" />}
                />
                {product && (
                  <Alert severity={product.below_min ? 'warning' : 'info'} icon={false}>
                    <b>{product.product_name}</b> — now in stock: <b>{product.quantity}</b> (minimum {product.min_quantity})
                  </Alert>
                )}
                <Stack component="form" spacing={2} onSubmit={submit}>
                  <TextField
                    label="Quantity received"
                    type="number"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    slotProps={{ htmlInput: { min: 1, max: 100000, inputMode: 'numeric' } }}
                  />
                  <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Invoice number, supplier…" />
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    startIcon={<MoveToInboxOutlinedIcon />}
                    disabled={!product || !(Number(quantity) > 0) || save.isPending}
                  >
                    Save stock IN
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Section title="Latest stock IN">
            <QueryState isLoading={recent.isLoading} error={recent.error}>
              <List dense disablePadding>
                {recent.data?.map((m) => (
                  <ListItem key={m.id} disableGutters divider>
                    <ListItemText
                      primary={`+${m.quantity} × ${m.product_name}`}
                      secondary={`${m.code} · ${formatDateTime(m.movement_time)} · ${m.employee_name}`}
                    />
                  </ListItem>
                ))}
              </List>
            </QueryState>
          </Section>
        </Grid>
      </Grid>
    </>
  )
}

// ---------------- Orders to ship ----------------
function ShipDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const theme = useTheme()
  const phone = useMediaQuery(theme.breakpoints.down('sm'))
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [skipScan, setSkipScan] = useState(false)
  const [scanMessage, setScanMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const queryClient = useQueryClient()
  const notify = useNotify()

  const ship = useMutation({
    mutationFn: () => ordersApi.ship(order.id),
    onSuccess: (o) => {
      notify.success(`Order ${o.code} shipped`)
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['movements'] })
      queryClient.invalidateQueries({ queryKey: ['performance'] })
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
      onClose()
    },
    onError: notify.error,
  })

  // Scanning a line marks it as picked; a wrong product is reported at once.
  const onScan = (code: string) => {
    const item = order.items.find((i) => i.barcode === code)
    if (!item) {
      setScanMessage({ ok: false, text: `Barcode ${code} is not in this order` })
      return
    }
    setPicked((prev) => new Set(prev).add(item.id))
    setScanMessage({ ok: true, text: `${item.product_name} × ${item.quantity} picked` })
  }

  const allPicked = order.items.every((i) => picked.has(i.id))

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle>Ship order {order.code}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <OrderMeta order={order} staff />
          <BarcodeField onSubmit={onScan} label="Scan each product" autoFocus disabled={skipScan} />
          {scanMessage && <Alert severity={scanMessage.ok ? 'success' : 'error'}>{scanMessage.text}</Alert>}
          <List dense disablePadding>
            {order.items.map((item) => {
              const done = skipScan || picked.has(item.id)
              return (
                <ListItem
                  key={item.id}
                  divider
                  secondaryAction={
                    !skipScan && (
                      <Button size="small" onClick={() => setPicked((p) => new Set(p).add(item.id))} disabled={done}>
                        Mark
                      </Button>
                    )
                  }
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    {done ? <CheckCircleIcon color="success" /> : <RadioButtonUncheckedIcon color="disabled" />}
                  </ListItemIcon>
                  <ListItemText
                    primary={`${item.quantity} × ${item.product_name}`}
                    secondary={`${item.product_code} · ${item.barcode ?? 'no barcode'} · in stock ${item.available_quantity}`}
                  />
                </ListItem>
              )
            })}
          </List>
          <FormControlLabel
            control={<Switch checked={skipScan} onChange={(e) => setSkipScan(e.target.checked)} />}
            label="Skip scanning (pick list checked by hand)"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={<LocalShippingOutlinedIcon />}
          disabled={!(allPicked || skipScan) || ship.isPending}
          onClick={() => ship.mutate()}
        >
          Ship (OUT)
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function ShipCard({ order, onShip, mine }: { order: Order; onShip: () => void; mine: boolean }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1, gap: 1 }}>
          <Typography variant="h6">{order.code}</Typography>
          <Typography variant="body2" color="text.secondary">
            approved {formatDateTime(order.approved_at)}
          </Typography>
        </Stack>
        <OrderMeta order={order} staff />
        <Box sx={{ mt: 1.5 }}>
          <OrderItemsTable order={order} showStock />
        </Box>
        <Button
          fullWidth
          variant={mine ? 'contained' : 'outlined'}
          size="large"
          startIcon={<LocalShippingOutlinedIcon />}
          sx={{ mt: 2 }}
          onClick={onShip}
        >
          {mine ? 'Pick & ship' : 'Take over & ship'}
        </Button>
      </CardContent>
    </Card>
  )
}

export function OrdersToShipPage() {
  const { user } = useAuth()
  const orders = useQuery({ queryKey: ['orders', 'APPROVED'], queryFn: () => ordersApi.list('APPROVED'), refetchInterval: 20_000 })
  const [shipping, setShipping] = useState<Order | null>(null)
  const isWorker = user?.role === 'WORKER'
  const mine = (orders.data ?? []).filter((o) => isWorker && o.assigned_to?.id === user?.employee_id)
  const others = (orders.data ?? []).filter((o) => !mine.includes(o))
  const units = (list: Order[]) => list.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0)

  const grid = (list: Order[], isMine: boolean) => (
    <Grid container spacing={2}>
      {list.map((order) => (
        <Grid key={order.id} size={{ xs: 12, lg: 6 }}>
          <ShipCard order={order} mine={isMine} onShip={() => setShipping(order)} />
        </Grid>
      ))}
    </Grid>
  )

  return (
    <>
      <PageHeader
        title="Orders to ship"
        subtitle="The system gives every new order to the Worker with the least open work. Oldest first."
      />
      <QueryState isLoading={orders.isLoading} error={orders.error}>
        <Stack spacing={3}>
          {isWorker && (
            <Box>
              <Typography variant="h6" sx={{ mb: 1.5 }}>
                Assigned to you · {mine.length} orders, {units(mine)} units
              </Typography>
              {mine.length ? (
                grid(mine, true)
              ) : (
                <Card>
                  <EmptyState title="Nothing assigned to you" text="New orders appear here automatically." />
                </Card>
              )}
            </Box>
          )}
          {(!isWorker || others.length > 0) && (
            <Box>
              <Typography variant="h6" sx={{ mb: 1.5 }}>
                {isWorker ? "Other Workers' orders (take over if a colleague is away)" : 'All approved orders'}
              </Typography>
              {others.length ? (
                grid(others, !isWorker)
              ) : (
                <Card>
                  <EmptyState title="Nothing to ship" text="Approved orders will appear here." />
                </Card>
              )}
            </Box>
          )}
        </Stack>
      </QueryState>
      {shipping && <ShipDialog order={shipping} onClose={() => setShipping(null)} />}
    </>
  )
}

// ---------------- Movement history ----------------
export function MovementHistoryPage() {
  const products = useStaffProducts()
  const [filters, setFilters] = useState<MovementFilters>({ limit: 200 })
  const movements = useQuery({ queryKey: ['movements', filters], queryFn: () => movementsApi.list(filters) })
  const set = (patch: Partial<MovementFilters>) => setFilters((f) => ({ ...f, ...patch }))

  return (
    <>
      <PageHeader title="Movement history" subtitle="Every IN and OUT, newest first. Stock changes only through these records." />
      <Card>
        <CardContent>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Autocomplete
                options={products.data ?? []}
                getOptionLabel={(p) => `${p.code} · ${p.product_name}`}
                onChange={(_, p) => set({ product: p?.id })}
                renderInput={(p) => <TextField {...p} label="Product" />}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4, md: 2 }}>
              <TextField
                select
                fullWidth
                label="Type"
                value={filters.type ?? ''}
                onChange={(e) => set({ type: (e.target.value || undefined) as MovementType | undefined })}
              >
                <MenuItem value="">IN and OUT</MenuItem>
                <MenuItem value="IN">IN</MenuItem>
                <MenuItem value="OUT">OUT</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <TextField
                fullWidth
                type="date"
                label="From"
                value={filters.from ?? ''}
                onChange={(e) => set({ from: e.target.value || undefined })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <TextField
                fullWidth
                type="date"
                label="To"
                value={filters.to ?? ''}
                onChange={(e) => set({ to: e.target.value || undefined })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
          </Grid>
          <QueryState isLoading={movements.isLoading} error={movements.error}>
            {movements.data?.length ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Code</TableCell>
                      <TableCell>Time</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Product</TableCell>
                      <TableCell align="right">Qty</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Employee</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Customer / order</TableCell>
                      <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Note</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {movements.data.map((m) => (
                      <TableRow key={m.id} hover>
                        <TableCell>{m.code}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(m.movement_time)}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={m.movement_type}
                            color={m.movement_type === 'IN' ? 'info' : 'error'}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          {m.product_name}
                          <Typography variant="caption" color="text.secondary" component="div">
                            {m.product_code}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {m.movement_type === 'IN' ? '+' : '−'}
                          {m.quantity}
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{m.employee_name}</TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                          {m.customer_name ? `${m.customer_name}${m.order_code ? ` · ${m.order_code}` : ''}` : '—'}
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{m.note}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <EmptyState title="No movements for these filters" />
            )}
          </QueryState>
          {movements.data?.length === filters.limit && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Showing the latest {filters.limit} records. Narrow the filters to see older ones.
            </Typography>
          )}
        </CardContent>
      </Card>
    </>
  )
}
