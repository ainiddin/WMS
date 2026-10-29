import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { NgIf, NgFor, NgClass, DatePipe, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule } from '@angular/material/chips';
import { ApiService } from '../../core/api.service';
import { OrderDetailDialogComponent } from '../../orders/order-list/order-detail-dialog';

@Component({
  selector: 'app-my-orders',
  standalone: true,
  imports: [
    NgIf,
    NgFor,
    NgClass,
    DatePipe,
    CurrencyPipe,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatExpansionModule,
    MatChipsModule,
  ],
  templateUrl: './my-orders.html',
  styleUrl: './my-orders.scss',
})
export class MyOrdersComponent implements OnInit {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  orders: any[] = [];
  loading = false;

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.api.getOrders().subscribe({
      next: (res) => {
        this.orders = Array.isArray(res) ? res : res.results ?? [];
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  cancel(order: any): void {
    if (!confirm('Cancel this order?')) return;
    this.api.cancelOrder(order.id).subscribe({
      next: () => { this.snack.open('Order cancelled', 'OK', { duration: 3000 }); this.load(); },
      error: (e) => this.snack.open(e?.error?.detail || 'Error', 'OK', { duration: 4000 })
    });
  }

  viewDetail(order: any): void {
    this.dialog.open(OrderDetailDialogComponent, { width: '600px', data: order });
  }
}
