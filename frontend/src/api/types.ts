// Types of the FastAPI responses the shop uses (see backend/app/schemas). Staff types live in the Android app.

export type Role = "ADMIN" | "MANAGER" | "WORKER" | "CUSTOMER";
export type UserStatus = "PENDING" | "ACTIVE" | "REJECTED" | "BLOCKED";
export type OrderStatus =
  "PENDING" | "APPROVED" | "REJECTED" | "SHIPPED" | "CANCELLED";
export interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  requested_role: Role | null;
  created_at: string;
  approved_at: string | null;
  employee_id: number | null;
  employee_code: string | null;
  manager_id: number | null;
  customer_id: number | null;
  customer_code: string | null;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  user: User;
}

export interface Category {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

export interface ProductPublic {
  id: number;
  code: string;
  product_name: string;
  description: string | null;
  category: Category;
  unit_price: number;
  in_stock: boolean;
  is_active: boolean;
}

export interface Customer {
  id: number;
  code: string;
  full_name: string;
  phone: string | null;
  address: string | null;
  email: string | null;
  is_active: boolean;
  balance: number;
}

export interface PersonShort {
  id: number;
  code: string;
  full_name: string;
}

export interface OrderItem {
  id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  barcode: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  available_quantity: number | null;
}

export interface Order {
  id: number;
  code: string;
  status: OrderStatus;
  delivery_address: string;
  total_amount: number;
  /** PAID / REFUNDED = paid from the customer's account; null = old order paid on delivery */
  payment_status: "PAID" | "REFUNDED" | null;
  comment: string | null;
  rejection_reason: string | null;
  created_at: string;
  approved_at: string | null;
  shipped_at: string | null;
  cancelled_at: string | null;
  customer: PersonShort;
  approved_by: PersonShort | null;
  shipped_by: PersonShort | null;
  /** The Worker who should pick it (least loaded at approval); any Worker may still ship it. */
  assigned_to: PersonShort | null;
  assigned_at: string | null;
  items: OrderItem[];
  /** Only for PENDING orders: what is missing and the expected wait. */
  waiting: WaitingLine[] | null;
  eta_min_days: number | null;
  eta_max_days: number | null;
}

export interface WaitingLine {
  product_id: number;
  product_code: string;
  product_name: string;
  missing: number;
}

export interface StockCheck {
  waiting: WaitingLine[];
  eta_min_days: number | null;
  eta_max_days: number | null;
}

// ---- Customer account ----
export type TransactionType = "TOPUP" | "PAYMENT" | "REFUND";

export interface AccountTransaction {
  id: number;
  code: string;
  tx_type: TransactionType;
  amount: number;
  balance_after: number;
  order_id: number | null;
  order_code: string | null;
  note: string | null;
  created_at: string;
}

export interface Account {
  code: string;
  balance: number;
  bank: string;
  transactions: AccountTransaction[];
}
