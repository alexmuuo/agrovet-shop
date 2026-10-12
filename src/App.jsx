import { Routes, Route, useLocation } from "react-router-dom";

// Customer pages
import Home from "./pages/Home";
import Products from "./pages/Products";
import ProductDetails from "./pages/ProductDetails";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import OrderConfirmation from "./pages/OrderConfirmation";
import BackendTest from "./pages/BackendTest";
import AskAgrovet from "./pages/AskAgrovet";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

// Shared components
import Navbar from "./components/Navbar";
import AdminNavbar from "./components/AdminNavbar";

// Admin pages
import AdminDashboard from "./pages/AdminDashboard";
import AdminOrderDetails from "./pages/AdminOrderDetails";
import SellerProducts from "./pages/seller/Products";
import Inventory from "./pages/seller/Inventory";
import SellerOrders from "./pages/seller/Orders";
import Customers from "./pages/seller/Customers";
import Messages from "./pages/seller/Messages";
import Deliveries from "./pages/seller/Deliveries";
import Reports from "./pages/seller/Reports";
import Cashiers from "./pages/seller/Cashiers";
import AdminLogin from "./pages/AdminLogin";

// Cashier pages
import CashierLogin from "./pages/cashier/CashierLogin";
import CashierPOS from "./pages/cashier/CashierPOS";
import SalesHistory from "./pages/cashier/SalesHistory";

// Route protection
import AdminProtectedRoute from "./components/AdminProtectedRoute";
import CashierProtectedRoute from "./components/CashierProtectedRoute";

function App() {
const location = useLocation();
const pathname = location.pathname;

const isAdminLogin = pathname === "/admin-login";
const isCashierLogin = pathname === "/cashier-login";

const isAdminPage =
pathname === "/admin" ||
pathname.startsWith("/admin/");

// Covers POS, Sales History, and future cashier routes.
const isCashierPage = pathname.startsWith("/cashier/");

const hasAdminToken = Boolean(
localStorage.getItem("adminToken")
);

// Each role gets its own navigation interface.
const showAdminNavbar =
isAdminPage && hasAdminToken && !isAdminLogin;

const showCustomerNavbar =
!isAdminLogin &&
!isCashierLogin &&
!isAdminPage &&
!isCashierPage;

return (
<>
{showAdminNavbar ? ( <AdminNavbar />
) : showCustomerNavbar ? ( <Navbar />
) : null}


  <Routes>
    {/* Customer routes */}
    <Route path="/" element={<Home />} />

    <Route path="/products" element={<Products />} />

    <Route
      path="/products/:id"
      element={<ProductDetails />}
    />

    <Route path="/cart" element={<Cart />} />

    <Route path="/checkout" element={<Checkout />} />

    <Route
      path="/order-confirmation"
      element={<OrderConfirmation />}
    />

    <Route
      path="/backend-test"
      element={<BackendTest />}
    />

    <Route
      path="/ask-agrovet"
      element={<AskAgrovet />}
    />

    {/* Customer authentication */}
    <Route path="/login" element={<Login />} />

    <Route path="/register" element={<Register />} />

    <Route
      path="/forgot-password"
      element={<ForgotPassword />}
    />

    <Route
      path="/reset-password"
      element={<ResetPassword />}
    />

    {/* Admin login */}
    <Route
      path="/admin-login"
      element={<AdminLogin />}
    />

    {/* Protected admin routes */}
    <Route element={<AdminProtectedRoute />}>
      <Route
        path="/admin"
        element={<AdminDashboard />}
      />

      <Route
        path="/admin/orders/:id"
        element={<AdminOrderDetails />}
      />

      <Route
        path="/admin/products"
        element={<SellerProducts />}
      />

      <Route
        path="/admin/inventory"
        element={<Inventory />}
      />

      <Route
        path="/admin/orders"
        element={<SellerOrders />}
      />

      <Route
        path="/admin/customers"
        element={<Customers />}
      />

      <Route
        path="/admin/messages"
        element={<Messages />}
      />

      <Route
        path="/admin/deliveries"
        element={<Deliveries />}
      />

      <Route
        path="/admin/reports"
        element={<Reports />}
      />

      <Route
        path="/admin/cashiers"
        element={<Cashiers />}
      />
    </Route>

    {/* Cashier login */}
    <Route
      path="/cashier-login"
      element={<CashierLogin />}
    />

    {/* Protected cashier routes */}
    <Route element={<CashierProtectedRoute />}>
      <Route
        path="/cashier/pos"
        element={<CashierPOS />}
      />

      <Route
        path="/cashier/sales-history"
        element={<SalesHistory />}
      />
    </Route>
  </Routes>
</>


);
}

export default App;
