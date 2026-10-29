import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { NgIf, NgFor, NgClass, DatePipe, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { OrderDetailDialogComponent } from './order-detail-dialog';

@Component({
  selector: 'app-order-list',
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
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatTooltipModule,
  ],
  templateUrl: './order-list.html',
  styleUrl: './order-list.scss',
})
export class OrderListComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  displayedColumns = ['code', 'customer_name', 'status', 'total_amount', 'created_at', 'actions'];
  dataSource = new MatTableDataSource<any>([]);
  loading = false;
  filterStatus = '';

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    const params: any = {};
    if (this.filterStatus) params['status'] = this.filterStatus;

    this.api.getOrders(params).subscribe({
      next: (res) => {
        this.dataSource.data = Array.isArray(res) ? res : res.results ?? [];
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  isManager(): boolean { return this.auth.canManage(); }
  isWorker(): boolean { return this.auth.isWorker(); }
  isCustomer(): boolean { return this.auth.isCustomer(); }

  approve(order: any): void {
    this.api.approveOrder(order.id).subscribe({
      next: () => { this.snack.open('Order approved', 'OK', { duration: 3000 }); this.load(); },
      error: (e) => this.snack.open(e?.error?.detail || 'Error', 'OK', { duration: 4000 })
    });
  }

  reject(order: any): void {
    const comment = prompt('Rejection reason (optional):');
    this.api.rejectOrder(order.id, comment || '').subscribe({
      next: () => { this.snack.open('Order rejected', 'OK', { duration: 3000 }); this.load(); },
      error: (e) => this.snack.open(e?.error?.detail || 'Error', 'OK', { duration: 4000 })
    });
  }

  ship(order: any): void {
    this.api.shipOrder(order.id).subscribe({
      next: () => { this.snack.open('Order shipped!', 'OK', { duration: 3000 }); this.load(); },
      error: (e) => this.snack.open(e?.error?.detail || 'Error', 'OK', { duration: 4000 })
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
