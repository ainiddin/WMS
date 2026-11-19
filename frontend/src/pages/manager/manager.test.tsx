import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { tokens } from '@/api/client'
import { authApi } from '@/api/endpoints'
import { reportsApi, teamApi, type RestockRow, type TeamMember } from '@/api/staff'
import type { Invitation, StaffDevice } from '@/api/types'
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

  it('has the desk screens and none of the phone scanning screens', () => {
    const labels = MANAGER_NAV.map((n) => n.label)
    expect(labels).toEqual(expect.arrayContaining(['Dashboard', 'Orders', 'Reports', 'Products', 'My team', 'Invitations']))
    expect(labels.join(' ')).not.toMatch(/Stock IN|to ship|Admin|Users|Audit/i)
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
    id: 1, email: 'ayan@wms.kz', full_name: 'Ayan', role: 'WORKER', status: 'PENDING', team_manager_id: 2,
    team_name: 'Team Boss', invited_by_id: 5, invited_by_email: 'boss@wms.kz', created_at: '2026-11-18T10:00:00Z',
    code_sent_at: '2026-11-18T10:00:00Z', expires_at: '2026-11-20T10:00:00Z', accepted_at: null, revoked_at: null,
  }

  it('invites with trimmed values and the chosen role', async () => {
    vi.spyOn(teamApi, 'invitations').mockResolvedValue([])
    const invite = vi.spyOn(teamApi, 'invite').mockResolvedValue(inv)
    renderAt('/i', <Route path="/i" element={<ManagerInvitationsPage />} />)
    await screen.findByText('No invitations yet')
    fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: '  Ayan K ' } })
    fireEvent.change(screen.getByLabelText(/^Work email/), { target: { value: ' ayan@wms.kz ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }))
    await waitFor(() => expect(invite).toHaveBeenCalledWith('ayan@wms.kz', 'Ayan K', 'WORKER'))
  })

  it('cannot invite an Admin: the form offers only Worker and Manager', async () => {
    vi.spyOn(teamApi, 'invitations').mockResolvedValue([])
    renderAt('/i', <Route path="/i" element={<ManagerInvitationsPage />} />)
    await screen.findByText('No invitations yet')
    fireEvent.mouseDown(screen.getByRole('combobox'))
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(options).toEqual(['Worker (joins my team)', 'Manager (gets own team)'])
  })

  it('shows the server answer when the invitation is refused', async () => {
    vi.spyOn(teamApi, 'invitations').mockResolvedValue([])
    const { AxiosError, AxiosHeaders } = await import('axios')
    const response = { status: 409, statusText: '', data: { detail: 'This email is already registered' }, headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() } }
    vi.spyOn(teamApi, 'invite').mockRejectedValue(new AxiosError('x', '409', undefined, undefined, response as never))
    renderAt('/i', <Route path="/i" element={<ManagerInvitationsPage />} />)
    await screen.findByText('No invitations yet')
    fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText(/^Work email/), { target: { value: 'x@wms.kz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(await screen.findByText('This email is already registered')).toBeInTheDocument()
  })
})
