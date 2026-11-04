// Types of the FastAPI responses (see backend/app/schemas).

export type Role = 'ADMIN' | 'MANAGER' | 'WORKER' | 'CUSTOMER'
export type UserStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'BLOCKED'
export type OrderStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SHIPPED' | 'CANCELLED'
export type MovementType = 'IN' | 'OUT'
export type Period = 'week' | 'month' | 'quarter' | 'year'

export interface User {
  id: number
  email: string
  full_name: string
  phone: string | null
  role: Role
  status: UserStatus
  requested_role: Role | null
  created_at: string
  approved_at: string | null
  employee_id: number | null
  employee_code: string | null
  manager_id: number | null
  customer_id: number | null
  customer_code: string | null
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  user: User
}

export interface Category {
  id: number
  code: string
  name: string
  is_active: boolean
}

export interface Supplier {
  id: number
  code: string
  supplier_name: string
  phone: string
  email: string | null
  is_active: boolean
}

export interface ProductPublic {
  id: number
  code: string
  product_name: string
  description: string | null
  category: Category
  unit_price: number
  in_stock: boolean
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

export interface Customer {
  id: number
  code: string
  full_name: string
  phone: string | null
  address: string | null
  email: string | null
  is_active: boolean
}

export interface Employee {
  id: number
  code: string
  user_id: number
  full_name: string
  role: Role
  phone: string | null
  manager_id: number | null
  team_name: string
  is_active: boolean
}

export interface AdminUser {
  id: number
  email: string
  full_name: string
  phone: string | null
  role: Role
  status: UserStatus
  requested_role: Role | null
  created_at: string
  approved_at: string | null
  employee: Employee | null
}

export interface Movement {
  id: number
  code: string
  movement_type: MovementType
  quantity: number
  movement_time: string
  note: string | null
  product_id: number
  product_code: string
  product_name: string
  employee_id: number
  employee_name: string
  customer_id: number | null
  customer_name: string | null
  order_id: number | null
  order_code: string | null
}

export interface PersonShort {
  id: number
  code: string
  full_name: string
}

export interface OrderItem {
  id: number
  product_id: number
  product_code: string
  product_name: string
  barcode: string | null
  quantity: number
  unit_price: number
  line_total: number
  available_quantity: number | null
}

export interface Order {
  id: number
  code: string
  status: OrderStatus
  delivery_address: string
  total_amount: number
  comment: string | null
  rejection_reason: string | null
  created_at: string
  approved_at: string | null
  shipped_at: string | null
  cancelled_at: string | null
  customer: PersonShort
  approved_by: PersonShort | null
  shipped_by: PersonShort | null
  items: OrderItem[]
}

// ---- Reports / dashboard ----
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

// ---- Performance ----
export interface Metrics {
  employee_id: number
  code: string
  full_name: string
  role: Role
  manager_id: number | null
  is_active: boolean
  orders_approved: number
  orders_rejected: number
  avg_approval_hours: number | null
  orders_shipped: number
  units_shipped: number
  stock_in_count: number
  units_in: number
  points: number
  rank?: number
}

export interface TeamSummary {
  manager_id: number
  manager_code: string
  manager_name: string
  team_name: string
  members: number
  orders_shipped: number
  orders_approved: number
  stock_in_count: number
  units_shipped: number
  points: number
  rank: number
  teams_total?: number
}

export interface TimelinePoint {
  date: string
  orders_shipped: number
  orders_approved: number
  stock_in_count: number
  units_shipped: number
  points: number
}

interface PeriodInfo {
  period: Period
  start: string
  end: string
  bucket: 'day' | 'week' | 'month'
}

export interface MyPerformance extends PeriodInfo {
  me: Metrics
  timeline: TimelinePoint[]
  team: TeamSummary | null
  rank_in_team: number | null
  team_size: number | null
}

export interface TeamPerformance extends PeriodInfo {
  team: TeamSummary | null
  manager: Metrics
  workers: Metrics[]
  timeline: TimelinePoint[]
}

export interface AllPerformance extends PeriodInfo {
  totals: Pick<TeamSummary, 'orders_shipped' | 'orders_approved' | 'stock_in_count' | 'units_shipped' | 'points'>
  teams: TeamSummary[]
  timeline: TimelinePoint[]
}

export interface Leaderboard extends PeriodInfo {
  points_formula: string
  teams: TeamSummary[]
}
