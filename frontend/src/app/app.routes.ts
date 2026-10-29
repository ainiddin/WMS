import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./auth/register/register').then(m => m.RegisterComponent)
  },
  {
    path: '403',
    loadComponent: () => import('./shared/forbidden/forbidden').then(m => m.ForbiddenComponent)
  },
  {
    path: '404',
    loadComponent: () => import('./shared/not-found/not-found').then(m => m.NotFoundComponent)
  },
  {
    path: '',
    loadComponent: () => import('./shared/shell/shell').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./reports/dashboard/dashboard').then(m => m.DashboardComponent) },
      { path: 'products', loadComponent: () => import('./inventory/product-list/product-list').then(m => m.ProductListComponent) },
      { path: 'suppliers', loadComponent: () => import('./inventory/supplier-list/supplier-list').then(m => m.SupplierListComponent) },
      { path: 'customers', loadComponent: () => import('./inventory/customer-list/customer-list').then(m => m.CustomerListComponent) },
      { path: 'stock-in', loadComponent: () => import('./inventory/stock-in/stock-in').then(m => m.StockInComponent) },
      { path: 'movements', loadComponent: () => import('./inventory/movement-list/movement-list').then(m => m.MovementListComponent) },
      { path: 'orders', loadComponent: () => import('./orders/order-list/order-list').then(m => m.OrderListComponent) },
      { path: 'catalog', loadComponent: () => import('./catalog/catalog/catalog').then(m => m.CatalogComponent) },
      { path: 'my-orders', loadComponent: () => import('./catalog/my-orders/my-orders').then(m => m.MyOrdersComponent) },
      { path: 'reports', loadComponent: () => import('./reports/reports/reports').then(m => m.ReportsComponent) },
      { path: 'users', loadComponent: () => import('./admin/user-list/user-list').then(m => m.UserListComponent) },
    ]
  },
  { path: '**', redirectTo: '404' }
];
