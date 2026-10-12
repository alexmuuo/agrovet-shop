import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { STORE_NAME } from "../config/store";
import api from "../api/api";

function AdminNavbar() {
  const navigate = useNavigate();

  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  // =========================================================
  // LOAD ADMIN UNREAD MESSAGE COUNT
  // =========================================================

  useEffect(() => {
    let cancelled = false;

    const loadUnreadMessageCount = async () => {
      // Do not fetch if the admin is logged out.
      const adminToken = localStorage.getItem("adminToken");

      if (!adminToken) {
        setUnreadMessageCount(0);
        return;
      }

      try {
        const response = await api.get(
          "/admin/messages/unread-count"
        );

        if (cancelled) {
          return;
        }

        // Ensure the admin session still exists.
        if (!localStorage.getItem("adminToken")) {
          setUnreadMessageCount(0);
          return;
        }

        setUnreadMessageCount(
          Number(response.data?.unread_count) || 0
        );
      } catch (error) {
        if (!cancelled) {
          console.error(
            "Could not load admin unread message count:",
            error.response?.data || error.message
          );
        }
      }
    };

    loadUnreadMessageCount();

    const interval = setInterval(
      loadUnreadMessageCount,
      3000
    );

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // =========================================================
  // ADMIN LOGOUT
  // =========================================================

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("admin");

    setUnreadMessageCount(0);

    navigate("/admin-login", { replace: true });
  };

  // =========================================================
  // ADMIN NAVBAR UI
  // =========================================================

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark sticky-top">
      <div className="container-fluid px-3 px-lg-4">

        {/* ADMIN BRAND */}

        <Link
          className="navbar-brand fw-bold"
          to="/admin"
        >
          <i className="bi bi-shield-lock me-2"></i>
          {STORE_NAME}{" "}
          <span className="text-warning">Admin</span>
        </Link>

        {/* MOBILE TOGGLE */}

        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#adminNavbar"
          aria-controls="adminNavbar"
          aria-expanded="false"
          aria-label="Toggle admin navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        {/* ADMIN NAVIGATION */}

        <div
          className="collapse navbar-collapse"
          id="adminNavbar"
        >
          <ul className="navbar-nav me-auto mb-2 mb-lg-0">

            {/* DASHBOARD */}

            <li className="nav-item">
              <Link
                className="nav-link"
                to="/admin"
              >
                <i className="bi bi-speedometer2 me-1"></i>
                Dashboard
              </Link>
            </li>

            {/* PRODUCTS */}

            <li className="nav-item">
              <Link
                className="nav-link"
                to="/admin/products"
              >
                <i className="bi bi-box-seam me-1"></i>
                Products
              </Link>
            </li>

            {/* INVENTORY */}

            <li className="nav-item">
              <Link
                className="nav-link"
                to="/admin/inventory"
              >
                <i className="bi bi-clipboard-data me-1"></i>
                Inventory
              </Link>
            </li>

            {/* ORDERS */}

            <li className="nav-item">
              <Link
                className="nav-link"
                to="/admin/orders"
              >
                <i className="bi bi-receipt me-1"></i>
                Orders
              </Link>
            </li>

            {/* DELIVERY MANAGEMENT */}

            <li className="nav-item">
              <Link
                className="nav-link"
                to="/admin/deliveries"
              >
                <i className="bi bi-truck me-1"></i>
                Deliveries
              </Link>
            </li>

            {/* CUSTOMERS */}

            <li className="nav-item">
              <Link
                className="nav-link"
                to="/admin/customers"
              >
                <i className="bi bi-people me-1"></i>
                Customers
              </Link>
            </li>

            {/* REPORTS & ANALYTICS */}

            <li className="nav-item">
              <Link
                className="nav-link"
                to="/admin/reports"
              >
                <i className="bi bi-graph-up-arrow me-1"></i>
                Reports
              </Link>
            </li>

            {/* MESSAGES WITH UNREAD BADGE */}

            <li className="nav-item">
              <Link
                className="nav-link position-relative d-inline-flex align-items-center"
                to="/admin/messages"
                aria-label={
                  unreadMessageCount > 0
                    ? `Messages, ${unreadMessageCount} unread`
                    : "Messages"
                }
              >
                <i className="bi bi-chat-dots me-1"></i>
                Messages

                {unreadMessageCount > 0 && (
                  <span
                    className="badge rounded-pill bg-danger ms-2"
                    style={{
                      fontSize: "0.7rem",
                      minWidth: "20px",
                    }}
                  >
                    {unreadMessageCount > 99
                      ? "99+"
                      : unreadMessageCount}
                  </span>
                )}
              </Link>
            </li>

          </ul>

          {/* ADMIN ACCOUNT */}

          <div className="d-flex align-items-center gap-2">
            <span className="text-light small d-none d-lg-inline">
              <i className="bi bi-person-badge me-1"></i>
              Administrator
            </span>

            <button
              type="button"
              className="btn btn-outline-light btn-sm"
              onClick={handleLogout}
            >
              <i className="bi bi-box-arrow-right me-1"></i>
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default AdminNavbar;

