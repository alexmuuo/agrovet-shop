import { Navigate, Outlet } from "react-router-dom";

function CashierProtectedRoute() {
  const token = localStorage.getItem("cashierToken");

  if (!token) {
    return <Navigate to="/cashier-login" replace />;
  }

  return <Outlet />;
}

export default CashierProtectedRoute;