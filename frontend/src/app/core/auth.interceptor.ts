import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { HttpClient } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<any>, next: HttpHandlerFn) => {
  const token = localStorage.getItem('access');
  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  const http = inject(HttpClient);

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !req.url.includes('/login/') && !req.url.includes('/refresh/')) {
        const refresh = localStorage.getItem('refresh');
        if (refresh) {
          return http.post<{ access: string }>('http://localhost:8000/api/auth/refresh/', { refresh }).pipe(
            switchMap(tokens => {
              localStorage.setItem('access', tokens.access);
              const retryReq = req.clone({ setHeaders: { Authorization: `Bearer ${tokens.access}` } });
              return next(retryReq);
            }),
            catchError(refreshErr => {
              localStorage.removeItem('access');
              localStorage.removeItem('refresh');
              return throwError(() => refreshErr);
            })
          );
        }
      }
      return throwError(() => err);
    })
  );
};
