import { Component, inject, OnInit } from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { ApiService } from '../../core/api.service';

@Component({
  selector: 'app-stock-in',
  standalone: true,
  imports: [
    NgIf,
    NgFor,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatAutocompleteModule,
  ],
  templateUrl: './stock-in.html',
  styleUrl: './stock-in.scss',
})
export class StockInComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);

  products: any[] = [];
  loading = false;
  submitting = false;
  successMsg = '';
  errorMsg = '';

  form = this.fb.group({
    product: [null as number | null, Validators.required],
    quantity: [1, [Validators.required, Validators.min(1)]],
    note: [''],
  });

  ngOnInit(): void {
    this.loading = true;
    this.api.getProducts().subscribe({
      next: (res) => {
        this.products = Array.isArray(res) ? res : res.results ?? [];
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.submitting = true;
    this.successMsg = '';
    this.errorMsg = '';

    const payload = {
      product: this.form.value.product,
      quantity: this.form.value.quantity,
      note: this.form.value.note || '',
    };

    this.api.stockIn(payload).subscribe({
      next: () => {
        this.successMsg = 'Stock recorded successfully!';
        this.form.reset({ product: null, quantity: 1, note: '' });
        this.submitting = false;
        this.snack.open('Stock IN recorded', 'OK', { duration: 3000 });
      },
      error: (e) => {
        this.errorMsg = e?.error?.detail || 'Failed to record stock. Please try again.';
        this.submitting = false;
      }
    });
  }
}
