import { describe, expect, it } from 'vitest'
import { barcodeInput, pickScan } from './barcode'

// The same cases as the Staff app (mobile FlowsTest.kt): the website and the app check barcodes alike.
const kettle = { id: 1, barcode: '4870000000036', quantity: 2, product_name: 'Kettle' }
const towel = { id: 2, barcode: null, quantity: 3, product_name: 'Towel' } // no barcode: counted by hand
const order = [kettle, towel]

describe('barcodes', () => {
  it('keeps only digits, at most 14', () => {
    expect(barcodeInput('4870 0000-0003 6')).toBe('4870000000036')
    expect(barcodeInput('abc')).toBe('')
    expect(barcodeInput('123456789012345678')).toBe('12345678901234')
  })

  it('counts one unit of the right product', () => {
    expect(pickScan('4870000000036', order, {})).toEqual({ kind: 'counted', item: kettle, picked: 1 })
    expect(pickScan('4870000000036', order, { 1: 1 })).toEqual({ kind: 'counted', item: kettle, picked: 2 })
  })

  it('checks a typed code with spaces or dashes exactly like a scanned one', () => {
    const scanned = pickScan('4870000000036', order, { 1: 1 })
    expect(pickScan('4870 0000 0003 6', order, { 1: 1 })).toEqual(scanned)
    expect(pickScan(' 4870-0000-0003-6 ', order, { 1: 1 })).toEqual(scanned)
  })

  it('calls a code that is not in the order the wrong product', () => {
    expect(pickScan('4870000000043', order, {})).toEqual({ kind: 'wrong-product', code: '4870000000043' })
    expect(pickScan('487000000003', order, {})).toEqual({ kind: 'wrong-product', code: '487000000003' })
    expect(pickScan('48700000000361', order, {})).toEqual({ kind: 'wrong-product', code: '48700000000361' })
  })

  it('never matches a line without a barcode with an empty or letters-only code', () => {
    expect(pickScan('', order, {})).toEqual({ kind: 'wrong-product', code: '' })
    expect(pickScan('abc', order, {})).toEqual({ kind: 'wrong-product', code: '' })
  })

  it('refuses one more unit of a complete line, typed or scanned', () => {
    expect(pickScan('4870000000036', order, { 1: 2 })).toEqual({ kind: 'already-complete', item: kettle })
    expect(pickScan('4870 0000 0003 6', order, { 1: 2 })).toEqual({ kind: 'already-complete', item: kettle })
  })

  it('ignores the counts of other lines', () => {
    expect(pickScan('4870000000036', order, { 2: 3 })).toEqual({ kind: 'counted', item: kettle, picked: 1 })
  })
})
