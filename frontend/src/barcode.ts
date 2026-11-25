// Barcodes on the website: the same cleaning and the same picking check as the Staff app (mobile Flows.kt).

/** Typed or from a USB scanner (it types the digits and Enter): keep digits only, at most 14. */
export const barcodeInput = (typed: string) => typed.replace(/\D/g, '').slice(0, 14)

export interface PickLine {
  id: number
  barcode: string | null
  quantity: number
}

/** What one barcode means while picking an order. */
export type PickScan<T extends PickLine> =
  | { kind: 'counted'; item: T; picked: number } // the right product: this unit is counted
  | { kind: 'wrong-product'; code: string } // no line of this order has this barcode
  | { kind: 'already-complete'; item: T } // the line is complete: one unit too many

/**
 * The one check for a barcode while picking, the same whether it was typed or came from a scanner: the code is
 * cleaned (barcodeInput), must belong to a line of this order, and that line must not be complete yet.
 * `picked` = units counted so far per order line id.
 */
export function pickScan<T extends PickLine>(raw: string, items: T[], picked: Record<number, number>): PickScan<T> {
  const code = barcodeInput(raw)
  const item = items.find((i) => i.barcode !== null && i.barcode === code)
  if (!item) return { kind: 'wrong-product', code }
  const now = picked[item.id] ?? 0
  return now >= item.quantity ? { kind: 'already-complete', item } : { kind: 'counted', item, picked: now + 1 }
}
