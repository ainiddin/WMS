import { fireEvent, screen, waitFor } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { Route } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { joinApi } from '@/api/endpoints'
import type { User } from '@/api/types'
import { admin, renderAt } from '@/test/render'
import { JoinPage } from './AuthPages'

const TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'

function notFound(detail: string) {
  const response = { status: 404, statusText: '', data: { detail }, headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() } }
  return new AxiosError('x', '404', undefined, undefined, response as never)
}

function open() {
  renderAt(`/join/${TOKEN}`, <Route path="/join/:token" element={<JoinPage />} />)
}

const fill = (values: Record<string, string>) => {
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } })
  }
}
const good = {
  'First name': ' Arman ', 'Last name': 'Bekov', 'Work email': ' arman@wms.kz ', Phone: '+7 701 111 22 33',
  Password: 'kettle_2026', 'Repeat password': 'kettle_2026',
}

describe('Join page of an invitation link', () => {
  it('shows who invites, takes the form and gives the employee id', async () => {
    vi.spyOn(joinApi, 'info').mockResolvedValue({ role: 'WORKER', team_name: 'Team Dauren', invited_by: 'Dauren', expires_at: 'x' })
    const join = vi.spyOn(joinApi, 'join').mockResolvedValue({
      ...admin, role: 'WORKER', full_name: 'Arman Bekov', email: 'arman@wms.kz', employee_code: 'E0012',
    } as User)
    open()
    expect(await screen.findByText(/Dauren invites you to Team Dauren/)).toBeInTheDocument()
    fill(good)
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    await waitFor(() => expect(join).toHaveBeenCalledWith(TOKEN, {
      first_name: 'Arman', last_name: 'Bekov', email: 'arman@wms.kz', phone: '+7 701 111 22 33', password: 'kettle_2026',
    }))
    expect(await screen.findByText('E0012')).toBeInTheDocument()
    expect(screen.getByText(/KeyFive Staff/)).toBeInTheDocument()
  })

  it('says what the password still needs and waits for a good form', async () => {
    vi.spyOn(joinApi, 'info').mockResolvedValue({ role: 'WORKER', team_name: null, invited_by: 'Dauren', expires_at: 'x' })
    const join = vi.spyOn(joinApi, 'join')
    open()
    await screen.findByRole('button', { name: 'Join' })
    fill({ ...good, Password: 'kettle2026', 'Repeat password': 'kettle2026' })
    expect(screen.getByText('Still needed: a special character (@ _ - $ …)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled()
    fill({ ...good, Phone: '12345' })
    expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled()
    fill({ ...good, 'Repeat password': 'kettle_2027' })
    expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled()
    fill(good)
    expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled()
    expect(join).not.toHaveBeenCalled()
  })

  it('a used, expired or unknown link shows the server answer and no form', async () => {
    vi.spyOn(joinApi, 'info').mockRejectedValue(notFound('This invitation link is not valid or has expired. Ask your Manager for a new one.'))
    open()
    expect(await screen.findByText(/not valid or has expired/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull()
  })
})
