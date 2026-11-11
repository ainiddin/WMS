import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined'
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined'
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined'
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined'
import { Button, Grid, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { reportsApi } from '@/api/endpoints'
import { ChartBox, useChartStyle } from '@/components/charts'
import { EmptyState, PageHeader, QueryState, Section, StatCard } from '@/components/common'
import { formatMoney, formatMonth, formatNumber } from '@/format'
import { chartColors } from '@/theme'

const compactMoney = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)

export function DashboardPage() {
  const data = useQuery({ queryKey: ['dashboard'], queryFn: reportsApi.dashboard, refetchInterval: 60_000 })
  const s = useChartStyle()
  const d = data.data

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Stock and sales at a glance. Charts cover the last 12 months." />
      <QueryState isLoading={data.isLoading} error={data.error}>
        {d && (
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, md: 3 }}>
              <StatCard
                label="Below minimum"
                value={d.cards.products_below_min}
                hint={`${d.cards.products_out_of_stock} out of stock · ${d.cards.products_active} products`}
                icon={<ReportProblemOutlinedIcon />}
                tone={d.cards.products_below_min ? 'warning' : 'success'}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <StatCard
                label="Waiting for stock"
                value={d.cards.orders_pending}
                hint={`${d.cards.orders_to_ship} waiting to ship`}
                icon={<PendingActionsOutlinedIcon />}
                tone={d.cards.orders_pending ? 'warning' : 'default'}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <StatCard
                label="Shipped this month"
                value={d.cards.orders_shipped_month}
                hint={formatMoney(d.cards.revenue_month)}
                icon={<LocalShippingOutlinedIcon />}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <StatCard label="Stock value" value={formatMoney(d.cards.stock_value)} icon={<PaymentsOutlinedIcon />} />
            </Grid>

            <Grid size={{ xs: 12, lg: 7 }}>
              <Section title="Stock movements by month (units)">
                <ChartBox>
                  <BarChart data={d.movements_by_month} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid {...s.grid} />
                    <XAxis dataKey="month" {...s.axis} tickFormatter={formatMonth} />
                    <YAxis {...s.axis} />
                    <Tooltip {...s.tooltip} labelFormatter={(m) => formatMonth(String(m))} />
                    <Legend {...s.legend} />
                    <Bar dataKey="in" name="IN" fill={chartColors.in} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="out" name="OUT" fill={chartColors.out} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ChartBox>
              </Section>
            </Grid>
            <Grid size={{ xs: 12, lg: 5 }}>
              <Section title="Revenue by month">
                <ChartBox>
                  <AreaChart data={d.sales_by_month} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                    <CartesianGrid {...s.grid} />
                    <XAxis dataKey="month" {...s.axis} tickFormatter={formatMonth} />
                    <YAxis {...s.axis} tickFormatter={compactMoney} />
                    <Tooltip
                      {...s.tooltip}
                      labelFormatter={(m) => formatMonth(String(m))}
                      formatter={(v, name) => (name === 'Revenue' ? formatMoney(Number(v)) : v)}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke={chartColors.revenue}
                      fill={chartColors.revenue}
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartBox>
              </Section>
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Section title="Sales by category">
                <ChartBox>
                  <PieChart>
                    <Pie data={d.sales_by_category} dataKey="revenue" nameKey="category" innerRadius="50%" outerRadius="80%" paddingAngle={2}>
                      {d.sales_by_category.map((c, i) => (
                        <Cell key={c.category} fill={chartColors.palette[i % chartColors.palette.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...s.tooltip} formatter={(v) => formatMoney(Number(v))} />
                    <Legend {...s.legend} />
                  </PieChart>
                </ChartBox>
              </Section>
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Section title="Top customers">
                <ChartBox>
                  <BarChart data={d.top_customers} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid {...s.grid} horizontal={false} vertical />
                    <XAxis type="number" {...s.axis} tickFormatter={compactMoney} />
                    <YAxis type="category" dataKey="full_name" {...s.axis} width={110} />
                    <Tooltip {...s.tooltip} formatter={(v) => formatMoney(Number(v))} />
                    <Bar dataKey="total_amount" name="Bought" fill={chartColors.units} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ChartBox>
              </Section>
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <Section
                title="Restock now"
                action={
                  <Button size="small" component={RouterLink} to="/restock">
                    Full list
                  </Button>
                }
              >
                {d.restock.length ? (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Product</TableCell>
                        <TableCell align="right">Qty / min</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {d.restock.map((r) => (
                        <TableRow key={r.product_id}>
                          <TableCell>
                            {r.product_name}
                            <Typography variant="caption" color="text.secondary" component="div">
                              {r.supplier_name} · {r.supplier_phone}
                            </Typography>
                          </TableCell>
                          <TableCell align="right" sx={{ color: 'warning.main', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {r.quantity} / {r.min_quantity}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState title="Nothing to reorder" />
                )}
              </Section>
            </Grid>

            <Grid size={12}>
              <Section
                title="Stock by product"
                action={
                  <Typography variant="caption" color="text.secondary">
                    bar = quantity, red mark = minimum
                  </Typography>
                }
              >
                <ChartBox height={300}>
                  <BarChart data={d.stock_by_product} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid {...s.grid} />
                    <XAxis dataKey="product_code" {...s.axis} interval={0} angle={-45} textAnchor="end" height={50} />
                    <YAxis {...s.axis} />
                    <Tooltip
                      {...s.tooltip}
                      labelFormatter={(code) => d.stock_by_product.find((p) => p.product_code === code)?.product_name ?? code}
                      formatter={(v, name) => [formatNumber(Number(v)), name]}
                    />
                    <Bar dataKey="quantity" name="Quantity" radius={[3, 3, 0, 0]}>
                      {d.stock_by_product.map((p) => (
                        <Cell key={p.product_code} fill={p.quantity < p.min_quantity ? chartColors.stockIn : chartColors.in} />
                      ))}
                    </Bar>
                    <Bar dataKey="min_quantity" name="Minimum" fill={chartColors.out} barSize={4} />
                  </BarChart>
                </ChartBox>
              </Section>
            </Grid>
          </Grid>
        )}
      </QueryState>
    </>
  )
}
