import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { Route } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminAuthApi, staffAuthApi } from '@/api/endpoints'
import type { TwoFactorRequired, WebLoginStarted } from '@/api/types'
import { admin, renderAt, tokenPair } from '@/test/render'
import { StaffLoginPage, STATUS_EVERY_MS } from './AdminLoginPage'

const started: WebLoginStarted = {
  request_token: 'web-request-token-xxxxxxxxxxxxxxxx',
  number: 47,
  expires_at: '2099-01-01T00:00:00Z',
  seconds: 120,
  phone_available: true,
  role: 'MANAGER',
}

const challenge: TwoFactorRequired = {
  two_factor_required: true,
  challenge_token: 'challenge-token-xxxxxxxxxxxxxxxxxxxx',
  sent_to: 'c***@keyfive.kz',
  code_seconds: 360,
  resend_seconds: 60,
  expires_at: '2099-01-01T00:00:00Z',
}

/** An axios error as the server would send it. */
function apiError(status: number, detail: string, headers: Record<string, string> = {}) {
  const response = {
    status,
    statusText: '',
    data: { detail },
    headers: new AxiosHeaders(headers),
    config: { headers: new AxiosHeaders() },
  }
  return new AxiosError(detail, String(status), undefined, undefined, response as never)
}

function renderLogin() {
  return renderAt('/staff/login', (
    <>
      <Route path="/staff/login" element={<StaffLoginPage />} />
      <Route path="/admin" element={<div>ADMIN HOME</div>} />
      <Route path="/manage" element={<div>MANAGER HOME</div>} />
    </>
  ))
}

function typePassword() {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: ' admin001@wms.kz ' } })
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret-pass' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

/** Moves the fake clock like a real one: a quarter second at a time, letting React render in between. */
async function tick(ms: number) {
  for (let done = 0; done < ms; done += 250) {
    await act(async () => {
      vi.advanceTimersByTime(250)
    })
  }
}

const codeInput = () => screen.getByLabelText(/^Code from the email/) as HTMLInputElement

describe('AdminLoginPage', () => {
  beforeEach(() => {
    // These tests are about the email code: an Admin with no approving phone goes straight to it.
    vi.spyOn(staffAuthApi, 'webLogin').mockResolvedValue({ ...started, phone_available: false })
    vi.spyOn(staffAuthApi, 'emailCode').mockResolvedValue(challenge)
  })
  afterEach(() => vi.useRealTimers())

  it('sends the trimmed email, then asks for the code mailed to the corporate mailbox', async () => {
    renderLogin()
    typePassword()
    expect(await screen.findByText(/c\*\*\*@keyfive\.kz/)).toBeInTheDocument()
    expect(staffAuthApi.webLogin).toHaveBeenCalledWith('admin001@wms.kz', 'secret-pass')
    expect(staffAuthApi.emailCode).toHaveBeenCalledWith(started.request_token)
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument() // the password field is gone
  })

  it('accepts only digits, at most 6, and enables Sign in only with 6', async () => {
    renderLogin()
    typePassword()
    await screen.findByLabelText(/^Code from the email/)
    const signIn = screen.getByRole('button', { name: 'Sign in' })
    fireEvent.change(codeInput(), { target: { value: '12a 3-4' } })
    expect(codeInput().value).toBe('1234')
    expect(signIn).toBeDisabled()
    fireEvent.change(codeInput(), { target: { value: '1234567890' } })
    expect(codeInput().value).toBe('123456')
    expect(signIn).toBeEnabled()
  })

  it('signs in with the right code and opens the panel', async () => {
    const verify = vi.spyOn(adminAuthApi, 'verify').mockResolvedValue(tokenPair())
    renderLogin()
    typePassword()
    await screen.findByLabelText(/^Code from the email/)
    fireEvent.change(codeInput(), { target: { value: '654321' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('ADMIN HOME')).toBeInTheDocument()
    expect(verify).toHaveBeenCalledWith(challenge.challenge_token, '654321')
    expect(localStorage.getItem('kf.access')).toBeTruthy()
  })

  it('shows the attempts left and clears the field after a wrong code', async () => {
    vi.spyOn(adminAuthApi, 'verify').mockRejectedValue(apiError(400, 'Wrong code. Attempts left: 4'))
    renderLogin()
    typePassword()
    await screen.findByLabelText(/^Code from the email/)
    fireEvent.change(codeInput(), { target: { value: '111111' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Wrong code. Attempts left: 4')).toBeInTheDocument()
    expect(codeInput().value).toBe('')
    expect(localStorage.getItem('kf.access')).toBeNull()
  })

  it('after five wrong codes says a new code was sent, as information, not as an error', async () => {
    vi.spyOn(adminAuthApi, 'verify').mockRejectedValue(
      apiError(400, 'Too many wrong codes. That code no longer works, a new code was sent.'),
    )
    renderLogin()
    typePassword()
    await screen.findByLabelText(/^Code from the email/)
    fireEvent.change(codeInput(), { target: { value: '111111' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    const alert = await screen.findByText(/a new code was sent/)
    expect(alert.closest('.MuiAlert-standardInfo')).not.toBeNull()
    expect(screen.getByLabelText(/^Code from the email/)).toBeInTheDocument() // still on the code step
  })

  it('goes back to the password when the sign in is no longer valid', async () => {
    vi.spyOn(adminAuthApi, 'verify').mockRejectedValue(
      apiError(400, 'This sign in is no longer valid. Sign in again with your password.'),
    )
    renderLogin()
    typePassword()
    await screen.findByLabelText(/^Code from the email/)
    fireEvent.change(codeInput(), { target: { value: '111111' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeInTheDocument()
    expect(screen.getByText(/Sign in again/)).toBeInTheDocument()
  })

  it('"Send again" waits 60 s, then sends and restarts the wait', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const resend = vi.spyOn(adminAuthApi, 'resend').mockResolvedValue(challenge)
    renderLogin()
    typePassword()
    await screen.findByLabelText(/^Code from the email/)
    expect(screen.getByRole('button', { name: /Send again in 60 s/ })).toBeDisabled()

    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })
    expect(screen.getByRole('button', { name: /Send again in 30 s/ })).toBeDisabled()
    await act(async () => {
      vi.advanceTimersByTime(31_000)
    })
    const button = screen.getByRole('button', { name: 'Send again' })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    await waitFor(() => expect(resend).toHaveBeenCalledWith(challenge.challenge_token))
    expect(await screen.findByText(/previous one no longer works/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send again in 60 s/ })).toBeDisabled()
  })

  it('a 429 counts down to the second in the browser and then unlocks, asking the server only once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const login = vi.spyOn(staffAuthApi, 'webLogin').mockRejectedValue(
      apiError(429, 'Too many codes were sent to the corporate mailbox. Try again in 2 min.', { 'retry-after': '65' }),
    )
    renderLogin()
    typePassword()
    const timer = await screen.findByRole('timer')
    expect(timer).toHaveTextContent('Too many codes were sent to the corporate mailbox. Try again in 1:05.')
    expect(timer).not.toHaveTextContent('2 min') // the server's rounded time is replaced by the live one
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()

    await tick(1_000)
    expect(screen.getByRole('timer')).toHaveTextContent('Try again in 1:04.')
    await tick(59_000)
    expect(screen.getByRole('timer')).toHaveTextContent('Try again in 0:05.')
    expect(login).toHaveBeenCalledTimes(1) // no polling while it counts down

    await tick(5_000)
    expect(screen.queryByRole('timer')).toBeNull() // over: the message goes away
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    expect(login).toHaveBeenCalledTimes(1)
    await tick(2_000)
    expect(vi.getTimerCount()).toBe(0) // and the countdown stopped ticking
  })

  it('a too-early "Send again" shows its own countdown and the button comes back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(adminAuthApi, 'resend').mockRejectedValue(
      apiError(429, 'Wait 3 s before requesting a new code', { 'retry-after': '3' }),
    )
    renderLogin()
    typePassword()
    await screen.findByLabelText(/^Code from the email/)
    await tick(60_000)
    fireEvent.click(screen.getByRole('button', { name: 'Send again' }))
    expect(await screen.findByRole('timer')).toHaveTextContent('A new code can be requested in 0:03.')
    await tick(3_000)
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('a 429 without Retry-After is shown as a plain error', async () => {
    vi.spyOn(staffAuthApi, 'webLogin').mockRejectedValue(apiError(429, 'Too many attempts. Try again in 15 min.'))
    renderLogin()
    typePassword()
    expect(await screen.findByText('Too many attempts. Try again in 15 min.')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('does not keep the password in the form after it was accepted', async () => {
    renderLogin()
    typePassword()
    await screen.findByLabelText(/^Code from the email/)
    fireEvent.click(screen.getByRole('button', { name: 'Use another account' }))
    expect((screen.getByLabelText(/password/i) as HTMLInputElement).value).toBe('')
  })
})

describe('StaffLoginPage: confirm on the phone', () => {
  afterEach(() => vi.useRealTimers())

  async function toPhoneStep(role: 'MANAGER' | 'ADMIN' = 'MANAGER') {
    vi.spyOn(staffAuthApi, 'webLogin').mockResolvedValue({ ...started, role })
    renderLogin()
    typePassword()
    expect(await screen.findByTestId('phone-number')).toHaveTextContent('47')
    await act(async () => {}) // let React start its effects (the polling) before time is measured
  }

  it('shows the number and asks the server only every few seconds until the phone approves', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const status = vi.spyOn(staffAuthApi, 'status')
      .mockResolvedValueOnce({ status: 'PENDING', tokens: null })
      .mockResolvedValueOnce({ status: 'PENDING', tokens: null })
      .mockResolvedValue({ status: 'APPROVED', tokens: tokenPair({ ...admin, role: 'MANAGER' }) })
    await toPhoneStep()
    expect(screen.getByText(/tap this number/)).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('2:00')

    await tick(1_750)
    expect(status).not.toHaveBeenCalled() // not hammering the server: once every 2 seconds at most
    await tick(250)
    expect(status).toHaveBeenCalledTimes(1)
    await tick(2 * STATUS_EVERY_MS)
    expect(await screen.findByText('MANAGER HOME')).toBeInTheDocument()
    expect(status).toHaveBeenCalledTimes(3)
    expect(status).toHaveBeenCalledWith(started.request_token)
    expect(localStorage.getItem('kf.access')).toBeTruthy()

    await tick(3 * STATUS_EVERY_MS)
    expect(status).toHaveBeenCalledTimes(3) // stopped after the answer
  })

  it('a rejection on the phone brings back the password form with the reason', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(staffAuthApi, 'status').mockRejectedValue(apiError(403, 'The sign in was rejected on the phone'))
    await toPhoneStep()
    await tick(STATUS_EVERY_MS)
    expect(await screen.findByText('The sign in was rejected on the phone')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    expect(screen.queryByTestId('phone-number')).toBeNull()
  })

  it('no answer in time: the wait ends here, by the browser clock', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(staffAuthApi, 'status').mockResolvedValue({ status: 'PENDING', tokens: null })
    await toPhoneStep()
    await tick(60_000)
    expect(screen.getByRole('timer')).toHaveTextContent('1:00')
    await tick(60_000)
    expect(await screen.findByText(/No answer from the phone in time/)).toBeInTheDocument()
    expect(screen.queryByTestId('phone-number')).toBeNull()
  })

  it('an Admin can switch to the email code without typing the password again', async () => {
    vi.spyOn(staffAuthApi, 'status').mockResolvedValue({ status: 'PENDING', tokens: null })
    const emailCode = vi.spyOn(staffAuthApi, 'emailCode').mockResolvedValue(challenge)
    await toPhoneStep('ADMIN')
    fireEvent.click(screen.getByRole('button', { name: 'Use the email code instead' }))
    expect(await screen.findByLabelText(/^Code from the email/)).toBeInTheDocument()
    expect(emailCode).toHaveBeenCalledWith(started.request_token)
  })

  it('a Manager has no email-code way around the phone', async () => {
    vi.spyOn(staffAuthApi, 'status').mockResolvedValue({ status: 'PENDING', tokens: null })
    await toPhoneStep('MANAGER')
    expect(screen.queryByRole('button', { name: 'Use the email code instead' })).toBeNull()
  })

  it('a Manager without an approved phone is told to use the app first', async () => {
    vi.spyOn(staffAuthApi, 'webLogin').mockRejectedValue(
      apiError(409, 'Sign in in the KeyFive Staff app on your work phone first: website sign ins are approved there.'))
    renderLogin()
    typePassword()
    expect(await screen.findByText(/KeyFive Staff app on your work phone first/)).toBeInTheDocument()
  })

  it('cancel stops waiting', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const status = vi.spyOn(staffAuthApi, 'status').mockResolvedValue({ status: 'PENDING', tokens: null })
    await toPhoneStep()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await tick(3 * STATUS_EVERY_MS)
    expect(status).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
  })
})
