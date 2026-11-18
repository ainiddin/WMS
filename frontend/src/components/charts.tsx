import { Box, useTheme } from '@mui/material'
import type { ReactElement } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TimelinePoint } from '@/api/types'
import { formatBucket } from '@/format'
import { chartColors } from '@/theme'

/** Shared axis / grid / tooltip styling so every chart looks the same in light and dark mode. */
export function useChartStyle() {
  const theme = useTheme()
  const text = theme.palette.text.secondary
  return {
    axis: { stroke: text, fontSize: 12, tickLine: false },
    grid: { stroke: theme.palette.divider, strokeDasharray: '3 3', vertical: false },
    tooltip: {
      contentStyle: {
        background: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 8,
        color: theme.palette.text.primary,
      },
      cursor: { fill: theme.palette.action.hover },
    },
    legend: { wrapperStyle: { fontSize: 12, color: text } },
  }
}

export function ChartBox({ height = 280, children }: { height?: number; children: ReactElement }) {
  return (
    <Box sx={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </Box>
  )
}

/** Performance over time: shipped orders, approvals and stock IN per day / week / month. */
export function TimelineChart({
  data,
  bucket,
  showApproved = true,
}: {
  data: TimelinePoint[]
  bucket: 'day' | 'week' | 'month'
  showApproved?: boolean
}) {
  const s = useChartStyle()
  return (
    <ChartBox>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid {...s.grid} />
        <XAxis dataKey="date" {...s.axis} tickFormatter={(d: string) => formatBucket(d, bucket)} minTickGap={12} />
        <YAxis {...s.axis} allowDecimals={false} />
        <Tooltip {...s.tooltip} labelFormatter={(d) => formatBucket(String(d), bucket)} />
        <Legend {...s.legend} />
        <Bar dataKey="orders_shipped" name="Orders shipped" stackId="a" fill={chartColors.shipped} />
        {showApproved && (
          <Bar dataKey="orders_approved" name="Orders approved" stackId="a" fill={chartColors.approved} />
        )}
        <Bar dataKey="stock_in_count" name="Stock IN" stackId="a" fill={chartColors.stockIn} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartBox>
  )
}
