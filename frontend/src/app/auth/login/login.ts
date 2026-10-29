import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIf } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NgIf,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  auth = inject(AuthService);

  form = this.fb.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  loading = false;
  error = '';

  onSubmit(): void {
    if (this.form.invalid) return;
    this.loading = true;
    this.error = '';
    const { username, password } = this.form.value;
    this.auth.login(username!, password!).subscribe({
      next: () => {
        // Wait for currentUser to be set
        const check = () => {
          const user = this.auth.currentUser();
          if (user) {
            if (user.role === 'CUSTOMER') {
              this.router.navigate(['/catalog']);
            } else if (user.role === 'WORKER') {
              this.router.navigate(['/orders']);
            } else {
              this.router.navigate(['/dashboard']);
            }
          } else {
            setTimeout(check, 50);
          }
        };
        check();
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.detail || 'Invalid credentials. Please try again.';
        this.loading = false;
      },
    });
  }
}
