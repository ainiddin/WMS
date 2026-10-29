import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-forbidden',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <div class="error-page">
      <mat-icon class="error-icon">lock</mat-icon>
      <h1>403 – Forbidden</h1>
      <p>You don't have permission to access this page.</p>
      <a mat-raised-button color="primary" routerLink="/">Go Home</a>
    </div>
  `,
  styles: [`
    .error-page { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; gap: 16px; text-align: center; }
    .error-icon { font-size: 80px; width: 80px; height: 80px; color: #e53935; }
    h1 { font-size: 2rem; margin: 0; }
    p { color: #666; }
  `],
})
export class ForbiddenComponent {}
