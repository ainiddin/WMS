import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { Route } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { paymentsApi } from '@/api/endpoints'
import type { Payment } from '@/api/types'
import { renderAt } from '@/test/render'
import { PaymentResult, TopUpDialog, gateway, paymentText } from './AccountPage'

const pending: Payment = {
  code: 'PAY00001',
  amount: 5000,
  status: 'PENDING',
  card_brand: null,
  card_last4: null,
  failure_reason: null,
  created_at: '2026-11-24T10:00:00Z',
  expires_at: '2026-11-24T10:15:00Z',
  completed_at: null,
}
const paid: Payment = { ...pending, status: 'SUCCEEDED', card_brand: 'Visa', card_last4: '4242', completed_at: 'x' }

async function tick(ms: number) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const step = Math.min(250, end - Date.now())
    await act(async () => {
      vi.advanceTimersByTime(step)
    })
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Top-up dialog', () => {
  const open = () => renderAt('/', <Route path="/" element={<TopUpDialog open onClose={() => {}} />} />)

  it('asks only the amount, never the card, and sends the customer to the gateway page', async () => {
    const topUp = vi.spyOn(paymentsApi, 'topUp').mockResolvedValue({
      code: 'PAY00001', amount: 5000, checkout_url: '/fakepay/checkout?ref=PAY00001&sig=x', expires_at: 'x',
    })
    const go = vi.spyOn(gateway, 'open').mockImplementation(() => {})
    open()
    expect(screen.queryByLabelText(/card number/i)).toBeNull()
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pay by card' }))
    await waitFor(() => expect(go).toHaveBeenCalledWith('/fakepay/checkout?ref=PAY00001&sig=x'))
    expect(topUp).toHaveBeenCalledWith(5000)
  })

  it.each([['99'], ['300001']])('does not start a top-up of %s', (amount) => {
    const topUp = vi.spyOn(paymentsApi, 'topUp')
    open()
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: amount } })
    expect(screen.getByRole('button', { name: 'Pay by card' })).toBeDisabled()
    expect(topUp).not.toHaveBeenCalled()
  })

  it('allows the edges, 100 and 300 000', () => {
    open()
    for (const amount of ['100', '300000']) {
      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: amount } })
      expect(screen.getByRole('button', { name: 'Pay by card' })).toBeEnabled()
    }
  })
})

describe('Coming back from the gateway', () => {
  const show = () => renderAt('/', <Route path="/" element={<PaymentResult code="PAY00001" onDone={() => {}} />} />)

  it('asks the server every 2 s until the webhook decided, then stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const status = vi.spyOn(paymentsApi, 'status').mockResolvedValue(pending)
    show()
    expect(await screen.findByText('Waiting for the payment gateway to confirm…')).toBeInTheDocument()
    expect(status).toHaveBeenCalledTimes(1)
    await tick(2000)
    await waitFor(() => expect(status).toHaveBeenCalledTimes(2))
    status.mockResolvedValue(paid)
    await tick(2000)
    expect(await screen.findByText(/added by Visa •• 4242/)).toBeInTheDocument()
    const calls = status.mock.calls.length
    await tick(6000)
    expect(status).toHaveBeenCalledTimes(calls)
  })

  it('gives up asking after 30 s and says the money may come a bit later', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const status = vi.spyOn(paymentsApi, 'status').mockResolvedValue(pending)
    show()
    await screen.findByText('Waiting for the payment gateway to confirm…')
    await tick(31_000)
    const calls = status.mock.calls.length
    expect(calls).toBeLessThanOrEqual(17)
    await tick(6000)
    expect(status).toHaveBeenCalledTimes(calls)
    expect(await screen.findByText(/not confirmed yet/)).toBeInTheDocument()
  })

  it('explains a cancelled and an expired payment', () => {
    expect(paymentText({ ...pending, status: 'FAILED', failure_reason: 'Cancelled on the payment page' }))
      .toBe('The payment was not made: Cancelled on the payment page. Nothing was charged.')
    expect(paymentText({ ...pending, status: 'EXPIRED' })).toContain('link expired')
  })
})
