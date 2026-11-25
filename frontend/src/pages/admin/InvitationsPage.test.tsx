import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Route } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { adminApi } from '@/api/endpoints'
import type { Employee, Invitation } from '@/api/types'
import { renderAt } from '@/test/render'
import { InvitationsPage } from './InvitationsPage'

const base: Invitation = {
  id: 1, role: 'WORKER', status: 'PENDING', team_manager_id: 2, team_name: 'Team Dauren', invited_by_id: 5,
  invited_by_email: 'dauren@wms.kz', created_at: '2026-11-25T10:00:00Z', expires_at: '2026-11-25T11:00:00Z',
  accepted_at: null, revoked_at: null, joined_name: null, joined_email: null, joined_employee_code: null,
}
const manager = { id: 2, is_active: true } as Employee

function setup(invitations: Invitation[], managers: Employee[] = [manager]) {
  vi.spyOn(adminApi, 'invitations').mockResolvedValue(invitations)
  vi.spyOn(adminApi, 'employees').mockResolvedValue(managers)
  renderAt('/admin/invitations', <Route path="/admin/invitations" element={<InvitationsPage />} />)
}

describe('InvitationsPage (Admin)', () => {
  it('lists every link with who made it, and nothing to make while a Manager exists', async () => {
    setup([base, { ...base, id: 2, status: 'EXPIRED' }])
    expect(await screen.findAllByText('dauren@wms.kz')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Invite the first Manager' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(1)
  })

  it('revokes an open link after confirming', async () => {
    setup([base])
    const revoke = vi.spyOn(adminApi, 'revokeInvitation').mockResolvedValue({ ...base, status: 'REVOKED' })
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }))
    const buttons = await screen.findAllByRole('button', { name: 'Revoke' })
    fireEvent.click(buttons[buttons.length - 1])
    await waitFor(() => expect(revoke).toHaveBeenCalledWith(1))
  })

  it('without any Manager makes the link for the first one and shows it', async () => {
    setup([], [])
    const invite = vi.spyOn(adminApi, 'inviteFirstManager').mockResolvedValue({
      ...base, role: 'MANAGER', team_manager_id: null, team_name: null, link: '/join/first-manager-token',
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Invite the first Manager' }))
    await waitFor(() => expect(invite).toHaveBeenCalled())
    expect(((await screen.findByLabelText('Invitation link')) as HTMLInputElement).value).toMatch(/\/join\/first-manager-token$/)
  })
})
