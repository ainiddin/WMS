import { Component, inject, Inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIf } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

@Component({
  selector: 'app-supplier-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NgIf,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSlideToggleModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Edit Supplier' : 'Add Supplier' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dialog-form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Code</mat-label>
          <input matInput formControlName="code">
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Supplier Name</mat-label>
          <input matInput formControlName="supplier_name">
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Phone</mat-label>
          <input matInput formControlName="phone">
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Email</mat-label>
          <input matInput type="email" formControlName="email">
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Address</mat-label>
          <textarea matInput formControlName="address" rows="2"></textarea>
        </mat-form-field>
        <mat-slide-toggle formControlName="is_active">Active</mat-slide-toggle>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid">Save</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-form { display: flex; flex-direction: column; gap: 4px; min-width: 400px; padding-top: 8px; }
    .full-width { width: 100%; }
  `],
})
export class SupplierDialogComponent {
  private fb = inject(FormBuilder);
  dialogRef = inject(MatDialogRef<SupplierDialogComponent>);

  form = this.fb.group({
    code: ['', Validators.required],
    supplier_name: ['', Validators.required],
    phone: [''],
    email: ['', Validators.email],
    address: [''],
    is_active: [true],
  });

  constructor(@Inject(MAT_DIALOG_DATA) public data: any) {
    if (data) {
      this.form.patchValue(data);
    }
  }

  save(): void {
    if (this.form.valid) {
      this.dialogRef.close(this.form.value);
    }
  }
}
