import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { FullPageSpinner, ProtectedRoute } from "@/auth/ProtectedRoute";
import { ShopLayout } from "@/components/Layout";
import { ErrorPage, LoginPage, SignUpPage } from "@/pages/auth/AuthPages";
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
 * The website is the customer shop plus the Admin panel (/admin, password + code from the corporate mailbox).
 * Manager / Worker screens live in the KeyFive Staff Android app (mobile/); the API refuses their sign in here.
 */
// The Admin panel is loaded only when someone opens /admin: shop visitors never download it.
const AdminLayout = lazy(() => import("@/pages/admin/AdminLayout").then((m) => ({ default: m.AdminLayout })));
const StaffLoginPage = lazy(() => import("@/pages/admin/AdminLoginPage").then((m) => ({ default: m.StaffLoginPage })));
const AuditPage = lazy(() => import("@/pages/admin/AuditPage").then((m) => ({ default: m.AuditPage })));
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
        <Route path="audit" element={admin(<AuditPage />)} />
        <Route path="password" element={admin(<PasswordPage />)} />
      </Route>

      <Route path="*" element={<ErrorPage code={404} />} />
    </Routes>
  );
}
