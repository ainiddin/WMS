import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { NgIf, NgFor, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { ApiService } from '../../core/api.service';

@Component({
  selector: 'app-movement-list',
  standalone: true,
  imports: [
    NgIf,
    NgFor,
    DatePipe,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  templateUrl: './movement-list.html',
  styleUrl: './movement-list.scss',
})
export class MovementListComponent implements OnInit {
  private api = inject(ApiService);

  displayedColumns = ['code', 'product_code', 'product_name', 'movement_type', 'quantity', 'employee_name', 'movement_time'];
  dataSource = new MatTableDataSource<any>([]);
  loading = false;

  filterType = '';
  filterSearch = '';

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    const params: any = {};
    if (this.filterType) params['movement_type'] = this.filterType;
    if (this.filterSearch) params['search'] = this.filterSearch;

    this.api.getMovements(params).subscribe({
      next: (res) => {
        this.dataSource.data = Array.isArray(res) ? res : res.results ?? [];
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  applyFilters(): void {
    this.load();
  }

  clearFilters(): void {
    this.filterType = '';
    this.filterSearch = '';
    this.load();
  }
}
