import { describe, expect, it } from 'vitest'
import { passwordHint, passwordProblems } from './password'

// The same cases as the server's tests (backend tests/test_password.py): both must agree.
describe('new password rule', () => {
  it.each([
    ['short', ['at least 8 characters', 'a digit', 'a special character (@ _ - $ …)']],
    ['', ['at least 8 characters', 'a letter', 'a digit', 'a special character (@ _ - $ …)']],
    ['onlyletters', ['a digit', 'a special character (@ _ - $ …)']],
    ['12345678', ['a letter', 'a special character (@ _ - $ …)']],
    ['letters1234', ['a special character (@ _ - $ …)']],
    ['letters_only', ['a digit']],
    ['1234_5678', ['a letter']],
    ['with space 1', ['a special character (@ _ - $ …)']],
    ['Ab1_', ['at least 8 characters']],
  ])('%j still needs %j', (password, missing) => {
    expect(passwordProblems(password)).toEqual(missing)
  })

  it.each(['kettle_2026', 'Pass-word9', 'a1$aaaaa', 'Пароль_2026', '12345-x8'])('%j follows the rule', (password) => {
    expect(passwordProblems(password)).toEqual([])
    expect(passwordHint(password)).toBeNull()
  })

  it('says what is missing in one line, and refuses more than 72 characters', () => {
    expect(passwordHint('kettle2026')).toBe('Still needed: a special character (@ _ - $ …)')
    expect(passwordHint('a1_' + 'x'.repeat(70))).toBe('At most 72 characters')
  })
})
