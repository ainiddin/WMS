// API of the Manager panel on the website (staff views of the catalog, orders, reports, the team).
// The server checks the role on every call; these are only the shapes and URLs.

import { api } from './client'
import type {
  Category,
  Customer,
  Invitation,
  Order,
  OrderStatus,
  PersonShort,
  ProductPublic,
  StaffDevice,
  DeviceStatus,
} from './types'

const get = <T>(url: string, params?: object) => api.get<T>(url, { params }).then((r) => r.data)
const post = <T>(url: string, body?: unknown) => api.post<T>(url, body).then((r) => r.data)
const patch = <T>(url: string, body: unknown) => api.patch<T>(url, body).then((r) => r.data)
const del = (url: string) => api.delete(url).then(() => undefined)

// ---- Types ----
export interface Supplier {
  id: number
  code: string
  supplier_name: string
  phone: string
  email: string | null
  is_active: boolean
}

export interface ProductStaff extends ProductPublic {
  quantity: number
  min_quantity: number
  below_min: boolean
  barcode: string | null
  last_updated: string
  supplier: { id: number; code: string; supplier_name: string; phone: string | null }
}

export interface ProductInput {
  product_name: string
  description: string | null
  category_id: number
  supplier_id: number
  unit_price: number
  min_quantity: number
  barcode: string | null
  is_active: boolean
}

export interface RestockRow {
  product_id: number
  product_code: string
  product_name: string
  quantity: number
  min_quantity: number
  shortage: number
  supplier_id: number
  supplier_code: string
  supplier_name: string
  supplier_phone: string
  supplier_email: string | null
}

export interface TopCustomerRow {
  customer_id: number
  customer_code: string
  full_name: string
  orders_shipped: number
  units: number
  total_amount: number
}

export interface Dashboard {
  cards: {
    products_active: number
    products_below_min: number
    products_out_of_stock: number
    orders_pending: number
    orders_to_ship: number
    orders_shipped_month: number
    revenue_month: number
    stock_value: number
  }
  movements_by_month: { month: string; in: number; out: number }[]
  sales_by_month: { month: string; orders: number; revenue: number }[]
  sales_by_category: { category: string; revenue: number; units: number }[]
  top_customers: TopCustomerRow[]
  stock_by_product: { product_code: string; product_name: string; quantity: number; min_quantity: number }[]
  restock: RestockRow[]
}

export interface WorkerLoad {
  worker: PersonShort
  team_name: string
  open_orders: number
  open_units: number
}

export interface TeamMember {
  user_id: number
  employee_id: number
  code: string
  full_name: string
  email: string
  phone: string | null
  role: string
  status: 'ACTIVE' | 'BLOCKED' | 'PENDING' | 'REJECTED'
  is_active: boolean
  created_at: string
}

// ---- Catalog (staff view: stock, supplier, barcode) ----
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

  staffProducts: (filters: ProductFilters = {}) => get<ProductStaff[]>('/products/', filters),
  createProduct: (data: ProductInput) => post<ProductStaff>('/products/', data),
  updateProduct: (id: number, data: Partial<ProductInput>) => patch<ProductStaff>(`/products/${id}/`, data),
  deleteProduct: (id: number) => del(`/products/${id}/`),
}

export const customersApi = {
  list: (search?: string) => get<Customer[]>('/customers/', { search }),
}

// ---- Orders ----
export const ordersApi = {
  list: (status?: OrderStatus, limit = 200, assigned_to?: number) =>
    get<Order[]>('/orders/', { status, limit, assigned_to }),
  get: (id: number) => get<Order>(`/orders/${id}/`),
  approve: (id: number) => post<Order>(`/orders/${id}/approve/`),
  reject: (id: number, reason?: string) => post<Order>(`/orders/${id}/reject/`, { reason: reason || null }),
  cancel: (id: number) => post<Order>(`/orders/${id}/cancel/`),
  workload: () => get<WorkerLoad[]>('/orders/workload/'),
  rebalance: () => post<{ moved: number; workload: WorkerLoad[] }>('/orders/rebalance/'),
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

// ---- My team (a Manager sees only his own) ----
export const teamApi = {
  members: () => get<TeamMember[]>('/team/members/'),
  block: (userId: number) => post<TeamMember>(`/team/members/${userId}/block/`),
  unblock: (userId: number) => post<TeamMember>(`/team/members/${userId}/unblock/`),
  devices: (status?: DeviceStatus) => get<StaffDevice[]>('/team/devices/', status ? { status } : {}),
  approveDevice: (id: number) => post<StaffDevice>(`/team/devices/${id}/approve/`),
  revokeDevice: (id: number) => post<StaffDevice>(`/team/devices/${id}/revoke/`),
  invitations: () => get<Invitation[]>('/team/invitations/'),
  invite: (email: string, full_name: string, role: 'WORKER' | 'MANAGER') =>
    post<Invitation>('/team/invitations/', { email, full_name, role }),
  resendInvitation: (id: number) => post<Invitation>(`/team/invitations/${id}/resend/`),
  revokeInvitation: (id: number) => post<Invitation>(`/team/invitations/${id}/revoke/`),
}
