// The rule for a NEW password, the same as the server's (backend app/schemas/common.py) and the Staff app's.
// The server checks it again; this only tells the person what is missing while typing.
import { t } from '@/i18n'

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 72

/** What the password still needs; empty = it follows the rule. */
export function passwordProblems(password: string): string[] {
  const chars = [...password]
  const problems: string[] = []
  if (chars.length < PASSWORD_MIN_LENGTH) problems.push(t('at least {0} characters', PASSWORD_MIN_LENGTH))
  if (!chars.some((c) => /\p{L}/u.test(c))) problems.push(t('a letter'))
  if (!chars.some((c) => /\p{Nd}/u.test(c))) problems.push(t('a digit'))
  if (!chars.some((c) => !/[\p{L}\p{N}\s]/u.test(c))) problems.push(t('a special character (@ _ - $ …)'))
  return problems
}

/** Text under the password field: what is missing, or null when the password is fine. */
export function passwordHint(password: string): string | null {
  if ([...password].length > PASSWORD_MAX_LENGTH) return t('At most {0} characters', PASSWORD_MAX_LENGTH)
  const problems = passwordProblems(password)
  return problems.length ? t('Still needed: {0}', problems.join(', ')) : null
}

export const passwordRule = () => t('At least 8 characters with a letter, a digit and a special character (@ _ - $ …)')
