import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

const BASE = 'http://localhost:8000/api';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  // --- Suppliers ---
  getSuppliers(params?: any): Observable<any> {
    return this.http.get(`${BASE}/suppliers/`, { params });
  }
  createSupplier(data: any): Observable<any> {
    return this.http.post(`${BASE}/suppliers/`, data);
  }
  updateSupplier(id: number, data: any): Observable<any> {
    return this.http.patch(`${BASE}/suppliers/${id}/`, data);
  }

  // --- Products ---
  getProducts(params?: any): Observable<any> {
    return this.http.get(`${BASE}/products/`, { params });
  }
  getProduct(id: number): Observable<any> {
    return this.http.get(`${BASE}/products/${id}/`);
  }
  createProduct(data: any): Observable<any> {
    return this.http.post(`${BASE}/products/`, data);
  }
  updateProduct(id: number, data: any): Observable<any> {
    return this.http.patch(`${BASE}/products/${id}/`, data);
  }
  getProductByBarcode(barcode: string): Observable<any> {
    return this.http.get(`${BASE}/products/by-barcode/${barcode}/`);
  }

  // --- Employees ---
  getEmployees(): Observable<any> {
    return this.http.get(`${BASE}/employees/`);
  }

  // --- Customers ---
  getCustomers(params?: any): Observable<any> {
    return this.http.get(`${BASE}/customers/`, { params });
  }

  // --- Movements ---
  getMovements(params?: any): Observable<any> {
    return this.http.get(`${BASE}/movements/`, { params });
  }
  stockIn(data: any): Observable<any> {
    return this.http.post(`${BASE}/movements/in/`, data);
  }

  // --- Orders ---
  getOrders(params?: any): Observable<any> {
    return this.http.get(`${BASE}/orders/`, { params });
  }
  getOrder(id: number): Observable<any> {
    return this.http.get(`${BASE}/orders/${id}/`);
  }
  createOrder(data: any): Observable<any> {
    return this.http.post(`${BASE}/orders/`, data);
  }
  approveOrder(id: number): Observable<any> {
    return this.http.post(`${BASE}/orders/${id}/approve/`, {});
  }
  rejectOrder(id: number, comment?: string): Observable<any> {
    return this.http.post(`${BASE}/orders/${id}/reject/`, { comment });
  }
  shipOrder(id: number): Observable<any> {
    return this.http.post(`${BASE}/orders/${id}/ship/`, {});
  }
  cancelOrder(id: number): Observable<any> {
    return this.http.post(`${BASE}/orders/${id}/cancel/`, {});
  }

  // --- Reports ---
  getDashboard(): Observable<any> {
    return this.http.get(`${BASE}/dashboard/`);
  }
  getRestockReport(format?: string): Observable<any> {
    if (format === 'xlsx') {
      return this.http.get(`${BASE}/reports/restock/?format=xlsx`, { responseType: 'blob' as 'json' });
    }
    return this.http.get(`${BASE}/reports/restock/`);
  }
  getMonthlyUsage(format?: string): Observable<any> {
    if (format === 'xlsx') {
      return this.http.get(`${BASE}/reports/monthly-usage/?format=xlsx`, { responseType: 'blob' as 'json' });
    }
    return this.http.get(`${BASE}/reports/monthly-usage/`);
  }
  getTopCustomers(): Observable<any> {
    return this.http.get(`${BASE}/reports/top-customers/`);
  }
  getReconciliation(): Observable<any> {
    return this.http.get(`${BASE}/reports/reconciliation/`);
  }

  // --- Users (Admin) ---
  getUsers(): Observable<any> {
    return this.http.get(`http://localhost:8000/api/auth/users/`);
  }
  createUser(data: any): Observable<any> {
    return this.http.post(`http://localhost:8000/api/auth/users/`, data);
  }
  updateUser(id: number, data: any): Observable<any> {
    return this.http.patch(`http://localhost:8000/api/auth/users/${id}/`, data);
  }
}
