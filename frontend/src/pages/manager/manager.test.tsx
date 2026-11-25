import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { tokens } from '@/api/client'
import { authApi } from '@/api/endpoints'
import { reportsApi, teamApi, type RestockRow, type TeamMember } from '@/api/staff'
import type { Invitation, InvitationCreated, StaffDevice } from '@/api/types'
import { clipboard } from '@/pages/admin/invitationParts'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { MANAGER_NAV, ManagerLayout } from '@/pages/admin/AdminLayout'
import { homeOf } from '@/pages/admin/AdminLoginPage'
import { admin, renderAt } from '@/test/render'
import { ManagerInvitationsPage, TeamPage } from './TeamPages'

const manager = { ...admin, id: 5, email: 'boss@wms.kz', role: 'MANAGER' as const, password_expires_at: null }

const member: TeamMember = {
  user_id: 9, employee_id: 7, code: 'E007', full_name: 'Arman Seitov', email: 'arman@wms.kz', phone: null,
  role: 'WORKER', status: 'ACTIVE', is_active: true, created_at: '2026-11-01T10:00:00Z',
}
const phone: StaffDevice = {
  id: 3, device_name: 'Samsung A54', status: 'PENDING', created_at: '2026-11-18T10:00:00Z', approved_at: null,
  last_seen_at: null, user_id: 9, user_email: 'arman@wms.kz', user_full_name: 'Arman Seitov', user_role: 'WORKER',
  current: false,
}

function signedInAs(user: typeof manager) {
  tokens.save({ access_token: 'a', refresh_token: 'r' })
  vi.spyOn(authApi, 'me').mockResolvedValue(user)
}

describe('Manager panel', () => {
  it('sends each role to its own website home', () => {
    expect(homeOf('ADMIN')).toBe('/admin')
    expect(homeOf('MANAGER')).toBe('/manage')
    expect(homeOf('WORKER')).toBeNull()
    expect(homeOf('CUSTOMER')).toBeNull()
    expect(homeOf(undefined)).toBeNull()
  })

  it('has the Manager screens, Stock IN included, and nothing of the Admin', () => {
    const labels = MANAGER_NAV.map((n) => n.label)
    expect(labels).toEqual(
      expect.arrayContaining(['Dashboard', 'Orders', 'Orders to ship', 'Stock IN', 'Reports', 'Products', 'My team', 'Invitations']),
    )
    expect(labels.join(' ')).not.toMatch(/Admin|Users|Audit/i)
    expect(MANAGER_NAV.every((n) => n.to.startsWith('/manage'))).toBe(true)
  })

  const routes = (
    <>
      <Route path="/staff/login" element={<div>STAFF LOGIN</div>} />
      <Route path="/403" element={<div>FORBIDDEN</div>} />
      <Route path="/manage" element={<ProtectedRoute roles={['MANAGER']} loginPath="/staff/login"><ManagerLayout /></ProtectedRoute>}>
        <Route index element={<div>DASHBOARD</div>} />
      </Route>
    </>
  )

  it('only a Manager gets in; a signed-out visitor goes to the staff sign in', async () => {
    renderAt('/manage', routes)
    expect(await screen.findByText('STAFF LOGIN')).toBeInTheDocument()
  })

  it('an Admin is not a Manager here', async () => {
    signedInAs({ ...manager, role: 'ADMIN' as never })
    renderAt('/manage', routes)
    expect(await screen.findByText('FORBIDDEN')).toBeInTheDocument()
  })

  it('a Manager sees his panel', async () => {
    signedInAs(manager)
    renderAt('/manage', routes)
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument()
    expect(screen.getByText('KeyFive Manager')).toBeInTheDocument()
  })

  it('shows how many products need restocking next to the Restock list', async () => {
    signedInAs(manager)
    vi.spyOn(reportsApi, 'restock').mockResolvedValue([{ product_id: 1 }, { product_id: 2 }, { product_id: 3 }] as RestockRow[])
    renderAt('/manage', routes)
    const item = (await screen.findAllByRole('link', { name: /Restock list/ }))[0]
    await waitFor(() => expect(within(item).getByText('3')).toBeInTheDocument())
  })
})

describe('TeamPage', () => {
  it('blocks a member only after the confirmation', async () => {
    vi.spyOn(teamApi, 'members').mockResolvedValue([member])
    vi.spyOn(teamApi, 'devices').mockResolvedValue([])
    const block = vi.spyOn(teamApi, 'block').mockResolvedValue({ ...member, status: 'BLOCKED' })
    renderAt('/t', <Route path="/t" element={<TeamPage />} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Block' }))
    expect(block).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Block' }))
    await waitFor(() => expect(block).toHaveBeenCalledWith(9))
  })

  it('approves a waiting phone of a member', async () => {
    vi.spyOn(teamApi, 'members').mockResolvedValue([member])
    vi.spyOn(teamApi, 'devices').mockResolvedValue([phone])
    const approve = vi.spyOn(teamApi, 'approveDevice').mockResolvedValue({ ...phone, status: 'APPROVED' })
    renderAt('/t', <Route path="/t" element={<TeamPage />} />)
    const row = (await screen.findByText('Samsung A54')).closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(approve).toHaveBeenCalledWith(3))
  })
})

describe('ManagerInvitationsPage', () => {
  const inv: Invitation = {
    id: 1, role: 'WORKER', status: 'PENDING', team_manager_id: 2, team_name: 'Team Boss', invited_by_id: 5,
    invited_by_email: 'boss@wms.kz', created_at: '2026-11-25T10:00:00Z', expires_at: '2026-11-25T11:00:00Z',
    accepted_at: null, revoked_at: null, joined_name: null, joined_email: null, joined_employee_code: null,
  }
  const created: InvitationCreated = { ...inv, link: '/join/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG' }

  it('makes a link for the chosen role and shows it once, ready to copy', async () => {
    vi.spyOn(teamApi, 'invitations').mockResolvedValue([])
    const invite = vi.spyOn(teamApi, 'invite').mockResolvedValue(created)
    const copy = vi.spyOn(clipboard, 'copy').mockResolvedValue()
    renderAt('/i', <Route path="/i" element={<ManagerInvitationsPage />} />)
    await screen.findByText('No invitations yet')
    fireEvent.click(screen.getByRole('button', { name: 'Create invitation link' }))
    await waitFor(() => expect(invite).toHaveBeenCalledWith('WORKER'))
    const field = (await screen.findByLabelText('Invitation link')) as HTMLInputElement
    expect(field.value).toBe(`${window.location.origin}/join/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG`)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(copy).toHaveBeenCalledWith(field.value))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('cannot invite an Admin: the form offers only Worker and Manager', async () => {
    vi.spyOn(teamApi, 'invitations').mockResolvedValue([])
    renderAt('/i', <Route path="/i" element={<ManagerInvitationsPage />} />)
    await screen.findByText('No invitations yet')
    fireEvent.mouseDown(screen.getByRole('combobox'))
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(options).toEqual(['Worker (joins my team)', 'Manager (gets own team)'])
  })

  it('shows who joined with a used link, and revokes only open ones', async () => {
    const used: Invitation = { ...inv, id: 2, status: 'ACCEPTED', accepted_at: '2026-11-25T10:20:00Z',
      joined_name: 'Arman Bekov', joined_email: 'arman@wms.kz', joined_employee_code: 'E0012' }
    vi.spyOn(teamApi, 'invitations').mockResolvedValue([inv, used])
    const revoke = vi.spyOn(teamApi, 'revokeInvitation').mockResolvedValue({ ...inv, status: 'REVOKED' })
    renderAt('/i', <Route path="/i" element={<ManagerInvitationsPage />} />)
    expect(await screen.findByText(/Arman Bekov · E0012/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(1) // only the open link
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    const buttons = await screen.findAllByRole('button', { name: 'Revoke' }) // the row's and the dialog's
    fireEvent.click(buttons[buttons.length - 1])
    await waitFor(() => expect(revoke).toHaveBeenCalledWith(1))
  })
})
