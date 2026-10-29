import { Component, inject, Inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIf, NgFor } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ApiService } from '../../core/api.service';

@Component({
  selector: 'app-product-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NgIf,
    NgFor,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Edit Product' : 'Add Product' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dialog-form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Code</mat-label>
          <input matInput formControlName="code">
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Product Name</mat-label>
          <input matInput formControlName="product_name">
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Supplier</mat-label>
          <mat-select formControlName="supplier">
            <mat-option *ngFor="let s of suppliers" [value]="s.id">{{ s.supplier_name }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Barcode</mat-label>
          <input matInput formControlName="barcode">
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Description</mat-label>
          <textarea matInput formControlName="description" rows="3"></textarea>
        </mat-form-field>
        <div class="two-col">
          <mat-form-field appearance="outline">
            <mat-label>Unit Price (₸)</mat-label>
            <input matInput type="number" formControlName="unit_price">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Min Quantity</mat-label>
            <input matInput type="number" formControlName="min_quantity">
          </mat-form-field>
        </div>
        <mat-slide-toggle formControlName="is_active">Active</mat-slide-toggle>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid">Save</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-form { display: flex; flex-direction: column; gap: 4px; min-width: 420px; padding-top: 8px; }
    .full-width { width: 100%; }
    .two-col { display: flex; gap: 12px; }
    .two-col mat-form-field { flex: 1; }
  `],
})
export class ProductDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  dialogRef = inject(MatDialogRef<ProductDialogComponent>);

  suppliers: any[] = [];

  form = this.fb.group({
    code: ['', Validators.required],
    product_name: ['', Validators.required],
    supplier: [null as number | null],
    barcode: [''],
    description: [''],
    unit_price: [0, [Validators.required, Validators.min(0)]],
    min_quantity: [0, [Validators.required, Validators.min(0)]],
    is_active: [true],
  });

  constructor(@Inject(MAT_DIALOG_DATA) public data: any) {}

  ngOnInit(): void {
    this.api.getSuppliers().subscribe(res => {
      this.suppliers = Array.isArray(res) ? res : res.results ?? [];
    });
    if (this.data) {
      this.form.patchValue({
        code: this.data.code,
        product_name: this.data.product_name,
        supplier: this.data.supplier,
        barcode: this.data.barcode,
        description: this.data.description,
        unit_price: this.data.unit_price,
        min_quantity: this.data.min_quantity,
        is_active: this.data.is_active,
      });
    }
  }

  save(): void {
    if (this.form.valid) {
      this.dialogRef.close(this.form.value);
    }
  }
}
