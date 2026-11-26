import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ADMIN_NAV, MANAGER_NAV } from '@/pages/admin/AdminLayout'
import { ACTION_LABEL } from '@/pages/admin/AuditPage'
import { fromBrowser, getLanguage, setLanguage, t } from '.'
import { KK } from './kk'
import { RU } from './ru'

afterEach(() => setLanguage('en'))

describe('t()', () => {
  it('English is the key itself; placeholders are filled in', () => {
    expect(t('Order {0} shipped', 'ORD-1')).toBe('Order ORD-1 shipped')
    expect(t('No such text')).toBe('No such text')
  })

  it('Russian and Kazakh come from the dictionaries, with placeholders in their own word order', () => {
    setLanguage('ru')
    expect(t('Order {0} shipped', 'ORD-1')).toBe('Заказ ORD-1 отгружен')
    setLanguage('kk')
    expect(t('{0} of {1} units', 2, 3)).toBe('3 дананың 2-і')
    expect(t('A text nobody translated')).toBe('A text nobody translated')
  })

  it('category and product names from the database are translated; a new product keeps its own name', () => {
    setLanguage('ru')
    expect(t('Kitchen')).toBe('Кухня')
    expect(t('Electric kettle 1.7 L')).toBe('Электрочайник 1,7 л')
    setLanguage('kk')
    expect(t('Home textile')).toBe('Үй тоқыма бұйымдары')
    expect(t('Garden hose 20 m')).toBe('Garden hose 20 m')
  })

  it('the choice is remembered in the browser and set on <html lang>', () => {
    setLanguage('kk')
    expect(getLanguage()).toBe('kk')
    expect(localStorage.getItem('lang')).toBe('kk')
    expect(document.documentElement.lang).toBe('kk')
  })

  it('first visit follows the browser language, unknown ones get English', () => {
    expect(fromBrowser(['ru-RU', 'en'])).toBe('ru')
    expect(fromBrowser(['kk-KZ'])).toBe('kk')
    expect(fromBrowser(['de-DE', 'kk'])).toBe('kk')
    expect(fromBrowser(['de-DE'])).toBe('en')
    expect(fromBrowser([])).toBe('en')
  })
})

/** Every t('…') / t("…") key in the source, also when it is split over lines with +. */
function sourceKeys(dir: string): Set<string> {
  const lit = String.raw`(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")`
  const call = new RegExp(String.raw`(?<![\w.])t\(\s*${lit}((?:\s*\+\s*${lit})*)`, 'g')
  const keys = new Set<string>()
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name !== 'i18n') sourceKeys(path).forEach((k) => keys.add(k))
      continue
    }
    if (!/\.tsx?$/.test(name) || name.includes('.test.')) continue
    for (const m of readFileSync(path, 'utf-8').matchAll(call)) {
      const rest = [...(m[3] ?? '').matchAll(new RegExp(lit, 'g'))].map((p) => p[1] ?? p[2])
      keys.add([m[1] ?? m[2], ...rest].join('').replace(/\\(['"])/g, '$1'))
    }
  }
  return keys
}

describe('dictionaries', () => {
  const keys = [
    ...sourceKeys(join(__dirname, '..')),
    ...ADMIN_NAV.map((i) => i.label),
    ...MANAGER_NAV.map((i) => i.label),
    ...Object.values(ACTION_LABEL),
  ]

  it('finds the texts of the whole site', () => {
    expect(keys.length).toBeGreaterThan(400)
  })

  it('every text has a Russian and a Kazakh translation (add missing ones to i18n/web.txt)', () => {
    expect(keys.filter((k) => !(k in RU))).toEqual([])
    expect(keys.filter((k) => !(k in KK))).toEqual([])
  })
})
