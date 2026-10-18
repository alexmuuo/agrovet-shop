import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

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

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const normalizeStatus = (value) =>
  String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_");

const titleCase = (value) =>
  String(value || "Unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getStatusClass = (status) => {
  const value = normalizeStatus(status);

  if (
    [
      "paid",
      "completed",
      "confirmed",
      "successful",
      "success",
    ].includes(value)
  ) {
    return "bg-success-subtle text-success";
  }

  if (
    [
      "pending",
      "unpaid",
      "processing",
      "awaiting_payment",
    ].includes(value)
  ) {
    return "bg-warning-subtle text-warning-emphasis";
  }

  if (
    [
      "failed",
      "cancelled",
      "canceled",
      "rejected",
    ].includes(value)
  ) {
    return "bg-danger-subtle text-danger";
  }

  return "bg-secondary-subtle text-secondary";
};

const getPaymentLabel = (method) => {
  const value = String(method || "unknown")
    .trim()
    .toLowerCase();

  if (["mpesa", "m-pesa", "m_pesa"].includes(value)) {
    return "M-Pesa";
  }

  if (value === "cash") {
    return "Cash";
  }

  if (value === "card") {
    return "Card";
  }

  return titleCase(value);
};

const getOrderCustomerName = (order) => {
  const customer = order?.customer;

  if (!customer) {
    return "Website customer";
  }

  return (
    customer.full_name ||
    customer.name ||
    customer.username ||
    customer.email ||
    "Website customer"
  );
};

const getPosCashierName = (sale) =>
  sale?.cashier_name ||
  sale?.cashier?.username ||
  sale?.cashier?.name ||
  (sale?.cashier_id
    ? `Cashier #${sale.cashier_id}`
    : "Unknown cashier");

const getPosBranchName = (sale) =>
  sale?.branch_name ||
  sale?.branch?.name ||
  (sale?.branch_id
    ? `Branch #${sale.branch_id}`
    : "Unknown branch");

const getOrderNumber = (order) =>
  order?.order_number || `ORDER-${order?.id ?? "UNKNOWN"}`;

const getSaleNumber = (sale) =>
  sale?.sale_number || `POS-${sale?.id ?? "UNKNOWN"}`;

function StatusBadge({ status }) {
  return (
    <span
      className={`badge rounded-pill px-3 py-2 ${getStatusClass(
        status
      )}`}
    >
      {titleCase(status)}
    </span>
  );
}

function SummaryCard({
  title,
  value,
  description,
  color = "dark",
}) {
  return (
    <div className="col-12 col-sm-6 col-xl-3">
      <div className="card border-0 shadow-sm h-100">
        <div className="card-body">
          <p className="text-secondary small mb-2">
            {title}
          </p>

          <h3 className={`fw-bold text-${color} mb-1`}>
            {value}
          </h3>

          <small className="text-secondary">
            {description}
          </small>
        </div>
      </div>
    </div>
  );
}

function Sales() {
  // ==========================================================
  // VIEW STATE
  // ==========================================================

  const [activeView, setActiveView] = useState("orders");

  // ==========================================================
  // SEPARATE DATA SOURCES
  // ==========================================================

  const [orders, setOrders] = useState([]);
  const [posSales, setPosSales] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // ==========================================================
  // FILTERS
  // ==========================================================

  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");

  const [currentPage, setCurrentPage] = useState(1);

  // ==========================================================
  // DETAILS MODAL
  // ==========================================================

  const [selectedTransaction, setSelectedTransaction] =
    useState(null);

  // ==========================================================
  // FETCH WEBSITE ORDERS ONLY
  // ==========================================================

  const fetchOrders = useCallback(async () => {
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
  }, []);

  // ==========================================================
  // FETCH POS SALES ONLY
  // ==========================================================

  const fetchPosSales = useCallback(async () => {
    const response = await api.get("/admin/pos-sales");

    const data = response.data;

    const salesList = Array.isArray(data)
      ? data
      : Array.isArray(data?.sales)
      ? data.sales
      : Array.isArray(data?.items)
      ? data.items
      : null;

    if (!salesList) {
      throw new Error(
        "The POS sales API returned an unexpected response."
      );
    }

    setPosSales(salesList);
  }, []);

  // ==========================================================
  // FETCH THE ACTIVE VIEW
  // ==========================================================

  const fetchTransactions = useCallback(
    async (showRefresh = false, view = activeView) => {
      try {
        if (showRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        if (view === "orders") {
          await fetchOrders();
        } else {
          await fetchPosSales();
        }
      } catch (err) {
        setError(
          err.response?.data?.message ||
            err.response?.data?.error ||
            err.message ||
            "Unable to load transactions."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeView, fetchOrders, fetchPosSales]
  );

  useEffect(() => {
    fetchTransactions(false, activeView);
  }, [activeView, fetchTransactions]);

  // ==========================================================
  // RESET FILTERS WHEN CHANGING VIEWS
  // ==========================================================

  const changeView = (view) => {
    if (view === activeView) {
      return;
    }

    setActiveView(view);

    setSearch("");
    setPaymentFilter("all");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setBranchFilter("all");
    setCurrentPage(1);
    setSelectedTransaction(null);
  };

  // ==========================================================
  // CURRENT DATASET
  // ==========================================================

  const transactions =
    activeView === "orders" ? orders : posSales;

  // ==========================================================
  // BRANCH OPTIONS — POS SALES ONLY
  // ==========================================================

  const branches = useMemo(() => {
    const branchMap = new Map();

    posSales.forEach((sale) => {
      if (sale.branch_id == null) {
        return;
      }

      branchMap.set(
        String(sale.branch_id),
        getPosBranchName(sale)
      );
    });

    return Array.from(branchMap.entries())
      .map(([id, name]) => ({
        id,
        name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [posSales]);

  // ==========================================================
  // FILTER TRANSACTIONS
  // ==========================================================

  const filteredTransactions = useMemo(() => {
    const term = search.trim().toLowerCase();

    return transactions.filter((transaction) => {
      const isPosSale = activeView === "pos";

      const reference = isPosSale
        ? getSaleNumber(transaction)
        : getOrderNumber(transaction);

      const customerName = isPosSale
        ? "walk-in customer"
        : getOrderCustomerName(transaction).toLowerCase();

      const cashierName = isPosSale
        ? getPosCashierName(transaction).toLowerCase()
        : "";

      const branchName = isPosSale
        ? getPosBranchName(transaction).toLowerCase()
        : "";

      const paymentMethod = String(
        transaction.payment_method || ""
      ).toLowerCase();

      const paymentStatus = normalizeStatus(
        transaction.payment_status
      );

      const transactionStatus = normalizeStatus(
        transaction.status
      );

      const matchesSearch =
        !term ||
        reference.toLowerCase().includes(term) ||
        customerName.includes(term) ||
        cashierName.includes(term) ||
        branchName.includes(term) ||
        paymentMethod.includes(term);

      const matchesPayment =
        paymentFilter === "all" ||
        paymentStatus === paymentFilter;

      const matchesStatus =
        statusFilter === "all" ||
        transactionStatus === statusFilter;

      const transactionDate = transaction.created_at
        ? new Date(transaction.created_at)
        : null;

      let matchesFromDate = true;
      let matchesToDate = true;

      if (dateFrom) {
        matchesFromDate =
          transactionDate &&
          !Number.isNaN(transactionDate.getTime()) &&
          transactionDate >= new Date(`${dateFrom}T00:00:00`);
      }

      if (dateTo) {
        matchesToDate =
          transactionDate &&
          !Number.isNaN(transactionDate.getTime()) &&
          transactionDate <=
            new Date(`${dateTo}T23:59:59.999`);
      }

      const matchesBranch =
        !isPosSale ||
        branchFilter === "all" ||
        String(transaction.branch_id) === branchFilter;

      return (
        matchesSearch &&
        matchesPayment &&
        matchesStatus &&
        matchesFromDate &&
        matchesToDate &&
        matchesBranch
      );
    });
  }, [
    transactions,
    activeView,
    search,
    paymentFilter,
    statusFilter,
    dateFrom,
    dateTo,
    branchFilter,
  ]);

  // ==========================================================
  // SUMMARY VALUES — ACTIVE VIEW ONLY
  // ==========================================================

  const paidTransactions = transactions.filter(
    (transaction) =>
      normalizeStatus(transaction.payment_status) === "paid" &&
      !["cancelled", "canceled"].includes(
        normalizeStatus(transaction.status)
      )
  );

  const confirmedRevenue = paidTransactions.reduce(
    (sum, transaction) =>
      sum + Number(transaction.total || 0),
    0
  );

  const pendingTransactions = transactions.filter(
    (transaction) =>
      ["pending", "unpaid"].includes(
        normalizeStatus(transaction.payment_status)
      ) &&
      !["cancelled", "canceled"].includes(
        normalizeStatus(transaction.status)
      )
  ).length;

  const cancelledTransactions = transactions.filter(
    (transaction) =>
      ["cancelled", "canceled"].includes(
        normalizeStatus(transaction.status)
      )
  ).length;

  const filteredValue = filteredTransactions.reduce(
    (sum, transaction) =>
      sum + Number(transaction.total || 0),
    0
  );

  // ==========================================================
  // PAGINATION
  // ==========================================================

  const totalPages = Math.max(
    1,
    Math.ceil(filteredTransactions.length / PAGE_SIZE)
  );

  const safePage = Math.min(currentPage, totalPages);

  const paginatedTransactions = filteredTransactions.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  // ==========================================================
  // FILTER HANDLERS
  // ==========================================================

  const resetFilters = () => {
    setSearch("");
    setPaymentFilter("all");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setBranchFilter("all");
    setCurrentPage(1);
  };

  const handleFilterChange = (setter, value) => {
    setter(value);
    setCurrentPage(1);
  };

  // ==========================================================
  // TRANSACTION DETAILS
  // ==========================================================

  const getTransactionReference = (transaction) =>
    activeView === "pos"
      ? getSaleNumber(transaction)
      : getOrderNumber(transaction);

  const getTransactionCustomer = (transaction) =>
    activeView === "pos"
      ? "Walk-in Customer"
      : getOrderCustomerName(transaction);

  const getTransactionSource = (transaction) =>
    activeView === "pos"
      ? `${getPosCashierName(transaction)} · ${getPosBranchName(
          transaction
        )}`
      : "Website Order";

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="container-fluid px-3 px-md-4 py-4">
      {/* PAGE HEADER */}

      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <h1 className="fw-bold mb-1">
            Sales Management
          </h1>

          <p className="text-secondary mb-0">
            Manage website orders and cashier POS sales separately.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-success"
          onClick={() => fetchTransactions(true)}
          disabled={loading || refreshing}
        >
          {refreshing ? "Refreshing..." : "↻ Refresh"}
        </button>
      </div>

      {/* SEPARATE ORDERS AND POS SALES TABS */}

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body">
          <div
            className="btn-group flex-wrap"
            role="group"
            aria-label="Transaction type"
          >
            <button
              type="button"
              className={`btn ${
                activeView === "orders"
                  ? "btn-success"
                  : "btn-outline-success"
              }`}
              onClick={() => changeView("orders")}
              aria-pressed={activeView === "orders"}
            >
              Website Orders
              <span className="badge bg-white text-dark ms-2">
                {orders.length}
              </span>
            </button>

            <button
              type="button"
              className={`btn ${
                activeView === "pos"
                  ? "btn-success"
                  : "btn-outline-success"
              }`}
              onClick={() => changeView("pos")}
              aria-pressed={activeView === "pos"}
            >
              POS Sales
              <span className="badge bg-white text-dark ms-2">
                {posSales.length}
              </span>
            </button>
          </div>

          <div className="mt-3 small text-secondary">
            {activeView === "orders"
              ? "Showing website orders only. POS transactions are excluded."
              : "Showing cashier POS transactions only. Website orders are excluded."}
          </div>
        </div>
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
            onClick={() => fetchTransactions()}
          >
            Try Again
          </button>
        </div>
      )}

      {/* SUMMARY CARDS */}

      <div className="row g-3 mb-4">
        <SummaryCard
          title="Confirmed Revenue"
          value={formatCurrency(confirmedRevenue)}
          description="Paid, non-cancelled transactions"
          color="success"
        />

        <SummaryCard
          title={
            activeView === "pos"
              ? "Total POS Sales"
              : "Total Website Orders"
          }
          value={transactions.length}
          description="Transactions in this category"
        />

        <SummaryCard
          title="Awaiting Payment"
          value={pendingTransactions}
          description="Pending or unpaid transactions"
          color="warning"
        />

        <SummaryCard
          title="Cancelled Transactions"
          value={cancelledTransactions}
          description="Retained in transaction history"
          color="danger"
        />
      </div>

      {/* TRANSACTION TABLE */}

      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white border-0 pt-4 px-3 px-md-4">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <div>
              <h5 className="fw-bold mb-1">
                {activeView === "pos"
                  ? "POS Sales History"
                  : "Website Order History"}
              </h5>

              <p className="small text-secondary mb-0">
                {filteredTransactions.length} matching transactions
              </p>
            </div>

            <div className="text-md-end">
              <small className="text-secondary d-block">
                Value of filtered transactions
              </small>

              <strong>{formatCurrency(filteredValue)}</strong>
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
                placeholder={
                  activeView === "pos"
                    ? "Sale number, cashier, branch..."
                    : "Order number, customer..."
                }
                value={search}
                onChange={(event) =>
                  handleFilterChange(
                    setSearch,
                    event.target.value
                  )
                }
              />
            </div>

            {activeView === "pos" && (
              <div className="col-12 col-md-4 col-lg-2">
                <label className="form-label small fw-semibold">
                  Branch
                </label>

                <select
                  className="form-select"
                  value={branchFilter}
                  onChange={(event) =>
                    handleFilterChange(
                      setBranchFilter,
                      event.target.value
                    )
                  }
                >
                  <option value="all">All branches</option>

                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="col-6 col-lg-2">
              <label className="form-label small fw-semibold">
                Payment status
              </label>

              <select
                className="form-select"
                value={paymentFilter}
                onChange={(event) =>
                  handleFilterChange(
                    setPaymentFilter,
                    event.target.value
                  )
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
                Transaction status
              </label>

              <select
                className="form-select"
                value={statusFilter}
                onChange={(event) =>
                  handleFilterChange(
                    setStatusFilter,
                    event.target.value
                  )
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
                  handleFilterChange(
                    setDateFrom,
                    event.target.value
                  )
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
                  handleFilterChange(
                    setDateTo,
                    event.target.value
                  )
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

        {/* TABLE BODY */}

        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div
                className="spinner-border text-success"
                role="status"
                aria-label="Loading transactions"
              />

              <p className="text-secondary mt-3 mb-0">
                Loading{" "}
                {activeView === "pos"
                  ? "POS sales"
                  : "website orders"}
                ...
              </p>
            </div>
          ) : paginatedTransactions.length === 0 ? (
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
                    <th className="px-3 px-md-4 py-3">
                      {activeView === "pos"
                        ? "Sale Number"
                        : "Order Number"}
                    </th>

                    <th className="py-3">Date</th>

                    {activeView === "pos" ? (
                      <>
                        <th className="py-3">Cashier</th>
                        <th className="py-3">Branch</th>
                      </>
                    ) : (
                      <th className="py-3">Customer</th>
                    )}

                    <th className="py-3">Payment</th>
                    <th className="py-3">Status</th>

                    <th className="py-3 text-end">Total</th>

                    <th className="px-3 px-md-4 py-3 text-end">
                      Details
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedTransactions.map((transaction) => (
                    <tr
                      key={`${activeView}-${transaction.id}`}
                    >
                      <td className="px-3 px-md-4">
                        <strong>
                          {activeView === "pos"
                            ? getSaleNumber(transaction)
                            : getOrderNumber(transaction)}
                        </strong>
                      </td>

                      <td className="text-nowrap small">
                        {formatDate(transaction.created_at)}
                      </td>

                      {activeView === "pos" ? (
                        <>
                          <td>
                            {getPosCashierName(transaction)}
                          </td>

                          <td>
                            {getPosBranchName(transaction)}
                          </td>
                        </>
                      ) : (
                        <td>
                          <span className="d-block">
                            {getOrderCustomerName(transaction)}
                          </span>

                          {transaction.customer?.phone && (
                            <small className="text-secondary">
                              {transaction.customer.phone}
                            </small>
                          )}
                        </td>
                      )}

                      <td>
                        <div className="mb-1">
                          {getPaymentLabel(
                            transaction.payment_method
                          )}
                        </div>

                        <StatusBadge
                          status={transaction.payment_status}
                        />
                      </td>

                      <td>
                        <StatusBadge
                          status={transaction.status}
                        />
                      </td>

                      <td className="text-end text-nowrap fw-semibold">
                        {formatCurrency(transaction.total)}
                      </td>

                      <td className="px-3 px-md-4 text-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success"
                          onClick={() =>
                            setSelectedTransaction({
                              type: activeView,
                              transaction,
                            })
                          }
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

        {!loading && filteredTransactions.length > 0 && (
          <div className="card-footer bg-white d-flex flex-wrap justify-content-between align-items-center gap-3 px-3 px-md-4 py-3">
            <small className="text-secondary">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(
                safePage * PAGE_SIZE,
                filteredTransactions.length
              )}{" "}
              of {filteredTransactions.length}
            </small>

            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={safePage <= 1}
                onClick={() =>
                  setCurrentPage((page) =>
                    Math.max(1, page - 1)
                  )
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

      {selectedTransaction && (
        <TransactionDetailsModal
          type={selectedTransaction.type}
          transaction={selectedTransaction.transaction}
          onClose={() => setSelectedTransaction(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// TRANSACTION DETAILS MODAL
// ============================================================

function TransactionDetailsModal({
  type,
  transaction,
  onClose,
}) {
  const isPosSale = type === "pos";

  const reference = isPosSale
    ? getSaleNumber(transaction)
    : getOrderNumber(transaction);

  const customerName = isPosSale
    ? "Walk-in Customer"
    : getOrderCustomerName(transaction);

  const source = isPosSale
    ? `${getPosCashierName(transaction)} · ${getPosBranchName(
        transaction
      )}`
    : "Website Order";

  const items = Array.isArray(transaction.items)
    ? transaction.items
    : [];

  return (
    <div
      className="modal d-block"
      tabIndex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transactionDetailsTitle"
      style={{
        background: "rgba(0, 0, 0, 0.5)",
        zIndex: 1055,
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
        <div className="modal-content border-0 shadow">
          <div className="modal-header">
            <div>
              <h5
                className="modal-title fw-bold"
                id="transactionDetailsTitle"
              >
                {isPosSale
                  ? "POS Sale Details"
                  : "Website Order Details"}
              </h5>

              <small className="text-secondary">
                {reference}
              </small>
            </div>

            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              onClick={onClose}
            />
          </div>

          <div className="modal-body">
            <div className="row g-3 mb-4">
              <div className="col-12 col-md-6">
                <div className="border rounded p-3 h-100">
                  <small className="text-secondary d-block mb-1">
                    {isPosSale ? "Customer Type" : "Customer"}
                  </small>

                  <strong>{customerName}</strong>

                  {!isPosSale &&
                    transaction.customer?.phone && (
                      <div className="small text-secondary mt-1">
                        {transaction.customer.phone}
                      </div>
                    )}
                </div>
              </div>

              <div className="col-12 col-md-6">
                <div className="border rounded p-3 h-100">
                  <small className="text-secondary d-block mb-1">
                    {isPosSale ? "Cashier / Branch" : "Source"}
                  </small>

                  <strong>{source}</strong>
                </div>
              </div>

              <div className="col-12 col-md-6">
                <div className="border rounded p-3 h-100">
                  <small className="text-secondary d-block mb-1">
                    Transaction Date
                  </small>

                  <strong>
                    {formatDate(transaction.created_at)}
                  </strong>
                </div>
              </div>

              <div className="col-12 col-md-6">
                <div className="border rounded p-3 h-100">
                  <small className="text-secondary d-block mb-1">
                    Payment Method
                  </small>

                  <strong>
                    {getPaymentLabel(
                      transaction.payment_method
                    )}
                  </strong>

                  <div className="mt-2">
                    <StatusBadge
                      status={transaction.payment_status}
                    />
                  </div>
                </div>
              </div>
            </div>

            <h6 className="fw-bold mb-3">Items Sold</h6>

            {items.length > 0 ? (
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
                    {items.map((item, index) => {
                      const quantity = Number(
                        item.quantity || 0
                      );

                      const price = Number(item.price || 0);

                      const subtotal =
                        item.subtotal != null
                          ? Number(item.subtotal)
                          : price * quantity;

                      return (
                        <tr
                          key={
                            item.id ||
                            `${item.product_id}-${index}`
                          }
                        >
                          <td>
                            {item.product_name ||
                              item.product?.name ||
                              "Product"}
                          </td>

                          <td className="text-center">
                            {quantity}
                          </td>

                          <td className="text-end text-nowrap">
                            {formatCurrency(price)}
                          </td>

                          <td className="text-end text-nowrap">
                            {formatCurrency(subtotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-secondary">
                No item details are available for this transaction.
              </p>
            )}

            {transaction.notes && (
              <div className="mt-3">
                <small className="text-secondary d-block mb-1">
                  Notes
                </small>

                <p className="mb-0 text-break">
                  {transaction.notes}
                </p>
              </div>
            )}

            <div className="border-top pt-3 mt-3">
              <div className="d-flex justify-content-between align-items-center gap-3">
                <span className="fw-semibold">
                  {isPosSale ? "Sale Total" : "Order Total"}
                </span>

                <h5 className="fw-bold text-success mb-0">
                  {formatCurrency(transaction.total)}
                </h5>
              </div>
            </div>

            <div className="mt-3">
              <small className="text-secondary d-block mb-1">
                Transaction Status
              </small>

              <StatusBadge status={transaction.status} />
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Sales;