import { Component, inject, OnInit } from '@angular/core';
import { NgIf, NgFor, CurrencyPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    NgIf,
    NgFor,
    CurrencyPipe,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatSnackBarModule,
  ],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class ReportsComponent implements OnInit {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);

  restockData: any[] = [];
  monthlyUsageData: any[] = [];
  topCustomersData: any[] = [];

  loading = { restock: false, monthly: false, topCustomers: false };

  restockColumns = ['code', 'product_name', 'quantity', 'min_quantity', 'shortage'];
  monthlyColumns = ['product_name', 'month', 'total_out'];
  topCustomerColumns = ['username', 'full_name', 'order_count', 'total_spent'];

  ngOnInit(): void {
    this.loadRestock();
    this.loadMonthlyUsage();
    this.loadTopCustomers();
  }

  loadRestock(): void {
    this.loading.restock = true;
    this.api.getRestockReport().subscribe({
      next: (res) => { this.restockData = Array.isArray(res) ? res : res.results ?? []; this.loading.restock = false; },
      error: () => { this.loading.restock = false; }
    });
  }

  loadMonthlyUsage(): void {
    this.loading.monthly = true;
    this.api.getMonthlyUsage().subscribe({
      next: (res) => { this.monthlyUsageData = Array.isArray(res) ? res : res.results ?? []; this.loading.monthly = false; },
      error: () => { this.loading.monthly = false; }
    });
  }

  loadTopCustomers(): void {
    this.loading.topCustomers = true;
    this.api.getTopCustomers().subscribe({
      next: (res) => { this.topCustomersData = Array.isArray(res) ? res : res.results ?? []; this.loading.topCustomers = false; },
      error: () => { this.loading.topCustomers = false; }
    });
  }

  exportRestock(): void {
    this.api.getRestockReport('xlsx').subscribe({
      next: (blob: Blob) => this.downloadBlob(blob, 'restock-report.xlsx'),
      error: () => this.snack.open('Export failed', 'OK', { duration: 3000 })
    });
  }

  exportMonthly(): void {
    this.api.getMonthlyUsage('xlsx').subscribe({
      next: (blob: Blob) => this.downloadBlob(blob, 'monthly-usage.xlsx'),
      error: () => this.snack.open('Export failed', 'OK', { duration: 3000 })
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}
