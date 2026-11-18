import { api } from "./client";
import type {
  Account,
  AdminUser,
  AllPerformance,
  AuditAction,
  AuditRow,
  Category,
  Customer,
  DeviceStatus,
  Employee,
  Invitation,
  InvitationStatus,
  Period,
  Role,
  StaffDevice,
  TeamPerformance,
  TwoFactorRequired,
  WebLoginStarted,
  WebLoginState,
  UserStatus,
  Order,
  OrderStatus,
  ProductPublic,
  StockCheck,
  TokenPair,
  User,
} from "./types";

const get = <T>(url: string, params?: object) =>
  api.get<T>(url, { params }).then((r) => r.data);
const post = <T>(url: string, body?: unknown) =>
  api.post<T>(url, body).then((r) => r.data);
const patch = <T>(url: string, body: unknown) =>
  api.patch<T>(url, body).then((r) => r.data);

// ---- Auth ----
export const authApi = {
  login: (email: string, password: string) => {
    // OAuth2 password form, as FastAPI's OAuth2PasswordRequestForm expects.
    const form = new URLSearchParams({ username: email, password });
    return post<TokenPair>("/auth/login/", form);
  },
  /** Step 1 of sign up: emails a 6-digit code that proves the address exists. */
  sendCode: (email: string) =>
    post<{ detail: string }>("/auth/send-code/", { email }),
  register: (data: {
    email: string;
    code: string;
    password: string;
    full_name: string;
    phone?: string;
    address?: string;
  }) => post<TokenPair>("/auth/register/", data),
  me: () => get<User>("/auth/me/"),
};

// ---- Catalog ----
export interface ProductFilters {
  search?: string;
  category_id?: number;
  min_price?: number;
  max_price?: number;
  in_stock?: boolean;
  sort?: "name" | "price" | "-price";
}

export const catalogApi = {
  categories: () => get<Category[]>("/categories/"),
  products: (filters: ProductFilters = {}) =>
    get<ProductPublic[]>("/products/", filters),
  popular: (limit = 8) => get<ProductPublic[]>("/products/popular/", { limit }),
  product: (id: number) => get<ProductPublic>(`/products/${id}/`),
};

// ---- Customers ----
export const customersApi = {
  me: () => get<Customer>("/customers/me/"),
  updateMe: (
    data: Partial<Pick<Customer, "full_name" | "phone" | "address">>,
  ) => patch<Customer>("/customers/me/", data),
};

// ---- Customer account (simulated bank top-ups) ----
export const accountApi = {
  get: () => get<Account>("/account/"),
  topUp: (amount: number) => post<Account>("/account/top-up/", { amount }),
};

// ---- Orders ----
export const ordersApi = {
  list: (status?: OrderStatus, limit = 200) =>
    get<Order[]>("/orders/", { status, limit }),
  get: (id: number) => get<Order>(`/orders/${id}/`),
  create: (data: {
    items: { product_id: number; quantity: number }[];
    delivery_address?: string;
    comment?: string;
  }) => post<Order>("/orders/", data),
  cancel: (id: number) => post<Order>(`/orders/${id}/cancel/`),
  /** Checkout preview: which items would wait for a delivery and how long. */
  check: (items: { product_id: number; quantity: number }[]) =>
    post<StockCheck>("/orders/check/", { items }),
};

// ---- Staff sign in on the website (Admin, Manager): approved on the phone ----
export const staffAuthApi = {
  webLogin: (email: string, password: string) =>
    post<WebLoginStarted>("/auth/web/login/", { email, password }),
  /** Asked every few seconds while the phone has not answered. */
  status: (request_token: string) => post<WebLoginState>("/auth/web/status/", { request_token }),
  /** Admin without the phone at hand: the code goes to the corporate mailbox instead. */
  emailCode: (request_token: string) =>
    post<TwoFactorRequired>("/auth/web/email-code/", { request_token }),
};

// ---- Admin sign in (password, then the code from the corporate mailbox) ----
export const adminAuthApi = {
  login: (email: string, password: string) =>
    post<TwoFactorRequired>("/auth/admin/login/", { email, password }),
  verify: (challenge_token: string, code: string) =>
    post<TokenPair>("/auth/2fa/verify/", { challenge_token, code }),
  resend: (challenge_token: string) =>
    post<TwoFactorRequired>("/auth/2fa/resend/", { challenge_token }),
  changePassword: (old_password: string, new_password: string) =>
    post<TokenPair>("/auth/password/", { old_password, new_password }),
};

export interface AuditFilters {
  action?: AuditAction;
  user_id?: number;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export const adminApi = {
  users: (filters: { status?: UserStatus; role?: Role; search?: string } = {}) =>
    get<AdminUser[]>("/admin/users/", filters),
  approve: (id: number, role: "MANAGER" | "WORKER", manager_id: number | null) =>
    post<AdminUser>(`/admin/users/${id}/approve/`, { role, manager_id }),
  reject: (id: number) => post<AdminUser>(`/admin/users/${id}/reject/`),
  block: (id: number) => post<AdminUser>(`/admin/users/${id}/block/`),
  unblock: (id: number) => post<AdminUser>(`/admin/users/${id}/unblock/`),
  clearLoginTimer: (id: number) => post<AdminUser>(`/admin/users/${id}/clear-login-timer/`),
  changeRole: (id: number, role: Role, manager_id: number | null) =>
    patch<AdminUser>(`/admin/users/${id}/role/`, { role, manager_id }),
  employees: (filters: { role?: Role; manager_id?: number } = {}) =>
    get<Employee[]>("/admin/employees/", filters),
  changeTeam: (employeeId: number, manager_id: number) =>
    patch<Employee>(`/admin/employees/${employeeId}/team/`, { manager_id }),
  devices: (status?: DeviceStatus) =>
    get<StaffDevice[]>("/admin/devices/", status ? { status } : {}),
  approveDevice: (id: number) => post<StaffDevice>(`/admin/devices/${id}/approve/`),
  revokeDevice: (id: number) => post<StaffDevice>(`/admin/devices/${id}/revoke/`),
  audit: (filters: AuditFilters = {}) => get<AuditRow[]>("/admin/audit/", filters),
  invitations: (status?: InvitationStatus) =>
    get<Invitation[]>("/admin/invitations/", status ? { status } : {}),
  resendInvitation: (id: number) => post<Invitation>(`/admin/invitations/${id}/resend/`),
  revokeInvitation: (id: number) => post<Invitation>(`/admin/invitations/${id}/revoke/`),
  /** Only while there is no active Manager. */
  inviteFirstManager: (email: string, full_name: string) =>
    post<Invitation>("/admin/invitations/", { email, full_name, role: "MANAGER" }),
};

export const performanceApi = {
  all: (period: Period) => get<AllPerformance>("/performance/all/", { period }),
  team: (managerId: number, period: Period) =>
    get<TeamPerformance>(`/performance/team/${managerId}/`, { period }),
};
