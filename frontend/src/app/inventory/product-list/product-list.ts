import { Component, inject, OnInit, ViewChild, signal } from '@angular/core';
import { NgIf, NgFor, NgClass, CurrencyPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ProductDialogComponent } from './product-dialog';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [
    NgIf,
    NgFor,
    NgClass,
    CurrencyPipe,
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSelectModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatChipsModule,
  ],
  templateUrl: './product-list.html',
  styleUrl: './product-list.scss',
})
export class ProductListComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  displayedColumns = ['code', 'product_name', 'supplier_name', 'quantity', 'min_quantity', 'unit_price', 'actions'];
  dataSource = new MatTableDataSource<any>([]);
  loading = false;
  search = '';

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  ngOnInit(): void {
    this.loadProducts();
  }

  loadProducts(): void {
    this.loading = true;
    this.api.getProducts().subscribe({
      next: (res) => {
        this.dataSource.data = Array.isArray(res) ? res : res.results ?? [];
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  applyFilter(): void {
    this.dataSource.filter = this.search.trim().toLowerCase();
  }

  canManage(): boolean {
    return this.auth.canManage();
  }

  openAddDialog(): void {
    const ref = this.dialog.open(ProductDialogComponent, { width: '500px', data: null });
    ref.afterClosed().subscribe(result => {
      if (result) {
        this.api.createProduct(result).subscribe({
          next: () => { this.snack.open('Product created', 'OK', { duration: 3000 }); this.loadProducts(); },
          error: (e) => this.snack.open(e?.error?.detail || 'Error creating product', 'OK', { duration: 4000 })
        });
      }
    });
  }

  openEditDialog(product: any): void {
    const ref = this.dialog.open(ProductDialogComponent, { width: '500px', data: product });
    ref.afterClosed().subscribe(result => {
      if (result) {
        this.api.updateProduct(product.id, result).subscribe({
          next: () => { this.snack.open('Product updated', 'OK', { duration: 3000 }); this.loadProducts(); },
          error: (e) => this.snack.open(e?.error?.detail || 'Error updating product', 'OK', { duration: 4000 })
        });
      }
    });
  }
}
