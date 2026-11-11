import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import type { Role } from '@/api/types'
import { homePath, useAuth } from '@/auth/AuthContext'
import { FullPageSpinner, ProtectedRoute } from '@/auth/ProtectedRoute'
import { ShopLayout, StaffLayout } from '@/components/Layout'
import { PendingApprovalsPage, UsersPage } from '@/pages/admin/AdminPages'
import { ErrorPage, LoginPage, SignUpPage, StaffSignUpPage, WaitingApprovalPage } from '@/pages/auth/AuthPages'
import { AccountPage } from '@/pages/customer/AccountPage'
import { MyOrdersPage } from '@/pages/customer/MyOrdersPage'
import { CartPage, CatalogPage, CheckoutPage, HomePage, ProductDetailsPage, ProfilePage } from '@/pages/customer/ShopPages'
import { CategoriesPage, CustomersPage, ProductsPage, SuppliersPage } from '@/pages/manager/CatalogAdminPages'
import { DashboardPage } from '@/pages/manager/DashboardPage'
import { OrdersPage } from '@/pages/manager/OrdersPage'
import { ReportsPage, RestockPage } from '@/pages/manager/ReportsPages'
import {
  AdminPerformancePage,
  LeaderboardPage,
  MyPerformancePage,
  TeamPerformancePage,
} from '@/pages/staff/PerformancePages'
import { MovementHistoryPage, OrdersToShipPage, StockInPage, StockPage } from '@/pages/staff/WarehousePages'

const STAFF: Role[] = ['ADMIN', 'MANAGER', 'WORKER']
const MANAGERS: Role[] = ['ADMIN', 'MANAGER']
const ADMIN: Role[] = ['ADMIN']

const only = (roles: Role[], page: ReactNode) => <ProtectedRoute roles={roles}>{page}</ProtectedRoute>

/** The shop is the start page for visitors and customers; staff go straight to their workspace. */
function ShopHome() {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (user && user.role !== 'CUSTOMER') return <Navigate to={homePath(user.role)} replace />
  return <HomePage />
}

function RoleRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  return <Navigate to={user ? homePath(user.role) : '/login'} replace />
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/staff-signup" element={<StaffSignUpPage />} />
      <Route path="/waiting" element={<WaitingApprovalPage />} />
      <Route path="/403" element={<ErrorPage code={403} />} />
      <Route path="/app" element={<RoleRedirect />} />

      {/* Shop: visitors can browse, customers order */}
      <Route element={<ShopLayout />}>
        <Route index element={<ShopHome />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/catalog/:id" element={<ProductDetailsPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={only(['CUSTOMER'], <CheckoutPage />)} />
        <Route path="/my-orders" element={only(['CUSTOMER'], <MyOrdersPage />)} />
        <Route path="/profile" element={only(['CUSTOMER'], <ProfilePage />)} />
        <Route path="/account" element={only(['CUSTOMER'], <AccountPage />)} />
      </Route>

      {/* Warehouse app: Admin / Manager / Worker */}
      <Route element={only(STAFF, <StaffLayout />)}>
        <Route path="/performance" element={<MyPerformancePage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/stock" element={<StockPage />} />
        <Route path="/stock-in" element={<StockInPage />} />
        <Route path="/to-ship" element={<OrdersToShipPage />} />
        <Route path="/history" element={<MovementHistoryPage />} />

        <Route path="/dashboard" element={only(MANAGERS, <DashboardPage />)} />
        <Route path="/team" element={only(['MANAGER'], <TeamPerformancePage />)} />
        <Route path="/orders" element={only(MANAGERS, <OrdersPage />)} />
        <Route path="/products" element={only(MANAGERS, <ProductsPage />)} />
        <Route path="/categories" element={only(MANAGERS, <CategoriesPage />)} />
        <Route path="/suppliers" element={only(MANAGERS, <SuppliersPage />)} />
        <Route path="/customers" element={only(MANAGERS, <CustomersPage />)} />
        <Route path="/restock" element={only(MANAGERS, <RestockPage />)} />
        <Route path="/reports" element={only(MANAGERS, <ReportsPage />)} />

        <Route path="/admin/performance" element={only(ADMIN, <AdminPerformancePage />)} />
        <Route path="/admin/teams/:managerId" element={only(ADMIN, <TeamPerformancePage />)} />
        <Route path="/admin/approvals" element={only(ADMIN, <PendingApprovalsPage />)} />
        <Route path="/admin/users" element={only(ADMIN, <UsersPage />)} />
      </Route>

      <Route path="*" element={<ErrorPage code={404} />} />
    </Routes>
  )
}
