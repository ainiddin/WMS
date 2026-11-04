const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const number = new Intl.NumberFormat('en-US')
const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const dateOnly = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' })
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' })

export const formatMoney = (value: number | null | undefined) => `${money.format(value ?? 0)} ₸`
export const formatNumber = (value: number | null | undefined) => number.format(value ?? 0)
export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : '—')
export const formatDate = (iso: string | null | undefined) => (iso ? dateOnly.format(new Date(iso)) : '—')

/** "2026-03" -> "Mar 26" */
export function formatMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return monthYear.format(new Date(y, m - 1, 1))
}

/** Chart axis label for a bucket start date: "04 Nov" for days/weeks, "Nov 26" for months. */
export function formatBucket(isoDate: string, bucket: 'day' | 'week' | 'month') {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return bucket === 'month' ? monthYear.format(date) : dayMonth.format(date)
}

export const roleLabel: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  WORKER: 'Worker',
  CUSTOMER: 'Customer',
}
