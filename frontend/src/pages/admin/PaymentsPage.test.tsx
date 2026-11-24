import { screen } from '@testing-library/react'
import { Route } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { adminApi } from '@/api/endpoints'
import { renderAt } from '@/test/render'
import { PaymentsPage } from './PaymentsPage'

describe('Admin payments', () => {
  it('shows what came in, read only, with the card shown only as brand and last 4 digits', async () => {
    vi.spyOn(adminApi, 'payments').mockResolvedValue({
      gateway: 'CardPay Fake',
      total: 12_000,
      today: 7000,
      payments: [
        {
          code: 'PAY00002', amount: 7000, status: 'SUCCEEDED', card_brand: 'Visa', card_last4: '4242',
          failure_reason: null, created_at: '2026-11-24T10:00:00Z', expires_at: '2026-11-24T10:15:00Z',
          completed_at: '2026-11-24T10:01:00Z', account_code: 'A0001', customer_name: 'Aigerim Nurlanova',
        },
        {
          code: 'PAY00001', amount: 3000, status: 'FAILED', card_brand: null, card_last4: null,
          failure_reason: 'Cancelled on the payment page', created_at: '2026-11-24T09:00:00Z',
          expires_at: '2026-11-24T09:15:00Z', completed_at: '2026-11-24T09:02:00Z', account_code: 'A0001',
          customer_name: 'Aigerim Nurlanova',
        },
      ],
    })
    renderAt('/', <Route path="/" element={<PaymentsPage />} />)
    expect(await screen.findByText(/nobody can withdraw/)).toBeInTheDocument()
    expect(screen.getByText('Received in total').parentElement).toHaveTextContent('12')
    expect(screen.getByText('Visa •• 4242')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /withdraw/i })).toBeNull()
  })
})
