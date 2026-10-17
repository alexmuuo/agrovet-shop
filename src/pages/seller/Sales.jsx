import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../api/api";

const PAGE_SIZE = 10;

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const normalizeStatus = (value) =>
  String(value || "unknown").trim().toLowerCase();

const getCustomerName = (order) => {
  const customer = order.customer;

  if (!customer) return "Walk-in / Unknown";

  return (
    customer.full_name ||
    customer.name ||
    customer.username ||
    customer.email ||
    "Walk-in / Unknown"
  );
};

const getCashierName = (order) => {
  const notes = String(order.notes || "");

  const match = notes.match(/Cashier sale processed by (.+?) \(ID:/i);

  return match ? match[1] : "Website / Admin";
};

const getPaymentLabel = (method) => {
  const value = String(method || "unknown").toLowerCase();

  if (value === "mpesa" || value === "m-pesa") return "M-Pesa";
  if (value === "cash") return "Cash";

  return value.charAt(0).toUpperCase() + value.slice(1);
};

const getStatusClass = (status) => {
  const value = normalizeStatus(status);

  if (["paid", "completed", "confirmed", "successful"].includes(value)) {
    return "bg-success-subtle text-success";
  }

  if (["pending", "unpaid", "processing"].includes(value)) {
    return "bg-warning-subtle text-warning-emphasis";
  }

  if (["failed", "cancelled", "canceled", "rejected"].includes(value)) {
    return "bg-danger-subtle text-danger";
  }

  return "bg-secondary-subtle text-secondary";
};

function StatusBadge({ status }) {
  return (
    <span
      className={`badge rounded-pill px-3 py-2 ${getStatusClass(status)}`}
    >
      {String(status || "Unknown")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())}
    </span>
  );
}

function Sales() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const fetchOrders = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      // Reuse the existing administrator orders endpoint.
      const response = await api.get("/admin/orders");

      const data = response.data;

      const orderList = Array.isArray(data)
        ? data
        : Array.isArray(data?.orders)
        ? data.orders
        : Array.isArray(data?.items)
        ? data.items
        : null;

      if (!orderList) {
        throw new Error(
          "The orders API returned an unexpected response."
        );
      }

      setOrders(orderList);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          "Unable to load sales."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();

    return orders.filter((order) => {
      const orderNumber = String(order.order_number || "").toLowerCase();
      const customerName = getCustomerName(order).toLowerCase();
      const cashierName = getCashierName(order).toLowerCase();
      const paymentMethod = String(
        order.payment_method || ""
      ).toLowerCase();

      const paymentStatus = normalizeStatus(order.payment_status);
      const orderStatus = normalizeStatus(order.status);

      const matchesSearch =
        !term ||
        orderNumber.includes(term) ||
        customerName.includes(term) ||
        cashierName.includes(term) ||
        paymentMethod.includes(term);

      const matchesPayment =
        paymentFilter === "all" ||
        paymentStatus === paymentFilter;

      const matchesStatus =
        statusFilter === "all" ||
        orderStatus === statusFilter;

      const orderDate = order.created_at
        ? new Date(order.created_at)
        : null;

      let matchesFromDate = true;
      let matchesToDate = true;

      if (dateFrom) {
        matchesFromDate =
          orderDate &&
          !Number.isNaN(orderDate.getTime()) &&
          orderDate >= new Date(`${dateFrom}T00:00:00`);
      }

      if (dateTo) {
        matchesToDate =
          orderDate &&
          !Number.isNaN(orderDate.getTime()) &&
          orderDate <= new Date(`${dateTo}T23:59:59.999`);
      }

      return (
        matchesSearch &&
        matchesPayment &&
        matchesStatus &&
        matchesFromDate &&
        matchesToDate
      );
    });
  }, [
    orders,
    search,
    paymentFilter,
    statusFilter,
    dateFrom,
    dateTo,
  ]);

  // Only paid, non-cancelled orders count toward confirmed revenue.
  const confirmedOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          normalizeStatus(order.payment_status) === "paid" &&
          !["cancelled", "canceled"].includes(
            normalizeStatus(order.status)
          )
      ),
    [orders]
  );

  const totalRevenue = confirmedOrders.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0
  );

  const pendingOrders = orders.filter(
    (order) =>
      ["pending", "unpaid"].includes(
        normalizeStatus(order.payment_status)
      ) &&
      !["cancelled", "canceled"].includes(
        normalizeStatus(order.status)
      )
  ).length;

  const cancelledOrders = orders.filter((order) =>
    ["cancelled", "canceled"].includes(normalizeStatus(order.status))
  ).length;

  const totalFilteredValue = filteredOrders.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0
  );

  const totalPages = Math.max(
    1,
    Math.ceil(filteredOrders.length / PAGE_SIZE)
  );

  const safePage = Math.min(currentPage, totalPages);

  const paginatedOrders = filteredOrders.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const resetFilters = () => {
    setSearch("");
    setPaymentFilter("all");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setCurrentPage(1);
  };

  const handleSearchChange = (value) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const handlePaymentChange = (value) => {
    setPaymentFilter(value);
    setCurrentPage(1);
  };

  const handleStatusChange = (value) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handleDateFromChange = (value) => {
    setDateFrom(value);
    setCurrentPage(1);
  };

  const handleDateToChange = (value) => {
    setDateTo(value);
    setCurrentPage(1);
  };

  return (
    <div className="container-fluid px-3 px-md-4 py-4">
      {/* PAGE HEADER */}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <h1 className="fw-bold mb-1">Sales Management</h1>
          <p className="text-secondary mb-0">
            View and monitor transactions recorded by your business.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-success"
          onClick={() => fetchOrders(true)}
          disabled={loading || refreshing}
        >
          {refreshing ? "Refreshing..." : "↻ Refresh Sales"}
        </button>
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <div
          className="alert alert-danger d-flex flex-wrap justify-content-between align-items-center gap-2"
          role="alert"
        >
          <span>{error}</span>

          <button
            type="button"
            className="btn btn-outline-danger btn-sm"
            onClick={() => fetchOrders()}
          >
            Try Again
          </button>
        </div>
      )}

      {/* SUMMARY CARDS */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <p className="text-secondary small mb-2">
                Confirmed Revenue
              </p>
              <h3 className="fw-bold text-success mb-1">
                {formatCurrency(totalRevenue)}
              </h3>
              <small className="text-secondary">
                Paid, non-cancelled orders
              </small>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <p className="text-secondary small mb-2">
                Total Transactions
              </p>
              <h3 className="fw-bold mb-1">{orders.length}</h3>
              <small className="text-secondary">
                All recorded orders
              </small>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <p className="text-secondary small mb-2">
                Awaiting Payment
              </p>
              <h3 className="fw-bold text-warning mb-1">
                {pendingOrders}
              </h3>
              <small className="text-secondary">
                Includes pending M-Pesa transactions
              </small>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <p className="text-secondary small mb-2">
                Cancelled Orders
              </p>
              <h3 className="fw-bold text-danger mb-1">
                {cancelledOrders}
              </h3>
              <small className="text-secondary">
                Retained in transaction history
              </small>
            </div>
          </div>
        </div>
      </div>

      {/* SALES TABLE */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white border-0 pt-4 px-3 px-md-4">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <div>
              <h5 className="fw-bold mb-1">Transaction History</h5>
              <p className="small text-secondary mb-0">
                {filteredOrders.length} matching transactions
              </p>
            </div>

            <div className="text-md-end">
              <small className="text-secondary d-block">
                Value of filtered orders
              </small>
              <strong>{formatCurrency(totalFilteredValue)}</strong>
            </div>
          </div>

          {/* FILTERS */}
          <div className="row g-3 pb-3">
            <div className="col-12 col-lg-4">
              <label className="form-label small fw-semibold">
                Search transactions
              </label>
              <input
                type="search"
                className="form-control"
                placeholder="Order number, customer, cashier..."
                value={search}
                onChange={(event) =>
                  handleSearchChange(event.target.value)
                }
              />
            </div>

            <div className="col-6 col-lg-2">
              <label className="form-label small fw-semibold">
                Payment status
              </label>
              <select
                className="form-select"
                value={paymentFilter}
                onChange={(event) =>
                  handlePaymentChange(event.target.value)
                }
              >
                <option value="all">All payments</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div className="col-6 col-lg-2">
              <label className="form-label small fw-semibold">
                Order status
              </label>
              <select
                className="form-select"
                value={statusFilter}
                onChange={(event) =>
                  handleStatusChange(event.target.value)
                }
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div className="col-6 col-lg-2">
              <label className="form-label small fw-semibold">
                From date
              </label>
              <input
                type="date"
                className="form-control"
                value={dateFrom}
                onChange={(event) =>
                  handleDateFromChange(event.target.value)
                }
              />
            </div>

            <div className="col-6 col-lg-2">
              <label className="form-label small fw-semibold">
                To date
              </label>
              <input
                type="date"
                className="form-control"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) =>
                  handleDateToChange(event.target.value)
                }
              />
            </div>

            <div className="col-12 d-flex justify-content-end">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={resetFilters}
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div
                className="spinner-border text-success"
                role="status"
                aria-label="Loading sales"
              />
              <p className="text-secondary mt-3 mb-0">
                Loading transaction history...
              </p>
            </div>
          ) : paginatedOrders.length === 0 ? (
            <div className="text-center py-5 px-3">
              <div className="display-6 mb-2">🧾</div>
              <h5>No transactions found</h5>
              <p className="text-secondary mb-3">
                Try changing your search or filters.
              </p>
              <button
                type="button"
                className="btn btn-outline-success"
                onClick={resetFilters}
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="px-3 px-md-4 py-3">Order</th>
                    <th className="py-3">Date</th>
                    <th className="py-3">Customer</th>
                    <th className="py-3">Cashier / Source</th>
                    <th className="py-3">Payment</th>
                    <th className="py-3">Order Status</th>
                    <th className="py-3 text-end">Total</th>
                    <th className="px-3 px-md-4 py-3 text-end">
                      Details
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-3 px-md-4">
                        <strong>{order.order_number || `#${order.id}`}</strong>
                      </td>

                      <td className="text-nowrap small">
                        {formatDate(order.created_at)}
                      </td>

                      <td>
                        <span className="d-block">
                          {getCustomerName(order)}
                        </span>
                        {order.customer?.phone && (
                          <small className="text-secondary">
                            {order.customer.phone}
                          </small>
                        )}
                      </td>

                      <td>{getCashierName(order)}</td>

                      <td>
                        <div className="mb-1">
                          {getPaymentLabel(order.payment_method)}
                        </div>
                        <StatusBadge status={order.payment_status} />
                      </td>

                      <td>
                        <StatusBadge status={order.status} />
                      </td>

                      <td className="text-end text-nowrap fw-semibold">
                        {formatCurrency(order.total)}
                      </td>

                      <td className="px-3 px-md-4 text-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success"
                          onClick={() => setSelectedOrder(order)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* PAGINATION */}
        {!loading && filteredOrders.length > 0 && (
          <div className="card-footer bg-white d-flex flex-wrap justify-content-between align-items-center gap-3 px-3 px-md-4 py-3">
            <small className="text-secondary">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filteredOrders.length)} of{" "}
              {filteredOrders.length}
            </small>

            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={safePage <= 1}
                onClick={() =>
                  setCurrentPage((page) => Math.max(1, page - 1))
                }
              >
                Previous
              </button>

              <span className="small">
                Page {safePage} of {totalPages}
              </span>

              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={safePage >= totalPages}
                onClick={() =>
                  setCurrentPage((page) =>
                    Math.min(totalPages, page + 1)
                  )
                }
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TRANSACTION DETAILS MODAL */}
      {selectedOrder && (
        <div
          className="modal d-block"
          tabIndex="-1"
          role="dialog"
          aria-modal="true"
          aria-labelledby="salesDetailsTitle"
          style={{ background: "rgba(0, 0, 0, 0.5)", zIndex: 1055 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedOrder(null);
            }
          }}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
            <div className="modal-content border-0 shadow">
              <div className="modal-header">
                <div>
                  <h5
                    className="modal-title fw-bold"
                    id="salesDetailsTitle"
                  >
                    Transaction Details
                  </h5>
                  <small className="text-secondary">
                    {selectedOrder.order_number || `Order #${selectedOrder.id}`}
                  </small>
                </div>

                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setSelectedOrder(null)}
                />
              </div>

              <div className="modal-body">
                <div className="row g-3 mb-4">
                  <div className="col-12 col-md-6">
                    <div className="border rounded p-3 h-100">
                      <small className="text-secondary d-block mb-1">
                        Customer
                      </small>
                      <strong>{getCustomerName(selectedOrder)}</strong>

                      {selectedOrder.customer?.phone && (
                        <div className="small text-secondary mt-1">
                          {selectedOrder.customer.phone}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="col-12 col-md-6">
                    <div className="border rounded p-3 h-100">
                      <small className="text-secondary d-block mb-1">
                        Cashier / Source
                      </small>
                      <strong>{getCashierName(selectedOrder)}</strong>
                    </div>
                  </div>

                  <div className="col-12 col-md-6">
                    <div className="border rounded p-3 h-100">
                      <small className="text-secondary d-block mb-1">
                        Transaction date
                      </small>
                      <strong>{formatDate(selectedOrder.created_at)}</strong>
                    </div>
                  </div>

                  <div className="col-12 col-md-6">
                    <div className="border rounded p-3 h-100">
                      <small className="text-secondary d-block mb-1">
                        Payment method
                      </small>
                      <strong>
                        {getPaymentLabel(selectedOrder.payment_method)}
                      </strong>
                      <div className="mt-2">
                        <StatusBadge status={selectedOrder.payment_status} />
                      </div>
                    </div>
                  </div>
                </div>

                <h6 className="fw-bold mb-3">Items Sold</h6>

                {Array.isArray(selectedOrder.items) &&
                selectedOrder.items.length > 0 ? (
                  <div className="table-responsive">
                    <table className="table table-sm align-middle">
                      <thead className="table-light">
                        <tr>
                          <th>Product</th>
                          <th className="text-center">Qty</th>
                          <th className="text-end">Unit Price</th>
                          <th className="text-end">Subtotal</th>
                        </tr>
                      </thead>

                      <tbody>
                        {selectedOrder.items.map((item, index) => (
                          <tr key={item.id || `${item.product_id}-${index}`}>
                            <td>{item.product_name || "Product"}</td>
                            <td className="text-center">{item.quantity}</td>
                            <td className="text-end text-nowrap">
                              {formatCurrency(item.price)}
                            </td>
                            <td className="text-end text-nowrap">
                              {formatCurrency(
                                item.subtotal ??
                                  Number(item.price || 0) *
                                    Number(item.quantity || 0)
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-secondary">
                    No item details are available for this order.
                  </p>
                )}

                <div className="border-top pt-3 mt-3">
                  <div className="d-flex justify-content-between align-items-center gap-3">
                    <span className="fw-semibold">Order Total</span>
                    <h5 className="fw-bold text-success mb-0">
                      {formatCurrency(selectedOrder.total)}
                    </h5>
                  </div>
                </div>

                <div className="mt-3">
                  <small className="text-secondary d-block mb-1">
                    Order status
                  </small>
                  <StatusBadge status={selectedOrder.status} />
                </div>

                {selectedOrder.notes && (
                  <div className="mt-3">
                    <small className="text-secondary d-block mb-1">
                      Notes
                    </small>
                    <p className="mb-0 text-break">
                      {selectedOrder.notes}
                    </p>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSelectedOrder(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Sales;