import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined'
import SearchIcon from '@mui/icons-material/Search'
import {
  Alert,
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
  IconButton,
  InputAdornment,
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
  Tooltip,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { errorMessage, statusOf } from '@/api/client'
import { catalogApi, customersApi, downloadFile } from '@/api/endpoints'
import type { Category, ProductInput, ProductStaff, Supplier } from '@/api/types'
import { ConfirmDialog, EmptyState, PageHeader, QueryState } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { formatMoney } from '@/format'

function ActiveChip({ active }: { active: boolean }) {
  return active ? null : <Chip size="small" label="inactive" sx={{ ml: 1 }} />
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <TextField
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={{ flex: 1, minWidth: 200 }}
      slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
    />
  )
}

function FormDialog({
  open,
  title,
  onClose,
  onSubmit,
  busy,
  error,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  onSubmit: () => void
  busy: boolean
  error: string | null
  children: ReactNode
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit()
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={submit}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {children}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={busy}>
            Save
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

/**
 * Delete with the rule from the plan: a record with history cannot be deleted (server answers 409),
 * so the user is offered to deactivate it instead.
 */
function useSafeDelete(onDeactivate: (id: number) => Promise<unknown>, remove: (id: number) => Promise<unknown>, keys: string[]) {
  const queryClient = useQueryClient()
  const notify = useNotify()
  const [target, setTarget] = useState<{ id: number; name: string } | null>(null)
  const [hasHistory, setHasHistory] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = () => keys.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }))
  const close = () => {
    setTarget(null)
    setHasHistory(false)
  }

  const confirm = async () => {
    if (!target) return
    setBusy(true)
    try {
      if (hasHistory) {
        await onDeactivate(target.id)
        notify.success(`${target.name} deactivated`)
      } else {
        await remove(target.id)
        notify.success(`${target.name} deleted`)
      }
      refresh()
      close()
    } catch (e) {
      if (statusOf(e) === 409 && !hasHistory) setHasHistory(true)
      else notify.error(e)
    } finally {
      setBusy(false)
    }
  }

  const dialog = (
    <ConfirmDialog
      open={Boolean(target)}
      title={hasHistory ? `Deactivate ${target?.name}?` : `Delete ${target?.name}?`}
      text={
        hasHistory
          ? 'This record has history (orders, movements or products), so the database does not allow deleting it. Deactivate it instead — it will be hidden but the history stays.'
          : 'This cannot be undone.'
      }
      confirmLabel={hasHistory ? 'Deactivate' : 'Delete'}
      color={hasHistory ? 'warning' : 'error'}
      loading={busy}
      onConfirm={confirm}
      onClose={close}
    />
  )
  return { ask: (id: number, name: string) => setTarget({ id, name }), dialog }
}

// ---------------- Products ----------------
const emptyProduct: ProductInput = {
  product_name: '',
  description: '',
  category_id: 0,
  supplier_id: 0,
  unit_price: 0,
  min_quantity: 0,
  barcode: '',
  is_active: true,
}

export function ProductsPage() {
  const [includeInactive, setIncludeInactive] = useState(false)
  const [search, setSearch] = useState('')
  const products = useQuery({
    queryKey: ['products', 'staff', 'admin', includeInactive],
    queryFn: () => catalogApi.staffProducts({ include_inactive: includeInactive, sort: 'code' }),
  })
  const categories = useQuery({ queryKey: ['categories', 'all'], queryFn: () => catalogApi.categories(true) })
  const suppliers = useQuery({ queryKey: ['suppliers', true], queryFn: () => catalogApi.suppliers(true) })
  const queryClient = useQueryClient()
  const notify = useNotify()

  const [editing, setEditing] = useState<ProductStaff | 'new' | null>(null)
  const [form, setForm] = useState<ProductInput>(emptyProduct)
  const [error, setError] = useState<string | null>(null)

  const openForm = (p: ProductStaff | 'new') => {
    setError(null)
    setEditing(p)
    setForm(
      p === 'new'
        ? emptyProduct
        : {
            product_name: p.product_name,
            description: p.description ?? '',
            category_id: p.category.id,
            supplier_id: p.supplier.id,
            unit_price: p.unit_price,
            min_quantity: p.min_quantity,
            barcode: p.barcode ?? '',
            is_active: p.is_active,
          },
    )
  }

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, barcode: form.barcode?.trim() || null, description: form.description?.trim() || null }
      return editing === 'new' ? catalogApi.createProduct(body) : catalogApi.updateProduct((editing as ProductStaff).id, body)
    },
    onSuccess: (p) => {
      notify.success(`${p.code} ${p.product_name} saved`)
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setEditing(null)
    },
    onError: (e) => setError(statusOf(e) === 409 ? 'This barcode is already used by another product.' : errorMessage(e)),
  })

  const del = useSafeDelete(
    (id) => catalogApi.updateProduct(id, { is_active: false }),
    (id) => catalogApi.deleteProduct(id),
    ['products'],
  )

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (products.data ?? []).filter(
      (p) => !q || p.product_name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.barcode?.includes(q),
    )
  }, [products.data, search])

  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Prices, minimum stock and barcodes. Quantity changes only through Stock IN and shipments."
        actions={
          <>
            <Button
              variant="outlined"
              startIcon={<PrintOutlinedIcon />}
              onClick={() => downloadFile('/products/barcodes/labels.pdf', 'barcodes.pdf').catch(notify.error)}
            >
              Barcode labels
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => openForm('new')}>
              New product
            </Button>
          </>
        }
      />
      <Card>
        <CardContent>
          <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
            <SearchField value={search} onChange={setSearch} placeholder="Search by name, code or barcode" />
            <FormControlLabel
              control={<Switch checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />}
              label="Show inactive"
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
                      <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Supplier</TableCell>
                      <TableCell align="right">Price</TableCell>
                      <TableCell align="right">Qty</TableCell>
                      <TableCell align="right">Min</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Barcode</TableCell>
                      <TableCell align="right" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((p) => (
                      <TableRow key={p.id} hover sx={{ opacity: p.is_active ? 1 : 0.55 }}>
                        <TableCell>{p.code}</TableCell>
                        <TableCell>
                          {p.product_name}
                          <ActiveChip active={p.is_active} />
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{p.category.name}</TableCell>
                        <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{p.supplier.supplier_name}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {formatMoney(p.unit_price)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: p.below_min ? 'warning.main' : undefined, fontWeight: 600 }}>
                          {p.quantity}
                        </TableCell>
                        <TableCell align="right">{p.min_quantity}</TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, fontFamily: 'monospace' }}>{p.barcode}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => openForm(p)} aria-label="Edit">
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" onClick={() => del.ask(p.id, p.product_name)} aria-label="Delete">
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <EmptyState title="No products" />
            )}
          </QueryState>
        </CardContent>
      </Card>

      <FormDialog
        open={editing !== null}
        title={editing === 'new' ? 'New product' : `Edit ${(editing as ProductStaff | null)?.code ?? ''}`}
        onClose={() => setEditing(null)}
        onSubmit={() => save.mutate()}
        busy={save.isPending}
        error={error}
      >
        <TextField label="Name" required value={form.product_name} onChange={(e) => set('product_name', e.target.value)} />
        <TextField
          label="Description"
          multiline
          minRows={2}
          value={form.description ?? ''}
          onChange={(e) => set('description', e.target.value)}
        />
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              fullWidth
              required
              label="Category"
              value={form.category_id || ''}
              onChange={(e) => set('category_id', Number(e.target.value))}
            >
              {categories.data?.map((c) => (
                <MenuItem key={c.id} value={c.id} disabled={!c.is_active}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              fullWidth
              required
              label="Supplier"
              value={form.supplier_id || ''}
              onChange={(e) => set('supplier_id', Number(e.target.value))}
            >
              {suppliers.data?.map((s) => (
                <MenuItem key={s.id} value={s.id} disabled={!s.is_active}>
                  {s.supplier_name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <TextField
              fullWidth
              required
              type="number"
              label="Price, ₸"
              value={form.unit_price}
              onChange={(e) => set('unit_price', Number(e.target.value))}
              slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <TextField
              fullWidth
              required
              type="number"
              label="Minimum stock"
              value={form.min_quantity}
              onChange={(e) => set('min_quantity', Number(e.target.value))}
              slotProps={{ htmlInput: { min: 0 } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              fullWidth
              label="Barcode"
              value={form.barcode ?? ''}
              onChange={(e) => set('barcode', e.target.value)}
              helperText="EAN-13 or any code"
            />
          </Grid>
        </Grid>
        <FormControlLabel
          control={<Switch checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />}
          label="Active (visible in the shop)"
        />
        {editing !== 'new' && editing && (
          <Typography variant="caption" color="text.secondary">
            Current stock: {editing.quantity}. To change it, use Stock IN or ship orders.
          </Typography>
        )}
      </FormDialog>
      {del.dialog}
    </>
  )
}

// ---------------- Categories ----------------
export function CategoriesPage() {
  const categories = useQuery({ queryKey: ['categories', 'all'], queryFn: () => catalogApi.categories(true) })
  const queryClient = useQueryClient()
  const notify = useNotify()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [name, setName] = useState('')
  const [active, setActive] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const open = (c: Category | 'new') => {
    setEditing(c)
    setError(null)
    setName(c === 'new' ? '' : c.name)
    setActive(c === 'new' ? true : c.is_active)
  }

  const save = useMutation({
    mutationFn: () =>
      editing === 'new'
        ? catalogApi.createCategory({ name, is_active: active })
        : catalogApi.updateCategory((editing as Category).id, { name, is_active: active }),
    onSuccess: (c) => {
      notify.success(`Category ${c.name} saved`)
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setEditing(null)
    },
    onError: (e) => setError(statusOf(e) === 409 ? 'A category with this name already exists.' : errorMessage(e)),
  })

  const del = useSafeDelete(
    (id) => catalogApi.updateCategory(id, { is_active: false }),
    (id) => catalogApi.deleteCategory(id),
    ['categories'],
  )

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="Sections of the shop catalog."
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => open('new')}>
            New category
          </Button>
        }
      />
      <Card sx={{ maxWidth: 720 }}>
        <QueryState isLoading={categories.isLoading} error={categories.error}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Code</TableCell>
                <TableCell>Name</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {categories.data?.map((c) => (
                <TableRow key={c.id} hover sx={{ opacity: c.is_active ? 1 : 0.55 }}>
                  <TableCell>{c.code}</TableCell>
                  <TableCell>
                    {c.name}
                    <ActiveChip active={c.is_active} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => open(c)} aria-label="Edit">
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => del.ask(c.id, c.name)} aria-label="Delete">
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </QueryState>
      </Card>
      <FormDialog
        open={editing !== null}
        title={editing === 'new' ? 'New category' : 'Edit category'}
        onClose={() => setEditing(null)}
        onSubmit={() => save.mutate()}
        busy={save.isPending}
        error={error}
      >
        <TextField label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Active" />
      </FormDialog>
      {del.dialog}
    </>
  )
}

// ---------------- Suppliers ----------------
type SupplierForm = Omit<Supplier, 'id' | 'code'>
const emptySupplier: SupplierForm = { supplier_name: '', phone: '', email: '', is_active: true }

export function SuppliersPage() {
  const [includeInactive, setIncludeInactive] = useState(false)
  const suppliers = useQuery({ queryKey: ['suppliers', includeInactive], queryFn: () => catalogApi.suppliers(includeInactive) })
  const queryClient = useQueryClient()
  const notify = useNotify()
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null)
  const [form, setForm] = useState<SupplierForm>(emptySupplier)
  const [error, setError] = useState<string | null>(null)

  const open = (s: Supplier | 'new') => {
    setEditing(s)
    setError(null)
    setForm(s === 'new' ? emptySupplier : { supplier_name: s.supplier_name, phone: s.phone, email: s.email ?? '', is_active: s.is_active })
  }

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, email: form.email?.trim() || null }
      return editing === 'new' ? catalogApi.createSupplier(body) : catalogApi.updateSupplier((editing as Supplier).id, body)
    },
    onSuccess: (s) => {
      notify.success(`${s.code} ${s.supplier_name} saved`)
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      setEditing(null)
    },
    onError: (e) => setError(statusOf(e) === 409 ? 'A supplier with this name already exists.' : errorMessage(e)),
  })

  const del = useSafeDelete(
    (id) => catalogApi.updateSupplier(id, { is_active: false }),
    (id) => catalogApi.deleteSupplier(id),
    ['suppliers'],
  )

  return (
    <>
      <PageHeader
        title="Suppliers"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => open('new')}>
            New supplier
          </Button>
        }
      />
      <Card>
        <CardContent>
          <FormControlLabel
            sx={{ mb: 1 }}
            control={<Switch checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />}
            label="Show inactive"
          />
          <QueryState isLoading={suppliers.isLoading} error={suppliers.error}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Code</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Phone</TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Email</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {suppliers.data?.map((s) => (
                    <TableRow key={s.id} hover sx={{ opacity: s.is_active ? 1 : 0.55 }}>
                      <TableCell>{s.code}</TableCell>
                      <TableCell>
                        {s.supplier_name}
                        <ActiveChip active={s.is_active} />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <a href={`tel:${s.phone.replace(/\s/g, '')}`}>{s.phone}</a>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{s.email}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <IconButton size="small" onClick={() => open(s)} aria-label="Edit">
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => del.ask(s.id, s.supplier_name)} aria-label="Delete">
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </QueryState>
        </CardContent>
      </Card>
      <FormDialog
        open={editing !== null}
        title={editing === 'new' ? 'New supplier' : 'Edit supplier'}
        onClose={() => setEditing(null)}
        onSubmit={() => save.mutate()}
        busy={save.isPending}
        error={error}
      >
        <TextField label="Name" required value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} />
        <TextField label="Phone" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <TextField label="Email" type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <FormControlLabel
          control={<Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />}
          label="Active"
        />
      </FormDialog>
      {del.dialog}
    </>
  )
}

// ---------------- Customers (read only) ----------------
export function CustomersPage() {
  const [search, setSearch] = useState('')
  const customers = useQuery({ queryKey: ['customers', search], queryFn: () => customersApi.list(search || undefined) })
  return (
    <>
      <PageHeader title="Customers" subtitle="Contacts are visible to Managers and Admins only." />
      <Card>
        <CardContent>
          <Stack direction="row" sx={{ mb: 2 }}>
            <SearchField value={search} onChange={setSearch} placeholder="Search by name or phone" />
          </Stack>
          <QueryState isLoading={customers.isLoading} error={customers.error}>
            {customers.data?.length ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Code</TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell>Phone</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Email</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Address</TableCell>
                      <TableCell align="right">Balance</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customers.data.map((c) => (
                      <TableRow key={c.id} hover>
                        <TableCell>{c.code}</TableCell>
                        <TableCell>{c.full_name}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{c.phone}</TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{c.email}</TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{c.address}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {formatMoney(c.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <EmptyState title="No customers found" />
            )}
          </QueryState>
        </CardContent>
      </Card>
    </>
  )
}
