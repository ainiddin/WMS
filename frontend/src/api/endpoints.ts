import { api } from './client'
import type {
  Account,
  AdminUser,
  AllPerformance,
  Category,
  Customer,
  Dashboard,
  Employee,
  Leaderboard,
  Metrics,
  Movement,
  MovementType,
  MyPerformance,
  Order,
  OrderStatus,
  Period,
  ProductInput,
  ProductPublic,
  ProductStaff,
  RestockRow,
  Role,
  Supplier,
  TeamPerformance,
  TokenPair,
  TopCustomerRow,
  User,
  UserStatus,
} from './types'

const get = <T>(url: string, params?: object) => api.get<T>(url, { params }).then((r) => r.data)
const post = <T>(url: string, body?: unknown) => api.post<T>(url, body).then((r) => r.data)
const patch = <T>(url: string, body: unknown) => api.patch<T>(url, body).then((r) => r.data)
const del = (url: string) => api.delete(url).then(() => undefined)

// ---- Auth ----
export const authApi = {
  login: (email: string, password: string) => {
    // OAuth2 password form, as FastAPI's OAuth2PasswordRequestForm expects.
    const form = new URLSearchParams({ username: email, password })
    return post<TokenPair>('/auth/login/', form)
  },
  /** Step 1 of sign up: emails a 6-digit code that proves the address exists. */
  sendCode: (email: string) => post<{ detail: string }>('/auth/send-code/', { email }),
  register: (data: {
    email: string
    code: string
    password: string
    full_name: string
    phone?: string
    address?: string
  }) =>
    post<TokenPair>('/auth/register/', data),
  registerStaff: (data: {
    email: string
    code: string
    password: string
    full_name: string
    phone?: string
    requested_role: 'MANAGER' | 'WORKER'
  }) => post<{ detail: string; user: User }>('/auth/register-staff/', data),
  me: () => get<User>('/auth/me/'),
}

// ---- Catalog ----
export interface ProductFilters {
  search?: string
  category_id?: number
  supplier_id?: number
  min_price?: number
  max_price?: number
  in_stock?: boolean
  below_min?: boolean
  include_inactive?: boolean
  sort?: 'name' | 'price' | '-price' | 'code' | 'quantity'
}

export const catalogApi = {
  categories: (include_inactive = false) => get<Category[]>('/categories/', { include_inactive }),
  createCategory: (data: { name: string; is_active: boolean }) => post<Category>('/categories/', data),
  updateCategory: (id: number, data: Partial<Category>) => patch<Category>(`/categories/${id}/`, data),
  deleteCategory: (id: number) => del(`/categories/${id}/`),

  suppliers: (include_inactive = false) => get<Supplier[]>('/suppliers/', { include_inactive }),
  createSupplier: (data: Omit<Supplier, 'id' | 'code'>) => post<Supplier>('/suppliers/', data),
  updateSupplier: (id: number, data: Partial<Supplier>) => patch<Supplier>(`/suppliers/${id}/`, data),
  deleteSupplier: (id: number) => del(`/suppliers/${id}/`),

  products: (filters: ProductFilters = {}) => get<ProductPublic[]>('/products/', filters),
  staffProducts: (filters: ProductFilters = {}) => get<ProductStaff[]>('/products/', filters),
  popular: (limit = 8) => get<ProductPublic[]>('/products/popular/', { limit }),
  product: (id: number) => get<ProductPublic>(`/products/${id}/`),
  byBarcode: (code: string) => get<ProductStaff>(`/products/by-barcode/${encodeURIComponent(code)}/`),
  createProduct: (data: ProductInput) => post<ProductStaff>('/products/', data),
  updateProduct: (id: number, data: Partial<ProductInput>) => patch<ProductStaff>(`/products/${id}/`, data),
  deleteProduct: (id: number) => del(`/products/${id}/`),
}

// ---- Customers ----
export const customersApi = {
  list: (search?: string) => get<Customer[]>('/customers/', { search }),
  me: () => get<Customer>('/customers/me/'),
  updateMe: (data: Partial<Pick<Customer, 'full_name' | 'phone' | 'address'>>) => patch<Customer>('/customers/me/', data),
}

// ---- Customer account (simulated bank top-ups) ----
export const accountApi = {
  get: () => get<Account>('/account/'),
  topUp: (amount: number) => post<Account>('/account/top-up/', { amount }),
}

// ---- Movements ----
export interface MovementFilters {
  product?: number
  type?: MovementType
  employee?: number
  from?: string
  to?: string
  limit?: number
}

export const movementsApi = {
  list: (filters: MovementFilters = {}) => get<Movement[]>('/movements/', filters),
  stockIn: (data: { product_id?: number; barcode?: string; quantity: number; note?: string }) =>
    post<Movement>('/movements/in/', data),
}

// ---- Orders ----
export const ordersApi = {
  list: (status?: OrderStatus, limit = 200) => get<Order[]>('/orders/', { status, limit }),
  get: (id: number) => get<Order>(`/orders/${id}/`),
  create: (data: { items: { product_id: number; quantity: number }[]; delivery_address?: string; comment?: string }) =>
    post<Order>('/orders/', data),
  approve: (id: number) => post<Order>(`/orders/${id}/approve/`),
  reject: (id: number, reason?: string) => post<Order>(`/orders/${id}/reject/`, { reason: reason || null }),
  ship: (id: number) => post<Order>(`/orders/${id}/ship/`),
  cancel: (id: number) => post<Order>(`/orders/${id}/cancel/`),
}

// ---- Reports ----
export type ReportName = 'restock' | 'monthly-usage' | 'top-customers' | 'reconciliation' | 'orders'

export const reportsApi = {
  dashboard: () => get<Dashboard>('/dashboard/'),
  restock: () => get<RestockRow[]>('/reports/restock/'),
  topCustomers: (limit = 10) => get<TopCustomerRow[]>('/reports/top-customers/', { limit }),
  report: <T = Record<string, unknown>>(name: ReportName) => get<T[]>(`/reports/${name}/`),
}

/** Downloads a file from an authorized endpoint (a plain <a href> would not send the JWT). */
export async function downloadFile(url: string, fallbackName: string, params?: object) {
  const response = await api.get<Blob>(url, { params, responseType: 'blob' })
  const disposition = String(response.headers['content-disposition'] ?? '')
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName
  const href = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = href
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

export const exportReport = (name: ReportName, format: 'xlsx' | 'pdf') =>
  downloadFile(`/reports/${name}/export/`, `${name}.${format}`, { format })

// ---- Performance ----
export const performanceApi = {
  me: (period: Period) => get<MyPerformance>('/performance/me/', { period }),
  team: (managerId: number, period: Period) => get<TeamPerformance>(`/performance/team/${managerId}/`, { period }),
  all: (period: Period) => get<AllPerformance>('/performance/all/', { period }),
  leaderboard: (period: Period) => get<Leaderboard>('/leaderboard/', { period }),
  teamLeaderboard: (managerId: number, period: Period) =>
    get<{ team_name: string; workers: Metrics[] }>(`/leaderboard/team/${managerId}/`, { period }),
}

// ---- Admin ----
export const adminApi = {
  users: (filters: { status?: UserStatus; role?: Role; search?: string } = {}) =>
    get<AdminUser[]>('/admin/users/', filters),
  approve: (id: number, role: 'MANAGER' | 'WORKER', manager_id: number | null) =>
    post<AdminUser>(`/admin/users/${id}/approve/`, { role, manager_id }),
  reject: (id: number) => post<AdminUser>(`/admin/users/${id}/reject/`),
  block: (id: number) => post<AdminUser>(`/admin/users/${id}/block/`),
  unblock: (id: number) => post<AdminUser>(`/admin/users/${id}/unblock/`),
  changeRole: (id: number, role: 'ADMIN' | 'MANAGER' | 'WORKER', manager_id: number | null) =>
    patch<AdminUser>(`/admin/users/${id}/role/`, { role, manager_id }),
  employees: (filters: { role?: Role; manager_id?: number } = {}) => get<Employee[]>('/admin/employees/', filters),
  changeTeam: (employeeId: number, manager_id: number) =>
    patch<Employee>(`/admin/employees/${employeeId}/team/`, { manager_id }),
}
