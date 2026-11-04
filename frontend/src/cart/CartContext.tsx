import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ProductPublic } from '@/api/types'

export interface CartLine {
  product: Pick<ProductPublic, 'id' | 'code' | 'product_name' | 'unit_price' | 'category'>
  quantity: number
}

interface CartState {
  lines: CartLine[]
  count: number
  /** Estimate only: the server calculates the real total when the order is created. */
  total: number
  add: (product: CartLine['product'], quantity?: number) => void
  setQuantity: (productId: number, quantity: number) => void
  remove: (productId: number) => void
  clear: () => void
}

const STORAGE_KEY = 'kf.cart'
export const MAX_LINE_QUANTITY = 99

function load(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CartLine[]) : []
  } catch {
    return []
  }
}

const CartContext = createContext<CartState | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
    } catch {
      /* cart is kept in memory only */
    }
  }, [lines])

  const add = useCallback((product: CartLine['product'], quantity = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id)
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, l.quantity + quantity) } : l,
        )
      }
      return [...prev, { product, quantity: Math.min(MAX_LINE_QUANTITY, quantity) }]
    })
  }, [])

  const setQuantity = useCallback((productId: number, quantity: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.product.id === productId ? { ...l, quantity: Math.max(1, Math.min(MAX_LINE_QUANTITY, quantity)) } : l,
      ),
    )
  }, [])

  const remove = useCallback((productId: number) => {
    setLines((prev) => prev.filter((l) => l.product.id !== productId))
  }, [])

  const clear = useCallback(() => setLines([]), [])

  const value = useMemo<CartState>(
    () => ({
      lines,
      count: lines.reduce((sum, l) => sum + l.quantity, 0),
      total: lines.reduce((sum, l) => sum + l.quantity * l.product.unit_price, 0),
      add,
      setQuantity,
      remove,
      clear,
    }),
    [lines, add, setQuantity, remove, clear],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
