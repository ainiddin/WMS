import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'ADMIN' | 'MANAGER' | 'WORKER' | 'CUSTOMER';
  is_active: boolean;
}

const API = 'http://localhost:8000/api/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  currentUser = signal<User | null>(null);

  constructor(private http: HttpClient, private router: Router) {
    const token = localStorage.getItem('access');
    if (token) this.loadMe().subscribe({ error: () => this.logout() });
  }

  login(username: string, password: string): Observable<any> {
    return this.http.post<{ access: string; refresh: string }>(`${API}/login/`, { username, password }).pipe(
      tap(tokens => {
        localStorage.setItem('access', tokens.access);
        localStorage.setItem('refresh', tokens.refresh);
        this.loadMe().subscribe();
      })
    );
  }

  register(data: any): Observable<any> {
    return this.http.post(`${API}/register/`, data);
  }

  loadMe(): Observable<User> {
    return this.http.get<User>(`${API}/me/`).pipe(
      tap(user => this.currentUser.set(user))
    );
  }

  logout(): void {
    localStorage.removeItem('access');
    localStorage.removeItem('refresh');
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  get isLoggedIn(): boolean {
    return !!localStorage.getItem('access');
  }

  get role(): string {
    return this.currentUser()?.role ?? '';
  }

  isAdmin(): boolean { return this.role === 'ADMIN'; }
  isManager(): boolean { return this.role === 'MANAGER'; }
  isWorker(): boolean { return this.role === 'WORKER'; }
  isCustomer(): boolean { return this.role === 'CUSTOMER'; }
  isStaff(): boolean { return ['ADMIN', 'MANAGER', 'WORKER'].includes(this.role); }
  canManage(): boolean { return ['ADMIN', 'MANAGER'].includes(this.role); }
}
