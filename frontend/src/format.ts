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

export const PHONE_HINT = '+7 7XX XXX XX XX'

/** Same rule as the backend: a Kazakhstan number, 10 digits after +7 / 8, starting with 7. Empty = no error. */
export function phoneError(value: string): string | null {
  if (!value.trim()) return null
  let digits = value.replace(/\D/g, '')
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) digits = digits.slice(1)
  if (/[^\d\s()+-]/.test(value) || digits.length !== 10 || digits[0] !== '7') return `Enter a Kazakhstan number: ${PHONE_HINT}`
  return null
}
