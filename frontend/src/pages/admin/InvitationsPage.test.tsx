import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { Route } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { adminApi } from '@/api/endpoints'
import type { Employee, Invitation } from '@/api/types'
import { renderAt } from '@/test/render'
import { InvitationsPage } from './InvitationsPage'

const base: Invitation = {
  id: 1, email: 'ayan@wms.kz', full_name: 'Ayan K', role: 'WORKER', status: 'PENDING', team_manager_id: 2,
  team_name: 'Team Dauren', invited_by_id: 5, invited_by_email: 'dauren@wms.kz', created_at: '2026-11-18T10:00:00Z',
  code_sent_at: '2026-11-18T10:00:00Z', expires_at: '2026-11-20T10:00:00Z', accepted_at: null, revoked_at: null,
}
const manager: Employee = {
  id: 2, code: 'E002', user_id: 5, full_name: 'Dauren', role: 'MANAGER', phone: null, manager_id: null,
  team_name: 'Team Dauren', is_active: true,
}

function setup(invitations: Invitation[], managers: Employee[] = [manager]) {
  vi.spyOn(adminApi, 'invitations').mockResolvedValue(invitations)
  vi.spyOn(adminApi, 'employees').mockResolvedValue(managers)
  renderAt('/admin/invitations', <Route path="/admin/invitations" element={<InvitationsPage />} />)
}

describe('InvitationsPage', () => {
  it('lists every invitation with its team and inviter', async () => {
    setup([base, { ...base, id: 2, email: 'dilnaz@wms.kz', role: 'MANAGER', team_name: null, team_manager_id: null }])
    expect(await screen.findByText('ayan@wms.kz')).toBeInTheDocument()
    expect(screen.getByText('Team Dauren')).toBeInTheDocument()
    expect(screen.getByText('own new team')).toBeInTheDocument()
    expect(screen.getAllByText('dauren@wms.kz')).toHaveLength(2)
  })

  it('offers actions only on open invitations', async () => {
    setup([
      { ...base, id: 1, email: 'a@wms.kz', status: 'PENDING' },
      { ...base, id: 2, email: 'b@wms.kz', status: 'ACCEPTED' },
      { ...base, id: 3, email: 'c@wms.kz', status: 'REVOKED' },
      { ...base, id: 4, email: 'd@wms.kz', status: 'EXPIRED' },
    ])
    const row = async (email: string) => within((await screen.findByText(email)).closest('tr')!)
    expect((await row('a@wms.kz')).getByRole('button', { name: 'Revoke' })).toBeInTheDocument()
    expect((await row('b@wms.kz')).queryByRole('button')).toBeNull()
    expect((await row('c@wms.kz')).queryByRole('button')).toBeNull()
    expect((await row('d@wms.kz')).getByRole('button', { name: 'Send again' })).toBeInTheDocument()
  })

  it('revokes only after the confirmation', async () => {
    setup([base])
    const revoke = vi.spyOn(adminApi, 'revokeInvitation').mockResolvedValue({ ...base, status: 'REVOKED' })
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }))
    expect(revoke).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(revoke).toHaveBeenCalledWith(1))
  })

  it('shows the server answer when "Send again" is too soon', async () => {
    setup([base])
    const response = { status: 429, statusText: '', data: { detail: 'Wait 42 s before sending it again' }, headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() } }
    vi.spyOn(adminApi, 'resendInvitation').mockRejectedValue(new AxiosError('x', '429', undefined, undefined, response as never))
    fireEvent.click(await screen.findByRole('button', { name: 'Send again' }))
    expect(await screen.findByText('Wait 42 s before sending it again')).toBeInTheDocument()
  })

  it('the first-Manager form appears only when there is no active Manager', async () => {
    setup([], [manager])
    await screen.findByText('No invitations')
    expect(screen.queryByText('Invite the first Manager')).toBeNull()
  })

  it('invites the first Manager when there is none', async () => {
    setup([], [{ ...manager, is_active: false }])
    const invite = vi.spyOn(adminApi, 'inviteFirstManager').mockResolvedValue({ ...base, role: 'MANAGER' })
    expect(await screen.findByText('Invite the first Manager')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Invite Manager' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: ' Aigerim S ' } })
    fireEvent.change(screen.getByLabelText(/^Work email/), { target: { value: ' aigerim@wms.kz ' } })
    fireEvent.click(button)
    await waitFor(() => expect(invite).toHaveBeenCalledWith('aigerim@wms.kz', 'Aigerim S'))
  })
})
