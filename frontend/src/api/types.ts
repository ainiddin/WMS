// Types of the FastAPI responses (see backend/app/schemas): the shop and the Admin panel.
// Manager / Worker types live in the Android app.

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
  /** Admins only: change the password before this moment. */
  password_expires_at: string | null;
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

// ---- Admin (website Admin panel) ----
export type Period = "week" | "month" | "quarter" | "year";

/** Answer of an Admin sign in after the right password: the code is in the corporate mailbox. */
export interface TwoFactorRequired {
  two_factor_required: true;
  challenge_token: string;
  sent_to: string;
  code_seconds: number;
  resend_seconds: number;
  expires_at: string;
}

export interface Employee {
  id: number;
  code: string;
  user_id: number;
  full_name: string;
  role: Role;
  phone: string | null;
  manager_id: number | null;
  team_name: string;
  is_active: boolean;
}

export interface AdminUser {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  requested_role: Role | null;
  created_at: string;
  approved_at: string | null;
  employee: Employee | null;
  login_failures: number;
  login_locked_seconds: number;
}

export type DeviceStatus = "PENDING" | "APPROVED" | "REVOKED";

export interface StaffDevice {
  id: number;
  device_name: string;
  status: DeviceStatus;
  created_at: string;
  approved_at: string | null;
  last_seen_at: string | null;
  user_id: number;
  user_email: string;
  user_full_name: string;
  user_role: Role;
  current: boolean;
}

export type AuditAction =
  | "USER_APPROVED"
  | "USER_REJECTED"
  | "USER_BLOCKED"
  | "USER_UNBLOCKED"
  | "ROLE_CHANGED"
  | "TEAM_CHANGED"
  | "LOGIN_TIMER_CLEARED"
  | "DEVICE_APPROVED"
  | "DEVICE_REVOKED"
  | "TWO_FACTOR_CODE_SENT"
  | "TWO_FACTOR_FAILED"
  | "TWO_FACTOR_PASSED"
  | "PASSWORD_CHANGED"
  | "INVITE_SENT"
  | "INVITE_RESENT"
  | "INVITE_REVOKED"
  | "INVITE_ACCEPTED"
  | "INVITE_CODE_FAILED";

export interface AuditRow {
  id: number;
  created_at: string;
  action: AuditAction;
  actor_id: number | null;
  actor_email: string | null;
  target_user_id: number | null;
  target_email: string | null;
  ip: string | null;
  details: Record<string, unknown>;
}

export interface Metrics {
  employee_id: number;
  code: string;
  full_name: string;
  role: Role;
  manager_id: number | null;
  is_active: boolean;
  orders_approved: number;
  orders_rejected: number;
  avg_approval_hours: number | null;
  orders_shipped: number;
  units_shipped: number;
  stock_in_count: number;
  units_in: number;
  points: number;
  rank?: number;
}

export interface TeamSummary {
  manager_id: number;
  manager_code: string;
  manager_name: string;
  team_name: string;
  members: number;
  orders_shipped: number;
  orders_approved: number;
  stock_in_count: number;
  units_shipped: number;
  points: number;
  rank: number;
}

export interface TimelinePoint {
  date: string;
  orders_shipped: number;
  orders_approved: number;
  stock_in_count: number;
  units_shipped: number;
  points: number;
}

interface PeriodInfo {
  period: Period;
  start: string;
  end: string;
  bucket: "day" | "week" | "month";
}

export interface TeamPerformance extends PeriodInfo {
  team: TeamSummary | null;
  manager: Metrics;
  workers: Metrics[];
  timeline: TimelinePoint[];
}

export interface AllPerformance extends PeriodInfo {
  totals: Pick<TeamSummary, "orders_shipped" | "orders_approved" | "stock_in_count" | "units_shipped" | "points">;
  teams: TeamSummary[];
  timeline: TimelinePoint[];
}

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export interface Invitation {
  id: number;
  email: string;
  full_name: string;
  role: "WORKER" | "MANAGER";
  status: InvitationStatus;
  team_manager_id: number | null;
  team_name: string | null;
  invited_by_id: number;
  invited_by_email: string;
  created_at: string;
  code_sent_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}
