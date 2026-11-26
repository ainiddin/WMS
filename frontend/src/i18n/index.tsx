import TranslateIcon from '@mui/icons-material/Translate'
import { IconButton, Menu, MenuItem, Tooltip } from '@mui/material'
import { Fragment, useState, useSyncExternalStore, type ReactNode } from 'react'
import { KK } from './kk'
import { RU } from './ru'

/** The website's languages; English is the source text, Russian and Kazakh come from the generated dictionaries. */
export type Lang = 'en' | 'ru' | 'kk'

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'kk', label: 'Қазақша' },
]

const STORAGE_KEY = 'lang'
const DICTIONARIES: Record<Lang, Record<string, string> | null> = { en: null, ru: RU, kk: KK }

/** First visit: the browser's language if the site has it, otherwise English. */
export function fromBrowser(languages: readonly string[]): Lang {
  for (const tag of languages) {
    const code = tag.toLowerCase().split('-')[0]
    if (code === 'ru' || code === 'kk' || code === 'en') return code
  }
  return 'en'
}

function initial(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'ru' || saved === 'kk') return saved
  } catch {
    // storage blocked: fall back to the browser
  }
  return typeof navigator === 'undefined' ? 'en' : fromBrowser(navigator.languages ?? [navigator.language])
}

let current: Lang = initial()
const listeners = new Set<() => void>()

export const getLanguage = () => current

export function setLanguage(lang: Lang) {
  current = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // the choice then lasts until the page is reloaded
  }
  document.documentElement.lang = lang
  listeners.forEach((listener) => listener())
}

/**
 * The text in the chosen language. `en` is the English text and the dictionary key; a text without a translation
 * stays English. {0}, {1}… are replaced by `args`.
 */
export function t(en: string, ...args: (string | number | null | undefined)[]): string {
  const text = DICTIONARIES[current]?.[en] ?? en
  return args.reduce<string>((s, arg, i) => s.split(`{${i}}`).join(String(arg ?? '')), text)
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Redraws the pages in the new language. The pages are mounted again (open forms start over), while the session,
 * the cart and the loaded data live above and stay.
 */
export function LanguageRoot({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getLanguage)
  return <Fragment key={lang}>{children}</Fragment>
}

/** The language button for the top bars: each language is named in itself, so anyone finds theirs. */
export function LanguageMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <Tooltip title={t('Language')}>
        <IconButton color="inherit" onClick={(e) => setAnchor(e.currentTarget)} aria-label={t('Language')}>
          <TranslateIcon />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {LANGUAGES.map((l) => (
          <MenuItem
            key={l.code}
            selected={l.code === current}
            onClick={() => {
              setAnchor(null)
              setLanguage(l.code)
            }}
          >
            {l.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
