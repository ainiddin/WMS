import { fireEvent, screen, waitFor } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { Route } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { catalogApi, movementsApi, type ProductStaff, type StockMovement } from '@/api/staff'
import { renderAt } from '@/test/render'
import { barcodeInput } from '@/barcode'
import { StockInPage } from './StockInPage'

const kettle = {
  id: 7, code: 'P007', product_name: 'Electric kettle', is_active: true, quantity: 3, min_quantity: 5,
  below_min: true, barcode: '4870000000031',
} as unknown as ProductStaff

const movement: StockMovement = {
  id: 1, code: 'M0001', movement_type: 'IN', quantity: 12, movement_time: '2026-11-25T10:00:00Z', note: null,
  product_id: 7, product_code: 'P007', product_name: 'Electric kettle', employee_id: 2, employee_name: 'Dauren',
  customer_id: null, customer_name: null, order_id: null, order_code: null,
}

function notFound(detail: string) {
  const response = { status: 404, statusText: '', data: { detail }, headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() } }
  return new AxiosError('x', '404', undefined, undefined, response as never)
}

function open(path = '/manage/stock-in') {
  vi.spyOn(catalogApi, 'staffProducts').mockResolvedValue([kettle])
  vi.spyOn(movementsApi, 'list').mockResolvedValue([])
  renderAt(path, <Route path="/manage/stock-in" element={<StockInPage />} />)
}

const barcodeField = () => screen.getByLabelText('Barcode') as HTMLInputElement
const quantityField = () => screen.getByLabelText(/^Quantity received/) as HTMLInputElement
const saveButton = () => screen.getByRole('button', { name: 'Save stock IN' })

describe('Stock IN on the website', () => {
  it('keeps only digits of a typed barcode, like the Staff app', () => {
    expect(barcodeInput('4870 0000-0003 1')).toBe('4870000000031')
    expect(barcodeInput('abc')).toBe('')
    expect(barcodeInput('123456789012345678')).toBe('12345678901234')
  })

  it('finds the product by a typed barcode on Enter and saves the received quantity', async () => {
    const lookup = vi.spyOn(catalogApi, 'byBarcode').mockResolvedValue(kettle)
    const stockIn = vi.spyOn(movementsApi, 'stockIn').mockResolvedValue(movement)
    open()
    fireEvent.change(barcodeField(), { target: { value: '4870 0000 0003 1' } })
    expect(barcodeField().value).toBe('4870000000031')
    fireEvent.keyDown(barcodeField(), { key: 'Enter' })
    expect(await screen.findByText(/now in stock/)).toHaveTextContent('Electric kettle — now in stock: 3 (minimum 5)')
    expect(lookup).toHaveBeenCalledWith('4870000000031')

    fireEvent.change(quantityField(), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: '  Invoice 55  ' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(stockIn).toHaveBeenCalledWith({ product_id: 7, quantity: 12, note: 'Invoice 55' }))
  })

  it('shows the server answer for an unknown barcode and saves nothing', async () => {
    vi.spyOn(catalogApi, 'byBarcode').mockRejectedValue(notFound('No product with barcode 4870000000048'))
    const stockIn = vi.spyOn(movementsApi, 'stockIn')
    open()
    fireEvent.change(barcodeField(), { target: { value: '4870000000048' } })
    fireEvent.keyDown(barcodeField(), { key: 'Enter' })
    expect(await screen.findByText('No product with barcode 4870000000048')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
    expect(stockIn).not.toHaveBeenCalled()
  })

  it('accepts 1 to 100 000 whole units only', async () => {
    open('/manage/stock-in?product=7')
    expect(await screen.findByText(/now in stock/)).toBeInTheDocument() // preselected from the Restock list
    for (const bad of ['0', '100001']) {
      fireEvent.change(quantityField(), { target: { value: bad } })
      expect(saveButton()).toBeDisabled()
    }
    fireEvent.change(quantityField(), { target: { value: '-5.5' } })
    expect(quantityField().value).toBe('55') // only digits are kept
    for (const good of ['1', '100000']) {
      fireEvent.change(quantityField(), { target: { value: good } })
      expect(saveButton()).toBeEnabled()
    }
  })

  it('needs a product before saving', async () => {
    open()
    await screen.findByLabelText('Product')
    fireEvent.change(quantityField(), { target: { value: '5' } })
    expect(saveButton()).toBeDisabled()
  })
})
