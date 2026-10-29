import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { UserDialogComponent } from './user-dialog';

@Component({
  selector: 'app-user-list',
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
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  templateUrl: './user-list.html',
  styleUrl: './user-list.scss',
})
export class UserListComponent implements OnInit {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  displayedColumns = ['username', 'email', 'first_name', 'last_name', 'role', 'is_active', 'actions'];
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
    this.api.getUsers().subscribe({
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

  openAddDialog(): void {
    const ref = this.dialog.open(UserDialogComponent, { width: '480px', data: null });
    ref.afterClosed().subscribe(result => {
      if (result) {
        this.api.createUser(result).subscribe({
          next: () => { this.snack.open('User created', 'OK', { duration: 3000 }); this.load(); },
          error: (e) => {
            const msg = e?.error ? JSON.stringify(e.error) : 'Error creating user';
            this.snack.open(msg, 'OK', { duration: 5000 });
          }
        });
      }
    });
  }

  toggleActive(user: any): void {
    this.api.updateUser(user.id, { is_active: !user.is_active }).subscribe({
      next: () => { this.snack.open('User updated', 'OK', { duration: 2000 }); this.load(); },
      error: (e) => this.snack.open(e?.error?.detail || 'Error', 'OK', { duration: 4000 })
    });
  }

  openEditDialog(user: any): void {
    const ref = this.dialog.open(UserDialogComponent, { width: '480px', data: user });
    ref.afterClosed().subscribe(result => {
      if (result) {
        this.api.updateUser(user.id, result).subscribe({
          next: () => { this.snack.open('User updated', 'OK', { duration: 3000 }); this.load(); },
          error: (e) => this.snack.open(e?.error?.detail || 'Error', 'OK', { duration: 4000 })
        });
      }
    });
  }
}
