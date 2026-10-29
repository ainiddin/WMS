import { Injectable, signal, computed } from '@angular/core';

export interface CartItem {
  product: any;
  quantity: number;
}

@Injectable({ providedIn: 'root' })
export class CartService {
  private items = signal<CartItem[]>([]);

  readonly cart = this.items.asReadonly();

  readonly total = computed(() =>
    this.items().reduce((sum, item) => sum + item.product.unit_price * item.quantity, 0)
  );

  readonly itemCount = computed(() =>
    this.items().reduce((sum, item) => sum + item.quantity, 0)
  );

  add(product: any, quantity = 1): void {
    const current = this.items();
    const idx = current.findIndex(i => i.product.id === product.id);
    if (idx >= 0) {
      const updated = [...current];
      updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + quantity };
      this.items.set(updated);
    } else {
      this.items.set([...current, { product, quantity }]);
    }
  }

  remove(productId: number): void {
    this.items.set(this.items().filter(i => i.product.id !== productId));
  }

  updateQuantity(productId: number, quantity: number): void {
    if (quantity <= 0) {
      this.remove(productId);
      return;
    }
    this.items.set(
      this.items().map(i => i.product.id === productId ? { ...i, quantity } : i)
    );
  }

  clear(): void {
    this.items.set([]);
  }
}
