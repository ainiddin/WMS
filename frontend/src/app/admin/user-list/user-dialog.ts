import { Component, inject, Inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIf } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

@Component({
  selector: 'app-user-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NgIf,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Edit User' : 'Add User' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dialog-form">
        <div class="two-col">
          <mat-form-field appearance="outline">
            <mat-label>First Name</mat-label>
            <input matInput formControlName="first_name">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Last Name</mat-label>
            <input matInput formControlName="last_name">
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Username</mat-label>
          <input matInput formControlName="username">
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Email</mat-label>
          <input matInput type="email" formControlName="email">
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width" *ngIf="!data">
          <mat-label>Password</mat-label>
          <input matInput type="password" formControlName="password">
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Role</mat-label>
          <mat-select formControlName="role">
            <mat-option value="ADMIN">Admin</mat-option>
            <mat-option value="MANAGER">Manager</mat-option>
            <mat-option value="WORKER">Worker</mat-option>
            <mat-option value="CUSTOMER">Customer</mat-option>
          </mat-select>
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
    .two-col { display: flex; gap: 12px; }
    .two-col mat-form-field { flex: 1; }
  `],
})
export class UserDialogComponent {
  private fb = inject(FormBuilder);
  dialogRef = inject(MatDialogRef<UserDialogComponent>);

  form = this.fb.group({
    username: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    first_name: [''],
    last_name: [''],
    password: [''],
    role: ['WORKER', Validators.required],
    is_active: [true],
  });

  constructor(@Inject(MAT_DIALOG_DATA) public data: any) {
    if (!data) {
      this.form.get('password')!.setValidators([Validators.required, Validators.minLength(8)]);
      this.form.get('password')!.updateValueAndValidity();
    }
    if (data) {
      this.form.patchValue({
        username: data.username,
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        role: data.role,
        is_active: data.is_active,
      });
    }
  }

  save(): void {
    if (this.form.valid) {
      const value = { ...this.form.value };
      if (this.data && !value.password) {
        delete (value as any).password;
      }
      this.dialogRef.close(value);
    }
  }
}
