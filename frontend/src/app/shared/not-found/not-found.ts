import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <div class="error-page">
      <mat-icon class="error-icon">search_off</mat-icon>
      <h1>404 – Page Not Found</h1>
      <p>The page you are looking for doesn't exist or has been moved.</p>
      <a mat-raised-button color="primary" routerLink="/">Go Home</a>
    </div>
  `,
  styles: [`
    .error-page { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; gap: 16px; text-align: center; }
    .error-icon { font-size: 80px; width: 80px; height: 80px; color: #757575; }
    h1 { font-size: 2rem; margin: 0; }
    p { color: #666; }
  `],
})
export class NotFoundComponent {}
