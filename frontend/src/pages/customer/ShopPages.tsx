import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined'
import SearchIcon from '@mui/icons-material/Search'
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined'
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router'
import { catalogApi, customersApi, ordersApi, type ProductFilters } from '@/api/endpoints'
import { useAuth } from '@/auth/AuthContext'
import { MAX_LINE_QUANTITY, useCart } from '@/cart/CartContext'
import { EmptyState, PageHeader, QueryState } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { formatMoney, PHONE_HINT, phoneError } from '@/format'
import { categoryLook, ProductCard, ProductPicture } from './ProductCard'

function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => catalogApi.categories(), staleTime: 5 * 60_000 })
}

export function HomePage() {
  const categories = useCategories()
  const popular = useQuery({ queryKey: ['products', 'popular'], queryFn: () => catalogApi.popular(8) })
  const { user } = useAuth()

  return (
    <Stack spacing={5}>
      <Card
        sx={{
          border: 0,
          color: 'common.white',
          background: 'linear-gradient(120deg, #1f4e79 0%, #2f6ea5 60%, #e07a1f 140%)',
        }}
      >
        <CardContent sx={{ p: { xs: 3, md: 6 } }}>
          <Typography variant="h4" component="h1" sx={{ maxWidth: 560 }}>
            Everything for a tidy, comfortable home
          </Typography>
          <Typography sx={{ mt: 1.5, maxWidth: 520, opacity: 0.9 }}>
            Kitchenware, cleaning supplies, bathroom and home textile — straight from our Almaty warehouse.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 3 }}>
            <Button variant="contained" color="secondary" size="large" component={RouterLink} to="/catalog">
              Browse the catalog
            </Button>
            {!user && (
              <Button variant="outlined" color="inherit" size="large" component={RouterLink} to="/signup">
                Create an account
              </Button>
            )}
          </Stack>
          <Stack direction="row" spacing={3} sx={{ mt: 4, flexWrap: 'wrap', rowGap: 1, opacity: 0.9 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <LocalShippingOutlinedIcon fontSize="small" /> <span>Delivery to your door</span>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <VerifiedOutlinedIcon fontSize="small" /> <span>Live stock — what you see is available</span>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Box>
        <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
          Shop by category
        </Typography>
        <QueryState isLoading={categories.isLoading} error={categories.error}>
          <Grid container spacing={2}>
            {categories.data?.map((c) => {
              const look = categoryLook(c.name)
              return (
                <Grid key={c.id} size={{ xs: 6, sm: 4, md: 12 / 5 }}>
                  <Card>
                    <CardActionArea component={RouterLink} to={`/catalog?category=${c.id}`} sx={{ p: 2.5, textAlign: 'center' }}>
                      <Box sx={{ color: look.color, '& svg': { fontSize: 40 } }}>{look.icon}</Box>
                      <Typography sx={{ mt: 1, fontWeight: 600 }}>{c.name}</Typography>
                    </CardActionArea>
                  </Card>
                </Grid>
              )
            })}
          </Grid>
        </QueryState>
      </Box>

      <Box>
        <Stack direction="row" sx={{ mb: 2, alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" component="h2">
            Popular right now
          </Typography>
          <Button component={RouterLink} to="/catalog">
            See all
          </Button>
        </Stack>
        <QueryState isLoading={popular.isLoading} error={popular.error}>
          <Grid container spacing={2}>
            {popular.data?.map((p) => (
              <Grid key={p.id} size={{ xs: 12, sm: 6, md: 3 }}>
                <ProductCard product={p} />
              </Grid>
            ))}
          </Grid>
        </QueryState>
      </Box>
    </Stack>
  )
}

export function CatalogPage() {
  const [params, setParams] = useSearchParams()
  const categories = useCategories()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const searchTimer = useRef<number | undefined>(undefined)

  const filters: ProductFilters = {
    search: params.get('q') || undefined,
    category_id: params.get('category') ? Number(params.get('category')) : undefined,
    min_price: params.get('min') ? Number(params.get('min')) : undefined,
    max_price: params.get('max') ? Number(params.get('max')) : undefined,
    in_stock: params.get('stock') === '1' ? true : undefined,
    sort: (params.get('sort') as ProductFilters['sort']) || 'name',
  }
  const products = useQuery({ queryKey: ['products', 'catalog', filters], queryFn: () => catalogApi.products(filters) })

  const update = (key: string, value: string | null) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }


  return (
    <>
      <PageHeader title="Catalog" subtitle={products.data ? `${products.data.length} products` : undefined} />
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} sx={{ alignItems: 'center' }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                placeholder="Search products"
                value={search}
                onChange={(e) => {
                  const value = e.target.value
                  setSearch(value)
                  // Search as you type, with a short delay.
                  window.clearTimeout(searchTimer.current)
                  searchTimer.current = window.setTimeout(() => update('q', value.trim() || null), 300)
                }}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2.5 }}>
              <TextField
                select
                fullWidth
                label="Category"
                value={params.get('category') ?? ''}
                onChange={(e) => update('category', e.target.value || null)}
              >
                <MenuItem value="">All categories</MenuItem>
                {categories.data?.map((c) => (
                  <MenuItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 1.5 }}>
              <TextField
                fullWidth
                type="number"
                label="Min ₸"
                value={params.get('min') ?? ''}
                onChange={(e) => update('min', e.target.value || null)}
                slotProps={{ htmlInput: { min: 0 } }}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 1.5 }}>
              <TextField
                fullWidth
                type="number"
                label="Max ₸"
                value={params.get('max') ?? ''}
                onChange={(e) => update('max', e.target.value || null)}
                slotProps={{ htmlInput: { min: 0 } }}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 1.5 }}>
              <TextField select fullWidth label="Sort" value={filters.sort} onChange={(e) => update('sort', e.target.value)}>
                <MenuItem value="name">Name</MenuItem>
                <MenuItem value="price">Price: low to high</MenuItem>
                <MenuItem value="-price">Price: high to low</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 6, md: 1 }}>
              <FormControlLabel
                control={<Switch checked={params.get('stock') === '1'} onChange={(e) => update('stock', e.target.checked ? '1' : null)} />}
                label="In stock"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      <QueryState isLoading={products.isLoading} error={products.error}>
        {products.data?.length ? (
          <Grid container spacing={2}>
            {products.data.map((p) => (
              <Grid key={p.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <ProductCard product={p} />
              </Grid>
            ))}
          </Grid>
        ) : (
          <EmptyState title="Nothing found" text="Try another search or remove some filters." />
        )}
      </QueryState>
    </>
  )
}

export function ProductDetailsPage() {
  const id = Number(useParams().id)
  const product = useQuery({ queryKey: ['products', id], queryFn: () => catalogApi.product(id) })
  const { add } = useCart()
  const notify = useNotify()
  const [qty, setQty] = useState(1)

  return (
    <>
      <Button component={RouterLink} to="/catalog" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>
        Back to catalog
      </Button>
      <QueryState isLoading={product.isLoading} error={product.error}>
        {product.data && (
          <Card>
            <Grid container>
              <Grid size={{ xs: 12, md: 5 }}>
                <ProductPicture category={product.data.category.name} height={320} />
              </Grid>
              <Grid size={{ xs: 12, md: 7 }}>
                <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
                  <Chip label={product.data.category.name} size="small" />
                  <Typography variant="h5" component="h1" sx={{ mt: 1.5 }}>
                    {product.data.product_name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Article {product.data.code}
                  </Typography>
                  <Typography variant="h4" sx={{ my: 2 }}>
                    {formatMoney(product.data.unit_price)}
                  </Typography>
                  <Chip
                    label={product.data.in_stock ? 'In stock' : 'Out of stock'}
                    color={product.data.in_stock ? 'success' : 'default'}
                  />
                  {product.data.description && (
                    <Typography sx={{ mt: 2 }} color="text.secondary">
                      {product.data.description}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
                    <TextField
                      type="number"
                      label="Quantity"
                      value={qty}
                      onChange={(e) => setQty(Math.max(1, Math.min(MAX_LINE_QUANTITY, Number(e.target.value) || 1)))}
                      sx={{ width: 110 }}
                      slotProps={{ htmlInput: { min: 1, max: MAX_LINE_QUANTITY } }}
                    />
                    <Button
                      variant="contained"
                      size="large"
                      startIcon={<AddShoppingCartIcon />}
                      disabled={!product.data.in_stock}
                      onClick={() => {
                        add(product.data, qty)
                        notify.success(`Added ${qty} × ${product.data.product_name}`)
                      }}
                    >
                      Add to cart
                    </Button>
                  </Stack>
                </CardContent>
              </Grid>
            </Grid>
          </Card>
        )}
      </QueryState>
    </>
  )
}

function QuantityInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', border: 1, borderColor: 'divider', borderRadius: 2 }}>
      <IconButton size="small" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Less">
        −
      </IconButton>
      <Typography sx={{ minWidth: 28, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
      <IconButton size="small" onClick={() => onChange(value + 1)} disabled={value >= MAX_LINE_QUANTITY} aria-label="More">
        +
      </IconButton>
    </Stack>
  )
}

export function CartPage() {
  const { lines, total, setQuantity, remove } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()

  if (!lines.length)
    return (
      <>
        <PageHeader title="Cart" />
        <Card>
          <EmptyState
            title="Your cart is empty"
            action={
              <Button variant="contained" component={RouterLink} to="/catalog" sx={{ mt: 1 }}>
                Go to catalog
              </Button>
            }
          />
        </Card>
      </>
    )

  return (
    <>
      <PageHeader title="Cart" />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            {lines.map((line, i) => (
              <Box key={line.product.id}>
                {i > 0 && <Divider />}
                <Stack direction="row" spacing={2} sx={{ p: 2, alignItems: 'center' }}>
                  <Box sx={{ width: 64, flexShrink: 0, borderRadius: 2, overflow: 'hidden' }}>
                    <ProductPicture category={line.product.category.name} height={64} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      component={RouterLink}
                      to={`/catalog/${line.product.id}`}
                      sx={{ fontWeight: 600, color: 'text.primary', textDecoration: 'none' }}
                    >
                      {line.product.product_name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatMoney(line.product.unit_price)} each
                    </Typography>
                  </Box>
                  <QuantityInput value={line.quantity} onChange={(v) => setQuantity(line.product.id, v)} />
                  <Typography sx={{ width: 100, textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
                    {formatMoney(line.quantity * line.product.unit_price)}
                  </Typography>
                  <IconButton onClick={() => remove(line.product.id)} aria-label="Remove">
                    <DeleteOutlineIcon />
                  </IconButton>
                </Stack>
              </Box>
            ))}
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6">Summary</Typography>
              <Stack direction="row" sx={{ my: 2, justifyContent: 'space-between' }}>
                <Typography color="text.secondary">Estimated total</Typography>
                <Typography variant="h6">{formatMoney(total)}</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 2 }}>
                The final total is calculated by the shop when you place the order.
              </Typography>
              {user && user.role !== 'CUSTOMER' && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Staff accounts cannot place orders. Sign in as a customer.
                </Alert>
              )}
              <Button
                fullWidth
                variant="contained"
                size="large"
                disabled={Boolean(user && user.role !== 'CUSTOMER')}
                onClick={() => navigate(user ? '/checkout' : '/login', { state: { from: '/checkout' } })}
              >
                {user ? 'Checkout' : 'Sign in to checkout'}
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  )
}

export function CheckoutPage() {
  const { lines, total, clear } = useCart()
  const profile = useQuery({ queryKey: ['customers', 'me'], queryFn: customersApi.me })
  const [address, setAddress] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const notify = useNotify()

  const shownAddress = address ?? profile.data?.address ?? ''

  const placeOrder = useMutation({
    mutationFn: () =>
      ordersApi.create({
        items: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
        delivery_address: shownAddress.trim() || undefined,
        comment: comment.trim() || undefined,
      }),
    onSuccess: (order) => {
      clear()
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      notify.success(`Order ${order.code} placed. Total ${formatMoney(order.total_amount)}`)
      navigate('/my-orders', { replace: true, state: { highlight: order.id } })
    },
    onError: notify.error,
  })

  if (!lines.length)
    return (
      <>
        <PageHeader title="Checkout" />
        <Card>
          <EmptyState title="Your cart is empty" action={<Button component={RouterLink} to="/catalog">Go to catalog</Button>} />
        </Card>
      </>
    )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    placeOrder.mutate()
  }

  return (
    <>
      <PageHeader title="Checkout" subtitle="No payment online — you pay on delivery." />
      <Grid container spacing={3} component="form" onSubmit={submit}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6">Delivery</Typography>
                <TextField
                  label="Delivery address"
                  required
                  fullWidth
                  multiline
                  minRows={2}
                  value={shownAddress}
                  onChange={(e) => setAddress(e.target.value)}
                  helperText="City, street, building, apartment"
                />
                <TextField
                  label="Comment for the courier (optional)"
                  fullWidth
                  multiline
                  minRows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Your order
              </Typography>
              {lines.map((l) => (
                <Stack key={l.product.id} direction="row" sx={{ py: 0.75, justifyContent: 'space-between', gap: 2 }}>
                  <Typography variant="body2">
                    {l.quantity} × {l.product.product_name}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                    {formatMoney(l.quantity * l.product.unit_price)}
                  </Typography>
                </Stack>
              ))}
              <Divider sx={{ my: 1.5 }} />
              <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                <Typography sx={{ fontWeight: 600 }}>Estimated total</Typography>
                <Typography sx={{ fontWeight: 600 }}>{formatMoney(total)}</Typography>
              </Stack>
              <Button type="submit" fullWidth variant="contained" size="large" sx={{ mt: 2 }} disabled={placeOrder.isPending}>
                Place order
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  )
}

export function ProfilePage() {
  const profile = useQuery({ queryKey: ['customers', 'me'], queryFn: customersApi.me })
  const { refreshUser } = useAuth()
  const notify = useNotify()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<{ full_name: string; phone: string; address: string } | null>(null)
  const values = form ?? {
    full_name: profile.data?.full_name ?? '',
    phone: profile.data?.phone ?? '',
    address: profile.data?.address ?? '',
  }
  const save = useMutation({
    mutationFn: () =>
      customersApi.updateMe({ full_name: values.full_name, phone: values.phone || null, address: values.address || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', 'me'] })
      refreshUser()
      setForm(null)
      notify.success('Profile saved')
    },
    onError: notify.error,
  })
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...values, [key]: e.target.value })

  return (
    <>
      <PageHeader title="Profile" subtitle={profile.data ? `${profile.data.code} · ${profile.data.email}` : undefined} />
      <QueryState isLoading={profile.isLoading} error={profile.error}>
        <Card sx={{ maxWidth: 560 }}>
          <CardContent>
            <Stack
              component="form"
              spacing={2}
              onSubmit={(e) => {
                e.preventDefault()
                save.mutate()
              }}
            >
              <TextField label="Full name" required value={values.full_name} onChange={set('full_name')} />
              <TextField
                label="Phone"
                value={values.phone}
                onChange={set('phone')}
                placeholder={PHONE_HINT}
                error={!!phoneError(values.phone)}
                helperText={phoneError(values.phone)}
              />
              <TextField label="Default delivery address" multiline minRows={2} value={values.address} onChange={set('address')} />
              <Box>
                <Button type="submit" variant="contained" disabled={save.isPending || !form || !!phoneError(values.phone)}>
                  Save
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </QueryState>
    </>
  )
}
