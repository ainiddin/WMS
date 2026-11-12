import { Route, Routes } from "react-router";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
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
 * The website is the customer shop only. Admin / Manager / Worker screens live in the KeyFive Staff
 * Android app (mobile/); the API refuses staff sign in here, so a leaked staff password is useless on the site.
 */
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

      <Route path="*" element={<ErrorPage code={404} />} />
    </Routes>
  );
}
