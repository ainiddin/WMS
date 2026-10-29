import { Component, inject, OnInit, signal } from '@angular/core';
import { NgIf, NgFor, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatBadgeModule } from '@angular/material/badge';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService } from '../../core/api.service';
import { CartService } from '../cart.service';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [
    NgIf,
    NgFor,
    CurrencyPipe,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatBadgeModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDividerModule,
  ],
  templateUrl: './catalog.html',
  styleUrl: './catalog.scss',
})
export class CatalogComponent implements OnInit {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  private router = inject(Router);
  cart = inject(CartService);

  products: any[] = [];
  filteredProducts: any[] = [];
  loading = false;
  search = '';
  checkingOut = false;

  ngOnInit(): void {
    this.loading = true;
    this.api.getProducts({ is_active: true }).subscribe({
      next: (res) => {
        this.products = Array.isArray(res) ? res : res.results ?? [];
        this.filteredProducts = this.products;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  applySearch(): void {
    const q = this.search.toLowerCase().trim();
    this.filteredProducts = q
      ? this.products.filter(p =>
          p.product_name?.toLowerCase().includes(q) ||
          p.code?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
        )
      : this.products;
  }

  addToCart(product: any): void {
    this.cart.add(product, 1);
    this.snack.open(`"${product.product_name}" added to cart`, 'OK', { duration: 2000 });
  }

  isInCart(productId: number): boolean {
    return this.cart.cart().some(i => i.product.id === productId);
  }

  getCartQty(productId: number): number {
    return this.cart.cart().find(i => i.product.id === productId)?.quantity ?? 0;
  }

  checkout(): void {
    if (this.cart.itemCount() === 0) {
      this.snack.open('Your cart is empty', 'OK', { duration: 3000 });
      return;
    }
    this.checkingOut = true;
    const items = this.cart.cart().map(i => ({ product: i.product.id, quantity: i.quantity }));
    this.api.createOrder({ items }).subscribe({
      next: () => {
        this.cart.clear();
        this.snack.open('Order placed successfully!', 'OK', { duration: 3000 });
        this.router.navigate(['/my-orders']);
        this.checkingOut = false;
      },
      error: (e) => {
        this.snack.open(e?.error?.detail || 'Order failed', 'OK', { duration: 4000 });
        this.checkingOut = false;
      }
    });
  }
}
