import { api } from "./client";
import type {
  Account,
  Category,
  Customer,
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
