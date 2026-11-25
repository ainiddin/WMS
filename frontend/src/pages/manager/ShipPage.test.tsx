import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { tokens } from '@/api/client'
import { authApi } from '@/api/endpoints'
import { ordersApi, teamApi, type TeamMember } from '@/api/staff'
import type { Order, User } from '@/api/types'
import { admin, renderAt } from '@/test/render'
import { ShipDialog, ShipPage } from './ShipPage'

const manager: User = { ...admin, id: 5, role: 'MANAGER', email: 'dauren@wms.kz', full_name: 'Dauren', employee_id: 50 }
const worker = { employee_id: 51, full_name: 'Arman' } as TeamMember

function order(id: number, assignedTo: number | null, items = defaultItems): Order {
  return {
    id, code: `O000${id}`, status: 'APPROVED', approved_at: '2026-11-25T09:00:00Z',
    assigned_to: assignedTo ? { id: assignedTo, code: `E0${assignedTo}`, full_name: `Employee ${assignedTo}` } : null,
    customer: { id: 1, code: 'C001', full_name: 'Aliya' }, items,
  } as unknown as Order
}
const defaultItems = [
  { id: 11, product_id: 7, product_code: 'P007', product_name: 'Kettle', barcode: '4870000000036', quantity: 2 },
  { id: 12, product_id: 8, product_code: 'P008', product_name: 'Towel', barcode: null, quantity: 1 },
] as unknown as Order['items']

function open(orders: Order[]) {
  tokens.save({ access_token: 'a', refresh_token: 'r' })
  vi.spyOn(authApi, 'me').mockResolvedValue(manager)
  vi.spyOn(ordersApi, 'list').mockResolvedValue(orders)
  vi.spyOn(teamApi, 'members').mockResolvedValue([worker])
  renderAt('/manage/ship', <Route path="/manage/ship" element={<ShipPage />} />)
}

describe('Orders to ship on the website', () => {
  it("lists only the team's orders: his Workers' and his own", async () => {
    open([order(1, 51), order(2, 50), order(3, 99), order(4, null)])
    expect(await screen.findByRole('button', { name: 'Pick & ship O0001' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pick & ship O0002' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pick & ship O0003' })).toBeNull() // another team
    expect(screen.queryByRole('button', { name: 'Pick & ship O0004' })).toBeNull() // given to nobody
  })

  it('says so when there is nothing to ship', async () => {
    open([order(3, 99)])
    expect(await screen.findByText('Nothing to ship')).toBeInTheDocument()
  })
})

describe('Picking an order', () => {
  const show = () => renderAt('/', <Route path="/" element={<ShipDialog order={order(1, 51)} onClose={() => {}} />} />)
  const field = () => screen.getByLabelText('Barcode of every unit') as HTMLInputElement
  const type = (code: string) => {
    fireEvent.change(field(), { target: { value: code } })
    fireEvent.keyDown(field(), { key: 'Enter' })
  }
  const shipButton = () => screen.getByRole('button', { name: 'Ship (OUT)' })

  it('counts every typed unit, refuses the wrong product and one too many, then ships', async () => {
    const ship = vi.spyOn(ordersApi, 'ship').mockResolvedValue({ ...order(1, 51), status: 'SHIPPED' } as Order)
    show()
    expect(screen.getByRole('button', { name: 'One more Kettle' })).toBeDisabled() // locked until the first barcode

    type('4870000000043')
    expect(screen.getByRole('status')).toHaveTextContent('Barcode 4870000000043 is not in this order — wrong product')

    type('4870 0000 0003 6')
    expect(screen.getByRole('status')).toHaveTextContent('Kettle: 1 of 2')
    expect(field().value).toBe('') // ready for the next unit
    type('4870000000036')
    expect(screen.getByRole('status')).toHaveTextContent('Kettle: 2 of 2')
    type('4870000000036')
    expect(screen.getByRole('status')).toHaveTextContent('All 2 × Kettle are already picked — put this one back')

    expect(shipButton()).toBeDisabled() // the towel is not counted yet
    fireEvent.click(screen.getByRole('button', { name: 'One more Towel' }))
    expect(within(screen.getByText('3 of 3 units').parentElement!).getByText('3 of 3 units')).toBeInTheDocument()
    fireEvent.click(shipButton())
    await waitFor(() => expect(ship).toHaveBeenCalledWith(1))
  })

  it('a line with a barcode cannot be counted by hand before its first barcode', () => {
    show()
    const count = screen.getByLabelText('Picked Kettle') as HTMLInputElement
    expect(count).toBeDisabled()
    type('4870000000036')
    expect(count).toBeEnabled()
    fireEvent.change(count, { target: { value: '0' } })
    expect(count.value).toBe('1') // the confirmed unit stays
  })
})
