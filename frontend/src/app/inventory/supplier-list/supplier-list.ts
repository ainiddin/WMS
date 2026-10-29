import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { SupplierDialogComponent } from './supplier-dialog';

@Component({
  selector: 'app-supplier-list',
  standalone: true,
  imports: [
    NgIf,
    NgFor,
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
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
  ],
  templateUrl: './supplier-list.html',
  styleUrl: './supplier-list.scss',
})
export class SupplierListComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  displayedColumns = ['code', 'supplier_name', 'phone', 'email', 'is_active', 'actions'];
  dataSource = new MatTableDataSource<any>([]);
  loading = false;
  search = '';

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.api.getSuppliers().subscribe({
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
    const ref = this.dialog.open(SupplierDialogComponent, { width: '480px', data: null });
    ref.afterClosed().subscribe(result => {
      if (result) {
        this.api.createSupplier(result).subscribe({
          next: () => { this.snack.open('Supplier created', 'OK', { duration: 3000 }); this.load(); },
          error: (e) => this.snack.open(e?.error?.detail || 'Error', 'OK', { duration: 4000 })
        });
      }
    });
  }

  openEditDialog(supplier: any): void {
    const ref = this.dialog.open(SupplierDialogComponent, { width: '480px', data: supplier });
    ref.afterClosed().subscribe(result => {
      if (result) {
        this.api.updateSupplier(supplier.id, result).subscribe({
          next: () => { this.snack.open('Supplier updated', 'OK', { duration: 3000 }); this.load(); },
          error: (e) => this.snack.open(e?.error?.detail || 'Error', 'OK', { duration: 4000 })
        });
      }
    });
  }
}
