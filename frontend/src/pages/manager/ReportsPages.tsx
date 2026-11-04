import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined'
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined'
import TableViewOutlinedIcon from '@mui/icons-material/TableViewOutlined'
import {
  Alert,
  Button,
  Card,
  CardContent,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { exportReport, reportsApi, type ReportName } from '@/api/endpoints'
import { EmptyState, PageHeader, QueryState } from '@/components/common'
import { useNotify } from '@/components/Notify'
import { formatMoney, formatMonth, formatNumber } from '@/format'

function ExportButtons({ name }: { name: ReportName }) {
  const notify = useNotify()
  const [busy, setBusy] = useState<string | null>(null)
  const run = (format: 'xlsx' | 'pdf') => {
    setBusy(format)
    exportReport(name, format)
      .catch(notify.error)
      .finally(() => setBusy(null))
  }
  return (
    <>
      <Button variant="outlined" startIcon={<TableViewOutlinedIcon />} disabled={busy !== null} onClick={() => run('xlsx')}>
        Excel
      </Button>
      <Button variant="outlined" startIcon={<PictureAsPdfOutlinedIcon />} disabled={busy !== null} onClick={() => run('pdf')}>
        PDF
      </Button>
    </>
  )
}

// ---------------- Restock list ----------------
export function RestockPage() {
  const rows = useQuery({ queryKey: ['reports', 'restock'], queryFn: reportsApi.restock })
  return (
    <>
      <PageHeader
        title="Restock list"
        subtitle="Products below their minimum and whom to call. The main query from Task 9."
        actions={<ExportButtons name="restock" />}
      />
      <Card>
        <QueryState isLoading={rows.isLoading} error={rows.error}>
          {rows.data?.length ? (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell>
                    <TableCell align="right">In stock</TableCell>
                    <TableCell align="right">Minimum</TableCell>
                    <TableCell align="right">To order*</TableCell>
                    <TableCell>Supplier</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.data.map((r) => (
                    <TableRow key={r.product_id} hover>
                      <TableCell>
                        {r.product_name}
                        <Typography variant="caption" color="text.secondary" component="div">
                          {r.product_code}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ color: r.quantity === 0 ? 'error.main' : 'warning.main', fontWeight: 600 }}>
                        {r.quantity}
                      </TableCell>
                      <TableCell align="right">{r.min_quantity}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {r.shortage}
                      </TableCell>
                      <TableCell>
                        {r.supplier_name}
                        <Typography variant="caption" component="div">
                          <a href={`tel:${r.supplier_phone.replace(/\s/g, '')}`}>{r.supplier_phone}</a>
                          {r.supplier_email && ` · ${r.supplier_email}`}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          startIcon={<MoveToInboxOutlinedIcon />}
                          component={RouterLink}
                          to={`/stock-in?product=${r.product_id}`}
                        >
                          Stock IN
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <EmptyState title="Nothing to reorder" text="All active products are at or above their minimum." />
          )}
        </QueryState>
      </Card>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        * The amount needed to reach the minimum. Order more to have a buffer.
      </Typography>
    </>
  )
}

// ---------------- Reports with export ----------------
type Row = Record<string, string | number | boolean>

interface Column {
  key: string
  label: string
  align?: 'right'
  format?: (v: Row[string]) => string
}

const REPORTS: { name: ReportName; label: string; description: string; columns: Column[] }[] = [
  {
    name: 'monthly-usage',
    label: 'Monthly usage',
    description: 'Units shipped (OUT) per product and month, last 12 months.',
    columns: [
      { key: 'month', label: 'Month', format: (v) => formatMonth(String(v)) },
      { key: 'product_code', label: 'Product' },
      { key: 'product_name', label: 'Name' },
      { key: 'units_out', label: 'Units out', align: 'right' },
      { key: 'movements', label: 'Movements', align: 'right' },
    ],
  },
  {
    name: 'top-customers',
    label: 'Top customers',
    description: 'Customers by the value of shipped orders.',
    columns: [
      { key: 'customer_code', label: 'Code' },
      { key: 'full_name', label: 'Customer' },
      { key: 'orders_shipped', label: 'Orders', align: 'right' },
      { key: 'units', label: 'Units', align: 'right' },
      { key: 'total_amount', label: 'Total', align: 'right', format: (v) => formatMoney(Number(v)) },
    ],
  },
  {
    name: 'reconciliation',
    label: 'Reconciliation',
    description: 'Stock in the products table vs SUM(IN) − SUM(OUT) from the movement history. Every row should be OK.',
    columns: [
      { key: 'product_code', label: 'Product' },
      { key: 'product_name', label: 'Name' },
      { key: 'quantity', label: 'Qty in table', align: 'right' },
      { key: 'total_in', label: 'Sum IN', align: 'right' },
      { key: 'total_out', label: 'Sum OUT', align: 'right' },
      { key: 'expected', label: 'IN − OUT', align: 'right' },
      { key: 'difference', label: 'Difference', align: 'right' },
      { key: 'ok', label: 'OK' },
    ],
  },
  {
    name: 'orders',
    label: 'Orders',
    description: 'All orders with status, totals and who handled them.',
    columns: [
      { key: 'code', label: 'Order' },
      { key: 'created_at', label: 'Created' },
      { key: 'customer', label: 'Customer' },
      { key: 'status', label: 'Status' },
      { key: 'items', label: 'Lines', align: 'right' },
      { key: 'total_amount', label: 'Total', align: 'right', format: (v) => formatMoney(Number(v)) },
      { key: 'approved_by', label: 'Approved by' },
      { key: 'shipped_by', label: 'Shipped by' },
    ],
  },
]

const PAGE_LIMIT = 300

export function ReportsPage() {
  const [tab, setTab] = useState(0)
  const report = REPORTS[tab]
  const data = useQuery({ queryKey: ['reports', report.name], queryFn: () => reportsApi.report<Row>(report.name) })
  const rows = data.data ?? []
  const problems = report.name === 'reconciliation' ? rows.filter((r) => !r.ok).length : 0

  return (
    <>
      <PageHeader title="Reports" subtitle="Every report can be downloaded as Excel or PDF." actions={<ExportButtons name={report.name} />} />
      <Card>
        <Tabs value={tab} onChange={(_, v: number) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}>
          {REPORTS.map((r) => (
            <Tab key={r.name} label={r.label} />
          ))}
        </Tabs>
        <CardContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {report.description}
          </Typography>
          <QueryState isLoading={data.isLoading} error={data.error}>
            {report.name === 'reconciliation' && rows.length > 0 && (
              <Alert severity={problems ? 'error' : 'success'} sx={{ mb: 2 }}>
                {problems ? `${problems} product(s) do not match their history!` : 'Stock matches the movement history for all products.'}
              </Alert>
            )}
            {rows.length ? (
              <TableContainer sx={{ maxHeight: 560 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {report.columns.map((c) => (
                        <TableCell key={c.key} align={c.align}>
                          {c.label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.slice(0, PAGE_LIMIT).map((row, i) => (
                      <TableRow key={i} hover>
                        {report.columns.map((c) => (
                          <TableCell key={c.key} align={c.align} sx={{ whiteSpace: 'nowrap' }}>
                            {c.key === 'ok' ? (
                              row.ok ? (
                                <CheckCircleOutlineIcon color="success" fontSize="small" />
                              ) : (
                                <ErrorOutlineIcon color="error" fontSize="small" />
                              )
                            ) : c.format ? (
                              c.format(row[c.key])
                            ) : typeof row[c.key] === 'number' ? (
                              formatNumber(row[c.key] as number)
                            ) : (
                              String(row[c.key] ?? '')
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <EmptyState title="No data yet" />
            )}
            {rows.length > PAGE_LIMIT && (
              <Stack sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Showing {PAGE_LIMIT} of {rows.length} rows. The export contains all of them.
                </Typography>
              </Stack>
            )}
          </QueryState>
        </CardContent>
      </Card>
    </>
  )
}
