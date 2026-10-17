import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/api";

function AdminDashboard() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingOrder, setUpdatingOrder] = useState(null);

  // CREATE CASHIER STATE
  const [cashierForm, setCashierForm] = useState({
    full_name: "",
    username: "",
    password: "",
  });

  const [creatingCashier, setCreatingCashier] = useState(false);
  const [cashierMessage, setCashierMessage] = useState("");
  const [cashierError, setCashierError] = useState("");
  const [showCashierPassword, setShowCashierPassword] =
    useState(false);

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("admin");

    navigate("/admin-login", { replace: true });
  };

  const handleAuthError = (error) => {
    if (error.response?.status === 401) {
      handleLogout();
      return true;
    }

    return false;
  };

  // ============================================================
  // LOAD DASHBOARD DATA
  // ============================================================

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError("");

      const [ordersResponse, productsResponse] =
        await Promise.all([
          api.get("/admin/orders"),
          api.get("/products"),
        ]);

      setOrders(ordersResponse.data);
      setProducts(productsResponse.data);
    } catch (error) {
      console.error(error);

      if (handleAuthError(error)) {
        return;
      }

      setError("Could not load dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  // ============================================================
  // CREATE CASHIER ACCOUNT
  // POST /api/cashier/create
  // ============================================================

  const handleCashierInputChange = (event) => {
    const { name, value } = event.target;

    setCashierForm((current) => ({
      ...current,
      [name]: value,
    }));

    // Clear old feedback when the administrator edits the form.
    setCashierMessage("");
    setCashierError("");
  };

  const handleCreateCashier = async (event) => {
    event.preventDefault();

    setCashierMessage("");
    setCashierError("");

    const fullName = cashierForm.full_name.trim();
    const username = cashierForm.username.trim();
    const password = cashierForm.password;

    if (!fullName || !username || !password) {
      setCashierError("Please complete all cashier account fields.");
      return;
    }

    if (password.length < 12) {
      setCashierError(
        "The password must contain at least 12 characters."
      );
      return;
    }

    try {
      setCreatingCashier(true);

      const response = await api.post("/cashier/create", {
        full_name: fullName,
        username,
        password,
      });

      setCashierMessage(
        response.data?.message ||
          "Cashier account created successfully."
      );

      setCashierForm({
        full_name: "",
        username: "",
        password: "",
      });

      setShowCashierPassword(false);
    } catch (error) {
      console.error("Cashier creation failed:", error);

      if (handleAuthError(error)) {
        return;
      }

      setCashierError(
        error.response?.data?.message ||
          "Could not create the cashier account. Please try again."
      );
    } finally {
      setCreatingCashier(false);
    }
  };

  // ============================================================
  // UPDATE ORDER STATUS
  // ============================================================

  const updateStatus = async (orderId, newStatus) => {
    try {
      setUpdatingOrder(orderId);

      const response = await api.put(
        `/admin/orders/${orderId}/status`,
        {
          status: newStatus,
        }
      );

      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === orderId
            ? response.data.order
            : order
        )
      );
    } catch (error) {
      console.error(error);

      if (handleAuthError(error)) {
        return;
      }

      alert(
        error.response?.data?.message ||
          "Could not update order status."
      );
    } finally {
      setUpdatingOrder(null);
    }
  };

  // ============================================================
  // ORDER STATUS STYLING
  // ============================================================

  const getStatusClass = (status) => {
    switch (status) {
      case "completed":
        return "bg-success";

      case "confirmed":
        return "bg-primary";

      case "ready":
        return "bg-info text-dark";

      case "cancelled":
        return "bg-danger";

      default:
        return "bg-warning text-dark";
    }
  };

  // ============================================================
  // ORDER STATISTICS
  // ============================================================

  const pendingOrders = orders.filter(
    (order) => order.status === "pending"
  ).length;

  const completedOrders = orders.filter(
    (order) => order.status === "completed"
  ).length;

  const totalRevenue = orders
    .filter((order) => order.status !== "cancelled")
    .reduce(
      (total, order) => total + Number(order.total || 0),
      0
    );

  // ============================================================
  // PRODUCT / INVENTORY STATISTICS
  // ============================================================

  const totalProducts = products.length;

  const lowStockProducts = products.filter(
    (product) =>
      Number(product.stock) > 0 &&
      Number(product.stock) <= 10
  ).length;

  const outOfStockProducts = products.filter(
    (product) => Number(product.stock) === 0
  ).length;

  // ============================================================
  // DASHBOARD UI
  // ============================================================

  return (
    <div className="container-fluid py-4">
      {/* HEADER */}
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
        <div>
          <span className="text-success fw-semibold">
            ADMIN DASHBOARD
          </span>

     

          <p className="text-secondary mb-0">
            Manage products, inventory, customer orders and cashier
            accounts.
          </p>
        </div>

        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-outline-success"
            onClick={loadDashboard}
            disabled={loading}
          >
            <i className="bi bi-arrow-clockwise me-2"></i>
            Refresh
          </button>

          <button
            type="button"
            className="btn btn-outline-danger"
            onClick={handleLogout}
          >
            <i className="bi bi-box-arrow-right me-2"></i>
            Logout
          </button>
        </div>
      </div>

      {/* DASHBOARD ERROR */}
      {error && (
        <div className="alert alert-danger" role="alert">
          <i className="bi bi-exclamation-triangle me-2"></i>
          {error}
        </div>
      )}

      {/* ====================================================== */}
      {/* CREATE CASHIER ACCOUNT */}
      {/* ====================================================== */}

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white border-0 pt-4 px-4">
          <div className="d-flex align-items-center gap-3">
            <div
              className="rounded-circle bg-success bg-opacity-10 text-success d-flex align-items-center justify-content-center"
              style={{
                width: "52px",
                height: "52px",
                flexShrink: 0,
              }}
            >
              <i className="bi bi-person-plus fs-3"></i>
            </div>

            <div>
              <h4 className="fw-bold mb-1">
                Create Cashier Account
              </h4>

              <p className="text-secondary mb-0">
                Register an employee who will process in-store sales.
              </p>
            </div>
          </div>
        </div>

        <div className="card-body p-4">
          {cashierMessage && (
            <div
              className="alert alert-success d-flex align-items-start"
              role="status"
            >
              <i className="bi bi-check-circle-fill me-2 mt-1"></i>
              <div>{cashierMessage}</div>
            </div>
          )}

          {cashierError && (
            <div className="alert alert-danger" role="alert">
              <i className="bi bi-exclamation-triangle-fill me-2"></i>
              {cashierError}
            </div>
          )}

          <form onSubmit={handleCreateCashier}>
            <div className="row g-3">
              {/* FULL NAME */}
              <div className="col-md-4">
                <label
                  htmlFor="cashier-full-name"
                  className="form-label fw-semibold"
                >
                  Cashier Full Name
                </label>

                <input
                  id="cashier-full-name"
                  type="text"
                  name="full_name"
                  className="form-control"
                  placeholder="e.g. Jane Wanjiku"
                  value={cashierForm.full_name}
                  onChange={handleCashierInputChange}
                  maxLength={150}
                  autoComplete="name"
                  disabled={creatingCashier}
                  required
                />
              </div>

              {/* USERNAME */}
              <div className="col-md-4">
                <label
                  htmlFor="cashier-username"
                  className="form-label fw-semibold"
                >
                  Username
                </label>

                <input
                  id="cashier-username"
                  type="text"
                  name="username"
                  className="form-control"
                  placeholder="e.g. jane.cashier"
                  value={cashierForm.username}
                  onChange={handleCashierInputChange}
                  maxLength={80}
                  autoComplete="off"
                  disabled={creatingCashier}
                  required
                />

                <small className="text-secondary">
                  Must be unique.
                </small>
              </div>

              {/* PASSWORD */}
              <div className="col-md-4">
                <label
                  htmlFor="cashier-password"
                  className="form-label fw-semibold"
                >
                  Initial Password
                </label>

                <div className="input-group">
                  <input
                    id="cashier-password"
                    type={
                      showCashierPassword ? "text" : "password"
                    }
                    name="password"
                    className="form-control"
                    placeholder="At least 12 characters"
                    value={cashierForm.password}
                    onChange={handleCashierInputChange}
                    minLength={12}
                    autoComplete="new-password"
                    disabled={creatingCashier}
                    required
                  />

                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() =>
                      setShowCashierPassword((current) => !current)
                    }
                    aria-label={
                      showCashierPassword
                        ? "Hide password"
                        : "Show password"
                    }
                    title={
                      showCashierPassword
                        ? "Hide password"
                        : "Show password"
                    }
                    disabled={creatingCashier}
                  >
                    <i
                      className={
                        showCashierPassword
                          ? "bi bi-eye-slash"
                          : "bi bi-eye"
                      }
                    ></i>
                  </button>
                </div>

                <small className="text-secondary">
                  Use a strong, unique password.
                </small>
              </div>

              {/* SUBMIT */}
              <div className="col-12 d-flex flex-wrap align-items-center gap-3 mt-4">
                <button
                  type="submit"
                  className="btn btn-success px-4"
                  disabled={creatingCashier}
                >
                  {creatingCashier ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm me-2"
                        aria-hidden="true"
                      ></span>
                      Creating Account...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-person-plus me-2"></i>
                      Create Cashier
                    </>
                  )}
                </button>

                <span className="small text-secondary">
                  Only an authenticated administrator can create cashier
                  accounts.
                </span>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* ====================================================== */}
      {/* BUSINESS STATISTICS */}
      {/* ====================================================== */}

      <div className="row g-4 mb-4">
        {/* PRODUCTS */}
        <div className="col-md-6 col-xl-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div>
                  <small className="text-secondary">
                    Products
                  </small>

                  <h2 className="fw-bold mt-2 mb-0">
                    {totalProducts}
                  </h2>
                </div>

                <i className="bi bi-box-seam fs-2 text-primary"></i>
              </div>

              <Link
                to="/admin/products"
                className="small text-decoration-none"
              >
                Manage products →
              </Link>
            </div>
          </div>
        </div>

        {/* LOW STOCK */}
        <div className="col-md-6 col-xl-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div>
                  <small className="text-secondary">
                    Low Stock
                  </small>

                  <h2 className="fw-bold mt-2 mb-0">
                    {lowStockProducts}
                  </h2>
                </div>

                <i className="bi bi-exclamation-triangle fs-2 text-warning"></i>
              </div>

              <Link
                to="/admin/inventory"
                className="small text-decoration-none"
              >
                View inventory →
              </Link>
            </div>
          </div>
        </div>

        {/* OUT OF STOCK */}
        <div className="col-md-6 col-xl-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div>
                  <small className="text-secondary">
                    Out of Stock
                  </small>

                  <h2 className="fw-bold mt-2 mb-0">
                    {outOfStockProducts}
                  </h2>
                </div>

                <i className="bi bi-x-circle fs-2 text-danger"></i>
              </div>

              <Link
                to="/admin/inventory"
                className="small text-decoration-none"
              >
                Check stock →
              </Link>
            </div>
          </div>
        </div>

        {/* TOTAL ORDERS */}
        <div className="col-md-6 col-xl-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div>
                  <small className="text-secondary">
                    Total Orders
                  </small>

                  <h2 className="fw-bold mt-2 mb-0">
                    {orders.length}
                  </h2>
                </div>

                <i className="bi bi-cart-check fs-2 text-success"></i>
              </div>

              <span className="small text-secondary">
                All customer orders
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ====================================================== */}
      {/* ORDER STATISTICS */}
      {/* ====================================================== */}

      <div className="row g-4 mb-4">
        {/* PENDING */}
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div>
                  <small className="text-secondary">
                    Pending Orders
                  </small>

                  <h3 className="fw-bold mt-2 mb-0">
                    {pendingOrders}
                  </h3>
                </div>

                <i className="bi bi-clock-history fs-2 text-warning"></i>
              </div>
            </div>
          </div>
        </div>

        {/* COMPLETED */}
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div>
                  <small className="text-secondary">
                    Completed Orders
                  </small>

                  <h3 className="fw-bold mt-2 mb-0">
                    {completedOrders}
                  </h3>
                </div>

                <i className="bi bi-check-circle fs-2 text-success"></i>
              </div>
            </div>
          </div>
        </div>

        {/* ORDER VALUE */}
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div>
                  <small className="text-secondary">
                    Order Value
                  </small>

                  <h3 className="fw-bold mt-2 mb-0">
                    KSh {totalRevenue.toLocaleString()}
                  </h3>
                </div>

                <i className="bi bi-cash-stack fs-2 text-success"></i>
              </div>

              <small className="text-secondary">
                Excluding cancelled orders
              </small>
            </div>
          </div>
        </div>
      </div>

      {/* ====================================================== */}
      {/* RECENT ORDERS */}
      {/* ====================================================== */}

      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <div className="mb-4">
            <h4 className="fw-bold mb-1">
              Recent Orders
            </h4>

            <p className="text-secondary mb-0">
              Manage customer orders from here.
            </p>
          </div>

          {/* LOADING */}
          {loading && (
            <div className="text-center py-5">
              <div
                className="spinner-border text-success"
                role="status"
                aria-label="Loading dashboard"
              ></div>

              <p className="mt-3 text-secondary">
                Loading dashboard...
              </p>
            </div>
          )}

          {/* EMPTY */}
          {!loading && !error && orders.length === 0 && (
            <div className="text-center py-5">
              <i className="bi bi-inbox display-4 text-secondary"></i>

              <h5 className="mt-3">
                No orders yet
              </h5>

              <p className="text-secondary">
                Customer orders will appear here.
              </p>
            </div>
          )}

          {/* TABLE */}
          {!loading && !error && orders.length > 0 && (
            <div className="table-responsive">
              <table className="table align-middle">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Type</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Change Status</th>
                    <th>Date</th>
                  </tr>
                </thead>

                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      {/* ORDER */}
                      <td>
                        <Link
                          to={`/admin/orders/${order.id}`}
                          className="text-success fw-bold text-decoration-none"
                        >
                          {order.order_number}
                        </Link>
                      </td>

                      {/* CUSTOMER */}
                      <td>
                        <strong>
                          {order.customer?.name || "Unknown"}
                        </strong>

                        <small className="d-block text-secondary">
                          {order.customer?.phone || "No phone"}
                        </small>
                      </td>

                      {/* ITEMS */}
                      <td>{order.items?.length || 0}</td>

                      {/* TYPE */}
                      <td>
                        <span className="text-capitalize">
                          {order.order_type || "—"}
                        </span>
                      </td>

                      {/* TOTAL */}
                      <td>
                        <strong>
                          KSh{" "}
                          {Number(order.total || 0).toLocaleString()}
                        </strong>
                      </td>

                      {/* STATUS */}
                      <td>
                        <span
                          className={`badge ${getStatusClass(
                            order.status
                          )}`}
                        >
                          {order.status}
                        </span>
                      </td>

                      {/* CHANGE STATUS */}
                      <td>
                        <select
                          className="form-select form-select-sm"
                          value={order.status}
                          disabled={updatingOrder === order.id}
                          onChange={(event) =>
                            updateStatus(
                              order.id,
                              event.target.value
                            )
                          }
                        >
                          <option value="pending">
                            Pending
                          </option>

                          <option value="confirmed">
                            Confirmed
                          </option>

                          <option value="ready">
                            Ready
                          </option>

                          <option value="completed">
                            Completed
                          </option>

                          <option value="cancelled">
                            Cancelled
                          </option>
                        </select>

                        {updatingOrder === order.id && (
                          <small className="text-secondary">
                            Updating...
                          </small>
                        )}
                      </td>

                      {/* DATE */}
                      <td>
                        <small>
                          {order.created_at
                            ? new Date(
                                order.created_at
                              ).toLocaleDateString()
                            : "—"}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;

