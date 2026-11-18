import { fireEvent, screen, waitFor } from '@testing-library/react'
import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { Route } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { api, PASSWORD_EXPIRED_EVENT, retryAfter, sessionEndsAt, tokens } from '@/api/client'
import { adminAuthApi, authApi } from '@/api/endpoints'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { admin, fakeJwt, renderAt, tokenPair } from '@/test/render'
import { AdminLayout, passwordExpired } from './AdminLayout'
import { AuditTable, detailsText } from './AuditPage'
import { PasswordPage } from './PasswordPage'
import { formatWait } from './parts'

function axiosError(status: number, headers: Record<string, string> = {}) {
  const response = { status, statusText: '', data: {}, headers: new AxiosHeaders(headers), config: { headers: new AxiosHeaders() } }
  return new AxiosError('x', String(status), undefined, undefined, response as never)
}

describe('helpers', () => {
  it('reads the hard session end from the token, and nothing from a bad token', () => {
    expect(sessionEndsAt(fakeJwt({ web: 1_900_000_000 }))?.getTime()).toBe(1_900_000_000_000)
    expect(sessionEndsAt(fakeJwt({ dev: 3 }))).toBeNull() // a phone token has no session end
    expect(sessionEndsAt('not-a-jwt')).toBeNull()
    expect(sessionEndsAt('a.%%%.c')).toBeNull()
    expect(sessionEndsAt(null)).toBeNull()
    expect(sessionEndsAt(fakeJwt({ web: '1900000000' }))).toBeNull() // only a number counts
  })

  it('reads Retry-After only when it is a positive number', () => {
    expect(retryAfter(axiosError(429, { 'retry-after': '42' }))).toBe(42)
    expect(retryAfter(axiosError(429, { 'retry-after': 'soon' }))).toBeUndefined()
    expect(retryAfter(axiosError(429, { 'retry-after': '0' }))).toBeUndefined()
    expect(retryAfter(axiosError(429))).toBeUndefined()
    expect(retryAfter(new Error('x'))).toBeUndefined()
  })

  it('knows when a password has expired', () => {
    expect(passwordExpired(null)).toBe(false)
    expect(passwordExpired(undefined)).toBe(false)
    expect(passwordExpired('2000-01-01T00:00:00Z')).toBe(true)
    expect(passwordExpired('2099-01-01T00:00:00Z')).toBe(false)
  })

  it('formats lock times', () => {
    expect(formatWait(45)).toBe('45 s')
    expect(formatWait(60)).toBe('1 min')
    expect(formatWait(61)).toBe('2 min')
  })
})

describe('api client', () => {
  it('tells the app when the server says the password has expired', async () => {
    const heard = vi.fn()
    window.addEventListener(PASSWORD_EXPIRED_EVENT, heard)
    const adapter = vi.fn().mockRejectedValue(axiosError(403, { 'x-password-expired': '1' }))
    await expect(api.get('/admin/users/', { adapter })).rejects.toBeTruthy()
    expect(heard).toHaveBeenCalledTimes(1)
    window.removeEventListener(PASSWORD_EXPIRED_EVENT, heard)
  })

  it('a plain 403 is not an expired password', async () => {
    const heard = vi.fn()
    window.addEventListener(PASSWORD_EXPIRED_EVENT, heard)
    const adapter = vi.fn().mockRejectedValue(axiosError(403))
    await expect(api.get('/admin/users/', { adapter })).rejects.toBeTruthy()
    expect(heard).not.toHaveBeenCalled()
    window.removeEventListener(PASSWORD_EXPIRED_EVENT, heard)
  })

  it('never tries a token refresh for a failed admin sign in or code', async () => {
    tokens.save({ access_token: 'a', refresh_token: 'r' })
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: tokenPair() })
    for (const url of ['/auth/admin/login/', '/auth/2fa/verify/', '/auth/2fa/resend/']) {
      const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
        const response = { status: 401, statusText: '', data: {}, headers: new AxiosHeaders(), config }
        throw new AxiosError('wrong code', '401', config, undefined, response as never)
      })
      await expect(api.post(url, {}, { adapter })).rejects.toBeTruthy()
      expect(adapter).toHaveBeenCalledTimes(1) // not retried after a refresh
    }
    expect(refresh).not.toHaveBeenCalled()
    expect(tokens.refresh).toBe('r') // and the saved session was not thrown away
  })

  it('other calls do refresh the token once on 401', async () => {
    tokens.save({ access_token: 'a', refresh_token: 'r' })
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: tokenPair() })
    let calls = 0
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      calls += 1
      if (calls === 1) {
        const response = { status: 401, statusText: '', data: {}, headers: new AxiosHeaders(), config }
        throw new AxiosError('expired', '401', config, undefined, response as never)
      }
      return { data: [], status: 200, statusText: 'OK', headers: {}, config }
    })
    await api.get('/admin/users/', { adapter })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(adapter).toHaveBeenCalledTimes(2)
    expect(adapter.mock.calls[1][0].headers.Authorization).toBe(`Bearer ${tokenPair().access_token}`)
  })
})

describe('route guard', () => {
  const routes = (
    <>
      <Route path="/admin/login" element={<div>ADMIN LOGIN</div>} />
      <Route path="/login" element={<div>SHOP LOGIN</div>} />
      <Route path="/403" element={<div>FORBIDDEN</div>} />
      <Route path="/admin" element={<ProtectedRoute roles={['ADMIN']} loginPath="/admin/login"><div>PANEL</div></ProtectedRoute>} />
    </>
  )

  it('sends a signed-out visitor to the Admin sign in, not the shop one', async () => {
    renderAt('/admin', routes)
    expect(await screen.findByText('ADMIN LOGIN')).toBeInTheDocument()
  })

  it('sends a signed-in customer to 403', async () => {
    tokens.save({ access_token: 'a', refresh_token: 'r' })
    vi.spyOn(authApi, 'me').mockResolvedValue({ ...admin, role: 'CUSTOMER' })
    renderAt('/admin', routes)
    expect(await screen.findByText('FORBIDDEN')).toBeInTheDocument()
  })

  it('lets an Admin in', async () => {
    tokens.save({ access_token: 'a', refresh_token: 'r' })
    vi.spyOn(authApi, 'me').mockResolvedValue(admin)
    renderAt('/admin', routes)
    expect(await screen.findByText('PANEL')).toBeInTheDocument()
  })
})

describe('expired Admin password', () => {
  const layout = (
    <Route path="/admin" element={<AdminLayout />}>
      <Route index element={<div>USERS</div>} />
      <Route path="password" element={<div>PASSWORD PAGE</div>} />
    </Route>
  )

  it('every page leads to the password change', async () => {
    tokens.save({ access_token: 'a', refresh_token: 'r' })
    vi.spyOn(authApi, 'me').mockResolvedValue({ ...admin, password_expires_at: '2000-01-01T00:00:00Z' })
    renderAt('/admin', layout)
    expect(await screen.findByText('PASSWORD PAGE')).toBeInTheDocument()
  })

  it('a valid password shows the page and the session end', async () => {
    tokens.save({ access_token: fakeJwt({ web: 1_900_000_000 }), refresh_token: 'r' })
    vi.spyOn(authApi, 'me').mockResolvedValue(admin)
    renderAt('/admin', layout)
    expect(await screen.findByText('USERS')).toBeInTheDocument()
    expect(screen.getByText(/Session until/)).toBeInTheDocument()
  })

  it('the server saying "expired" mid-session also leads there', async () => {
    tokens.save({ access_token: 'a', refresh_token: 'r' })
    vi.spyOn(authApi, 'me').mockResolvedValue(admin)
    renderAt('/admin', layout)
    await screen.findByText('USERS')
    window.dispatchEvent(new Event(PASSWORD_EXPIRED_EVENT))
    expect(await screen.findByText('PASSWORD PAGE')).toBeInTheDocument()
  })
})

describe('PasswordPage', () => {
  async function open() {
    tokens.save({ access_token: 'a', refresh_token: 'r' })
    vi.spyOn(authApi, 'me').mockResolvedValue(admin)
    renderAt('/admin/password', (
      <>
        <Route path="/admin/password" element={<PasswordPage />} />
        <Route path="/admin" element={<div>USERS</div>} />
      </>
    ))
    await screen.findByLabelText(/^Current password/)
  }
  const fill = (current: string, next: string, repeat: string) => {
    fireEvent.change(screen.getByLabelText(/^Current password/), { target: { value: current } })
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: next } })
    fireEvent.change(screen.getByLabelText(/^Repeat the new password/), { target: { value: repeat } })
  }
  const submit = () => screen.getByRole('button', { name: 'Change password' })

  it('refuses the same password, a short one and a mismatch before asking the server', async () => {
    const change = vi.spyOn(adminAuthApi, 'changePassword')
    await open()
    fill('old-password', 'old-password', 'old-password')
    expect(screen.getByText('Must differ from the current password')).toBeInTheDocument()
    expect(submit()).toBeDisabled()
    fill('old-password', 'short', 'short')
    expect(submit()).toBeDisabled()
    fill('old-password', 'new-password-1', 'new-password-2')
    expect(screen.getByText('The passwords do not match')).toBeInTheDocument()
    expect(submit()).toBeDisabled()
    expect(change).not.toHaveBeenCalled()
  })

  it('changes it, keeps the new tokens and returns to the panel', async () => {
    const pair = tokenPair()
    const change = vi.spyOn(adminAuthApi, 'changePassword').mockResolvedValue(pair)
    await open()
    fill('old-password', 'new-password-1', 'new-password-1')
    fireEvent.click(submit())
    expect(await screen.findByText('USERS')).toBeInTheDocument()
    expect(change).toHaveBeenCalledWith('old-password', 'new-password-1')
    expect(tokens.access).toBe(pair.access_token)
  })

  it('shows the server answer when the current password is wrong', async () => {
    const response = { status: 400, statusText: '', data: { detail: 'The current password is wrong' }, headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() } }
    vi.spyOn(adminAuthApi, 'changePassword').mockRejectedValue(new AxiosError('x', '400', undefined, undefined, response as never))
    await open()
    fill('bad-password', 'new-password-1', 'new-password-1')
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByText('The current password is wrong')).toBeInTheDocument())
  })
})

describe('audit log view', () => {
  it('shows details as plain text, never as HTML', () => {
    const evil = '<img src=x onerror=alert(1)>'
    expect(detailsText({ device_name: evil, attempt: 2, old: null })).toBe(`device name: ${evil} · attempt: 2 · old: —`)
    renderAt('/', (
      <Route path="/" element={<AuditTable rows={[{
        id: 1, created_at: '2026-11-18T10:00:00Z', action: 'DEVICE_APPROVED', actor_email: evil, actor_id: 1,
        target_email: null, target_user_id: null, ip: '1.2.3.4', details: { device_name: evil },
      }]} />} />
    ))
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText(evil)).toBeInTheDocument()
    expect(screen.getByText('Phone approved')).toBeInTheDocument()
  })
})
