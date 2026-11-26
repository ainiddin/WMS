import { getLanguage, t, type Lang } from '@/i18n'

const LOCALE: Record<Lang, string> = { en: 'en-GB', ru: 'ru-RU', kk: 'kk-KZ' }

/** Date formats in the chosen language ("26 Nov 2026" / "26 нояб. 2026 г."); built once per language. */
const formats = new Map<Lang, ReturnType<typeof makeFormats>>()
function makeFormats(locale: string) {
  return {
    dateTime: new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    dateOnly: new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }),
    monthYear: new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }),
    dayMonth: new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }),
  }
}
function f() {
  const lang = getLanguage()
  let set = formats.get(lang)
  if (!set) {
    set = makeFormats(LOCALE[lang])
    formats.set(lang, set)
  }
  return set
}

const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const number = new Intl.NumberFormat('en-US')

export const formatMoney = (value: number | null | undefined) => `${money.format(value ?? 0)} ₸`
export const formatNumber = (value: number | null | undefined) => number.format(value ?? 0)
export const formatDateTime = (iso: string | null | undefined) => (iso ? f().dateTime.format(new Date(iso)) : '—')
export const formatDate = (iso: string | null | undefined) => (iso ? f().dateOnly.format(new Date(iso)) : '—')

/** "2026-03" -> "Mar 26" */
export function formatMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return f().monthYear.format(new Date(y, m - 1, 1))
}

/** Chart axis label for a bucket start date: "04 Nov" for days/weeks, "Nov 26" for months. */
export function formatBucket(isoDate: string, bucket: 'day' | 'week' | 'month') {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return bucket === 'month' ? f().monthYear.format(date) : f().dayMonth.format(date)
}

/** Role names in the chosen language: getters, so they follow a language switch. */
export const roleLabel: Record<string, string> = {
  get ADMIN() { return t('Admin') },
  get MANAGER() { return t('Manager') },
  get WORKER() { return t('Worker') },
  get CUSTOMER() { return t('Customer') },
}

export const PHONE_HINT = '+7 7XX XXX XX XX'

/** Same rule as the backend: a Kazakhstan number, 10 digits after +7 / 8, starting with 7. Empty = no error. */
export function phoneError(value: string): string | null {
  if (!value.trim()) return null
  let digits = value.replace(/\D/g, '')
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) digits = digits.slice(1)
  if (/[^\d\s()+-]/.test(value) || digits.length !== 10 || digits[0] !== '7') return t('Enter a Kazakhstan number: {0}', PHONE_HINT)
  return null
}

/** Same rule as the backend: EAN-13 = 13 digits, the last one is the check digit. Empty = no error (optional). */
export function barcodeError(value: string): string | null {
  const code = value.trim()
  if (!code) return null
  if (/\D/.test(code)) return t('EAN-13 has digits only')
  if (code.length !== 13) return t('EAN-13 has exactly 13 digits (now {0})', code.length)
  const total = [...code.slice(0, 12)].reduce((sum, d, i) => sum + Number(d) * (i % 2 ? 3 : 1), 0)
  const check = (10 - (total % 10)) % 10
  return Number(code[12]) === check ? null : t('Wrong check digit: for {0} the last digit must be {1}', code.slice(0, 12), check)
}
