import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Route } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { accountApi } from '@/api/endpoints'
import type { Account } from '@/api/types'
import { renderAt } from '@/test/render'
import { CardTab, luhnOk } from './AccountPage'

const account: Account = { code: 'A0001', balance: 0, bank: 'KeyFive Demo Bank', card: null, transactions: [] }

describe('Bank card tab', () => {
  it('checks the card number like the server does', () => {
    expect(luhnOk('4242424242424242')).toBe(true)
    expect(luhnOk('5555555555554444')).toBe(true)
    expect(luhnOk('4242424242424241')).toBe(false)
  })

  it('saves a card and sends the expiry as month and year', async () => {
    const save = vi.spyOn(accountApi, 'saveCard').mockResolvedValue({
      ...account,
      card: { holder: 'TEST USER', brand: 'Visa', last4: '4242', exp_month: 12, exp_year: 2099 },
    })
    renderAt('/', <Route path="/" element={<CardTab account={account} />} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }))
    fireEvent.change(screen.getByLabelText('Card number'), { target: { value: '4242 4242 4242 4242' } })
    fireEvent.change(screen.getByLabelText('Expiry'), { target: { value: '1299' } })
    fireEvent.change(screen.getByLabelText('Name on card'), { target: { value: 'test user' } })
    expect(screen.getByLabelText('Expiry')).toHaveValue('12/99')
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ holder: 'TEST USER', number: '4242424242424242', exp_month: 12, exp_year: 2099 }),
    )
  })

  it('does not send a wrong number', async () => {
    const save = vi.spyOn(accountApi, 'saveCard')
    renderAt('/', <Route path="/" element={<CardTab account={account} />} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }))
    fireEvent.change(screen.getByLabelText('Card number'), { target: { value: '4242424242424241' } })
    fireEvent.change(screen.getByLabelText('Expiry'), { target: { value: '1299' } })
    fireEvent.change(screen.getByLabelText('Name on card'), { target: { value: 'test user' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }))
    expect(await screen.findByText('The number is wrong, check the digits')).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })
})
