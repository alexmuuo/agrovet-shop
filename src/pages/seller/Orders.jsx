import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/api";

function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [updatingOrder, setUpdatingOrder] = useState(null);
  const [payingOrder, setPayingOrder] = useState(null);

  // ==========================================================
  // LOAD ORDERS
  // ==========================================================

  const loadOrders = async () => {
    try {
      setLoading(true);

      const response = await api.get("/admin/orders");

      const receivedOrders = Array.isArray(response.data)
        ? response.data
        : response.data?.orders;

      if (!Array.isArray(receivedOrders)) {
        throw new Error("The server returned an invalid orders response.");
      }

      setOrders(receivedOrders);
      setError("");
    } catch (error) {
      console.error("Error loading orders:", error);

      setError(
        error.response?.data?.message ||
          "Could not load orders. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  // ==========================================================
  // UPDATE ORDER STATUS
  // ==========================================================

  const updateStatus = async (orderId, newStatus) => {
    const currentOrder = orders.find(
      (order) => order.id === orderId
    );

    if (!currentOrder || currentOrder.status === newStatus) {
      return;
    }

    const confirmed = window.confirm(
      `Change order #${
        currentOrder.order_number || orderId
      } status to "${newStatus}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setUpdatingOrder(orderId);

      const response = await api.put(
        `/admin/orders/${orderId}/status`,
        {
          status: newStatus,
        }
      );

      const updatedOrder = response.data?.order;

      if (!updatedOrder) {
        throw new Error(
          "The server did not return the updated order."
        );
      }

      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === orderId
            ? {
                ...order,
                ...updatedOrder,
              }
            : order
        )
      );
    } catch (error) {
      console.error("Error updating order status:", error);

      alert(
        error.response?.data?.message ||
          error.message ||
          "Could not update order status."
      );

      // Restore the current server state if the request failed.
      await loadOrders();
    } finally {
      setUpdatingOrder(null);
    }
  };

  // ==========================================================
  // PAYMENT STATUS HELPERS
  // ==========================================================

  const getPaymentStatus = (order) => {
    return String(order.payment_status || "unpaid")
      .trim()
      .toLowerCase();
  };

  const getPaymentMethod = (order) => {
    return String(order.payment_method || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "");
  };

  const getOrderType = (order) => {
    return String(order.order_type || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "");
  };

  const isElectronicPaymentMethod = (method) => {
    const electronicMethods = [
      "mpesa",
      "mobilemoney",
      "mobilepayment",
      "card",
      "creditcard",
      "debitcard",
      "online",
      "onlinepayment",
      "bank",
      "banktransfer",
      "eft",
    ];

    return electronicMethods.includes(method);
  };

  // ==========================================================
  // MANUAL PAYMENT ELIGIBILITY
  // ==========================================================

  const isEligibleForManualPayment = (order) => {
    const method = getPaymentMethod(order);
    const orderType = getOrderType(order);
    const paymentStatus = getPaymentStatus(order);
    const orderStatus = String(order.status || "")
      .trim()
      .toLowerCase();

    const isCash = method === "cash";
    const isPickup = orderType === "pickup";

    // Electronic payments must be verified through their
    // proper payment-confirmation process.
    if (isElectronicPaymentMethod(method)) {
      return false;
    }

    // Manual confirmation is restricted to cash orders
    // and eligible pickup orders.
    const isEligibleMethod = isCash || isPickup;

    return (
      isEligibleMethod &&
      paymentStatus !== "paid" &&
      orderStatus !== "cancelled"
    );
  };

  // ==========================================================
  // MARK ORDER AS PAID
  // ==========================================================

  const markAsPaid = async (order) => {
    if (!isEligibleForManualPayment(order)) {
      alert(
        "This order is not eligible for manual payment confirmation."
      );
      return;
    }

    const amount = Number(order.total);

    if (!Number.isFinite(amount) || amount <= 0) {
      alert(
        "The order total is invalid. Please check the order before confirming payment."
      );
      return;
    }

    const orderNumber = order.order_number || order.id;

    const confirmed = window.confirm(
      `IMPORTANT: Only continue if you have actually received the payment.\n\n` +
        `Order: #${orderNumber}\n` +
        `Amount: KSh ${amount.toLocaleString("en-KE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}\n` +
        `Payment method: ${order.payment_method || "Not specified"}\n\n` +
        `Has this payment actually been received?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setPayingOrder(order.id);

      const response = await api.post(
        `/admin/orders/${order.id}/mark-paid`
      );

      const updatedOrder = response.data?.order;

      if (!updatedOrder) {
        throw new Error(
          "The server did not return the updated order."
        );
      }

      setOrders((currentOrders) =>
        currentOrders.map((currentOrder) =>
          currentOrder.id === order.id
            ? {
                ...currentOrder,
                ...updatedOrder,
              }
            : currentOrder
        )
      );

      alert(
        `Payment for order #${orderNumber} was confirmed successfully.`
      );
    } catch (error) {
      console.error("Error confirming payment:", error);

      const serverMessage = error.response?.data?.message;

      alert(
        serverMessage ||
          error.message ||
          "Could not confirm payment. Please try again."
      );

      // Refresh to reflect the actual server-side payment status.
      await loadOrders();
    } finally {
      setPayingOrder(null);
    }
  };

  // ==========================================================
  // ORDER STATUS STYLING
  // ==========================================================

  const getStatusClass = (status) => {
    switch (
      String(status || "")
        .trim()
        .toLowerCase()
    ) {
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

  // ==========================================================
  // PAYMENT STATUS STYLING
  // ==========================================================

  const getPaymentBadgeClass = (order) => {
    const paymentStatus = getPaymentStatus(order);

    if (paymentStatus === "paid") {
      return "bg-success";
    }

    if (
      paymentStatus === "failed" ||
      paymentStatus === "cancelled"
    ) {
      return "bg-danger";
    }

    if (
      paymentStatus === "processing" ||
      paymentStatus === "pending"
    ) {
      return "bg-info text-dark";
    }

    return "bg-warning text-dark";
  };

  const getPaymentStatusLabel = (order) => {
    const status = getPaymentStatus(order);

    if (status === "paid") {
      return "Paid";
    }

    if (status === "failed") {
      return "Failed";
    }

    if (status === "cancelled") {
      return "Cancelled";
    }

    if (status === "processing") {
      return "Processing";
    }

    if (status === "pending") {
      return "Pending";
    }

    return "Unpaid";
  };

  // ==========================================================
  // DATE FORMATTING
  // ==========================================================

  const formatDate = (date) => {
    if (!date) {
      return "-";
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "-";
    }

    return parsedDate.toLocaleString("en-KE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  // ==========================================================
  // SEARCH AND FILTER
  // ==========================================================

  const filteredOrders = orders.filter((order) => {
    const searchTerm = search.trim().toLowerCase();

    const orderNumber = String(
      order.order_number || ""
    ).toLowerCase();

    const customerName = String(
      order.customer?.name || ""
    ).toLowerCase();

    const customerPhone = String(
      order.customer?.phone || ""
    ).toLowerCase();

    const matchesSearch =
      String(order.id).includes(searchTerm) ||
      orderNumber.includes(searchTerm) ||
      customerName.includes(searchTerm) ||
      customerPhone.includes(searchTerm);

    const matchesStatus =
      statusFilter === "all" ||
      String(order.status || "").toLowerCase() ===
        statusFilter;

    return matchesSearch && matchesStatus;
  });

  // ==========================================================
  // SUMMARY COUNTS
  // ==========================================================

  const pendingCount = orders.filter(
    (order) =>
      String(order.status || "").toLowerCase() === "pending"
  ).length;

  const confirmedCount = orders.filter(
    (order) =>
      String(order.status || "").toLowerCase() === "confirmed"
  ).length;

  const completedCount = orders.filter(
    (order) =>
      String(order.status || "").toLowerCase() === "completed"
  ).length;

  const cancelledCount = orders.filter(
    (order) =>
      String(order.status || "").toLowerCase() === "cancelled"
  ).length;

  const unpaidCount = orders.filter(
    (order) => getPaymentStatus(order) !== "paid"
  ).length;

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="container-fluid py-4">
      {/* HEADER */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4">
        <div>
          <span className="text-success fw-semibold">
            SELLER ORDERS
          </span>

          <h1 className="fw-bold mt-1 mb-1">
            Orders
          </h1>

          <p className="text-secondary mb-0">
            View and manage customer orders and payments.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-outline-success"
          onClick={loadOrders}
          disabled={loading}
        >
          <i className="bi bi-arrow-clockwise me-2"></i>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* SUMMARY CARDS */}
      <div className="row g-3 mb-4">
        <div className="col-md-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <div className="text-secondary small">
                Pending
              </div>

              <div className="fs-3 fw-bold text-warning">
                {pendingCount}
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <div className="text-secondary small">
                Confirmed
              </div>

              <div className="fs-3 fw-bold text-primary">
                {confirmedCount}
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <div className="text-secondary small">
                Completed
              </div>

              <div className="fs-3 fw-bold text-success">
                {completedCount}
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <div className="text-secondary small">
                Cancelled
              </div>

              <div className="fs-3 fw-bold text-danger">
                {cancelledCount}
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <div className="text-secondary small">
                Unpaid Orders
              </div>

              <div className="fs-3 fw-bold text-warning">
                {unpaidCount}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-8">
              <label
                htmlFor="orderSearch"
                className="form-label fw-semibold"
              >
                Search Orders
              </label>

              <div className="input-group">
                <span className="input-group-text">
                  <i className="bi bi-search"></i>
                </span>

                <input
                  id="orderSearch"
                  type="text"
                  className="form-control"
                  placeholder="Search by order number, customer name or phone..."
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                />
              </div>
            </div>

            <div className="col-md-4">
              <label
                htmlFor="orderStatusFilter"
                className="form-label fw-semibold"
              >
                Filter by Status
              </label>

              <select
                id="orderStatusFilter"
                className="form-select"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
              >
                <option value="all">All Orders</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="ready">Ready</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <div
          className="alert alert-danger d-flex justify-content-between align-items-center"
          role="alert"
        >
          <span>{error}</span>

          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={loadOrders}
            disabled={loading}
          >
            Try Again
          </button>
        </div>
      )}

      {/* LOADING */}
      {loading ? (
        <div className="text-center py-5">
          <div
            className="spinner-border text-success"
            role="status"
            aria-label="Loading orders"
          ></div>

          <p className="text-secondary mt-3">
            Loading orders...
          </p>
        </div>
      ) : filteredOrders.length === 0 ? (
        /* EMPTY STATE */
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center py-5">
            <i className="bi bi-inbox fs-1 text-secondary"></i>

            <h5 className="mt-3">
              No orders found
            </h5>

            <p className="text-secondary mb-0">
              Try changing your search or status filter.
            </p>
          </div>
        </div>
      ) : (
        /* ORDERS TABLE */
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white py-3">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
              <h5 className="mb-0 fw-bold">
                Orders
              </h5>

              <span className="text-secondary small">
                Showing {filteredOrders.length} of{" "}
                {orders.length} orders
              </span>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Payment Method</th>
                  <th>Payment Status</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    {/* ORDER */}
                    <td>
                      <div className="fw-semibold">
                        #{order.order_number || order.id}
                      </div>

                      <small className="text-secondary">
                        ID: {order.id}
                      </small>
                    </td>

                    {/* CUSTOMER */}
                    <td>
                      <div className="fw-semibold">
                        {order.customer?.name || "-"}
                      </div>

                      <small className="text-secondary">
                        {order.customer?.phone || "-"}
                      </small>
                    </td>

                    {/* ORDER TYPE */}
                    <td>
                      <span className="text-capitalize">
                        {order.order_type || "-"}
                      </span>
                    </td>

                    {/* PAYMENT METHOD */}
                    <td>
                      <span className="text-capitalize">
                        {order.payment_method || "-"}
                      </span>
                    </td>

                    {/* PAYMENT STATUS */}
                    <td>
                      <span
                        className={`badge ${getPaymentBadgeClass(
                          order
                        )}`}
                      >
                        {getPaymentStatusLabel(order)}
                      </span>
                    </td>

                    {/* TOTAL */}
                    <td>
                      <strong>
                        KSh{" "}
                        {Number(order.total || 0).toLocaleString(
                          "en-KE",
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }
                        )}
                      </strong>
                    </td>

                    {/* ORDER STATUS */}
                    <td>
                      <select
                        className={`form-select form-select-sm ${getStatusClass(
                          order.status
                        )}`}
                        value={order.status || "pending"}
                        disabled={
                          updatingOrder === order.id ||
                          payingOrder === order.id
                        }
                        onChange={(event) =>
                          updateStatus(
                            order.id,
                            event.target.value
                          )
                        }
                        aria-label={`Update status for order ${
                          order.order_number || order.id
                        }`}
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
                        <small className="text-secondary d-block mt-1">
                          Updating...
                        </small>
                      )}
                    </td>

                    {/* DATE */}
                    <td>
                      <small>
                        {formatDate(order.created_at)}
                      </small>
                    </td>

                    {/* ACTIONS */}
                    <td>
                      <div className="d-flex flex-column gap-2">
                        <Link
                          to={`/admin/orders/${order.id}`}
                          className="btn btn-sm btn-outline-success"
                        >
                          <i className="bi bi-eye me-1"></i>
                          View
                        </Link>

                        {isEligibleForManualPayment(order) && (
                          <button
                            type="button"
                            className="btn btn-sm btn-success"
                            disabled={
                              payingOrder === order.id ||
                              updatingOrder === order.id
                            }
                            onClick={() => markAsPaid(order)}
                          >
                            {payingOrder === order.id ? (
                              <>
                                <span
                                  className="spinner-border spinner-border-sm me-1"
                                  role="status"
                                  aria-hidden="true"
                                ></span>

                                Saving...
                              </>
                            ) : (
                              <>
                                <i className="bi bi-cash-coin me-1"></i>
                                Mark as Paid
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default Orders;
