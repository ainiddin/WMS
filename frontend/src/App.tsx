import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { FullPageSpinner, ProtectedRoute } from "@/auth/ProtectedRoute";
import { ShopLayout } from "@/components/Layout";
import { ErrorPage, JoinPage, LoginPage, SignUpPage } from "@/pages/auth/AuthPages";
import { AccountPage } from "@/pages/customer/AccountPage";
import { MyOrdersPage } from "@/pages/customer/MyOrdersPage";
import {
  CartPage,
  CatalogPage,
  CheckoutPage,
  HomePage,
  ProductDetailsPage,
  ProfilePage,
} from "@/pages/customer/ShopPages";

/**
 * The website: the customer shop, the Admin panel (/admin) and the Manager panel (/manage). Admins and Managers
 * sign in at /staff/login and confirm on their work phone. Workers use only the KeyFive Staff Android app.
 */
// The Admin panel is loaded only when someone opens /admin: shop visitors never download it.
const AdminLayout = lazy(() => import("@/pages/admin/AdminLayout").then((m) => ({ default: m.AdminLayout })));
const StaffLoginPage = lazy(() => import("@/pages/admin/AdminLoginPage").then((m) => ({ default: m.StaffLoginPage })));
const AuditPage = lazy(() => import("@/pages/admin/AuditPage").then((m) => ({ default: m.AuditPage })));
const PaymentsPage = lazy(() => import("@/pages/admin/PaymentsPage").then((m) => ({ default: m.PaymentsPage })));
const DevicesPage = lazy(() => import("@/pages/admin/DevicesPage").then((m) => ({ default: m.DevicesPage })));
const PasswordPage = lazy(() => import("@/pages/admin/PasswordPage").then((m) => ({ default: m.PasswordPage })));
const AdminPerformancePage = lazy(() =>
  import("@/pages/admin/PerformancePages").then((m) => ({ default: m.AdminPerformancePage })),
);
const TeamPerformancePage = lazy(() =>
  import("@/pages/admin/PerformancePages").then((m) => ({ default: m.TeamPerformancePage })),
);
const InvitationsPage = lazy(() => import("@/pages/admin/InvitationsPage").then((m) => ({ default: m.InvitationsPage })));
const UsersPage = lazy(() => import("@/pages/admin/UsersPages").then((m) => ({ default: m.UsersPage })));

const ManagerLayout = lazy(() => import("@/pages/admin/AdminLayout").then((m) => ({ default: m.ManagerLayout })));
const DashboardPage = lazy(() => import("@/pages/manager/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const OrdersPage = lazy(() => import("@/pages/manager/OrdersPage").then((m) => ({ default: m.OrdersPage })));
const RestockPage = lazy(() => import("@/pages/manager/ReportsPages").then((m) => ({ default: m.RestockPage })));
const StockInPage = lazy(() => import("@/pages/manager/StockInPage").then((m) => ({ default: m.StockInPage })));
const ShipPage = lazy(() => import("@/pages/manager/ShipPage").then((m) => ({ default: m.ShipPage })));
const ReportsPage = lazy(() => import("@/pages/manager/ReportsPages").then((m) => ({ default: m.ReportsPage })));
const ProductsPage = lazy(() => import("@/pages/manager/CatalogAdminPages").then((m) => ({ default: m.ProductsPage })));
const CategoriesPage = lazy(() => import("@/pages/manager/CatalogAdminPages").then((m) => ({ default: m.CategoriesPage })));
const SuppliersPage = lazy(() => import("@/pages/manager/CatalogAdminPages").then((m) => ({ default: m.SuppliersPage })));
const CustomersPage = lazy(() => import("@/pages/manager/CatalogAdminPages").then((m) => ({ default: m.CustomersPage })));
const TeamPage = lazy(() => import("@/pages/manager/TeamPages").then((m) => ({ default: m.TeamPage })));
const ManagerInvitationsPage = lazy(() => import("@/pages/manager/TeamPages").then((m) => ({ default: m.ManagerInvitationsPage })));

const admin = (page: React.ReactNode) => <Suspense fallback={<FullPageSpinner />}>{page}</Suspense>;

const customer = (page: React.ReactNode) => (
  <ProtectedRoute roles={["CUSTOMER"]}>{page}</ProtectedRoute>
);

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/join/:token" element={<JoinPage />} />
      <Route path="/403" element={<ErrorPage code={403} />} />

      {/* Shop: visitors can browse, customers order */}
      <Route element={<ShopLayout />}>
        <Route index element={<HomePage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/catalog/:id" element={<ProductDetailsPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={customer(<CheckoutPage />)} />
        <Route path="/my-orders" element={customer(<MyOrdersPage />)} />
        <Route path="/profile" element={customer(<ProfilePage />)} />
        <Route path="/account" element={customer(<AccountPage />)} />
      </Route>

      {/* Admin panel: its own sign in with the email code */}
      <Route path="/staff/login" element={admin(<StaffLoginPage />)} />
      <Route path="/admin/login" element={<Navigate to="/staff/login" replace />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={["ADMIN"]} loginPath="/staff/login">
            {admin(<AdminLayout />)}
          </ProtectedRoute>
        }
      >
        <Route index element={admin(<UsersPage />)} />
        <Route path="invitations" element={admin(<InvitationsPage />)} />
        <Route path="devices" element={admin(<DevicesPage />)} />
        <Route path="performance" element={admin(<AdminPerformancePage />)} />
        <Route path="teams/:managerId" element={admin(<TeamPerformancePage />)} />
        <Route path="payments" element={admin(<PaymentsPage />)} />
        <Route path="audit" element={admin(<AuditPage />)} />
        <Route path="password" element={admin(<PasswordPage />)} />
      </Route>

      {/* Manager panel: signed in with the password, confirmed on his work phone */}
      <Route
        path="/manage"
        element={
          <ProtectedRoute roles={["MANAGER"]} loginPath="/staff/login">
            {admin(<ManagerLayout />)}
          </ProtectedRoute>
        }
      >
        <Route index element={admin(<DashboardPage />)} />
        <Route path="orders" element={admin(<OrdersPage />)} />
        <Route path="ship" element={admin(<ShipPage />)} />
        <Route path="stock-in" element={admin(<StockInPage />)} />
        <Route path="restock" element={admin(<RestockPage />)} />
        <Route path="reports" element={admin(<ReportsPage />)} />
        <Route path="products" element={admin(<ProductsPage />)} />
        <Route path="categories" element={admin(<CategoriesPage />)} />
        <Route path="suppliers" element={admin(<SuppliersPage />)} />
        <Route path="customers" element={admin(<CustomersPage />)} />
        <Route path="team" element={admin(<TeamPage />)} />
        <Route path="invitations" element={admin(<ManagerInvitationsPage />)} />
        <Route path="performance" element={admin(<TeamPerformancePage />)} />
        <Route path="password" element={admin(<PasswordPage />)} />
      </Route>

      <Route path="*" element={<ErrorPage code={404} />} />
    </Routes>
  );
}
