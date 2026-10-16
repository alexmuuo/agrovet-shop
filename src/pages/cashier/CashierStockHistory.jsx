import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const API_BASE = "http://127.0.0.1:5000/api";

function formatDate(value) {
if (!value) return "—";

const date = new Date(value);

if (Number.isNaN(date.getTime())) return value;

return date.toLocaleString("en-KE", {
dateStyle: "medium",
timeStyle: "short",
});
}

export default function CashierStockHistory() {
const [movements, setMovements] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");
const [offset, setOffset] = useState(0);
const [total, setTotal] = useState(0);

const limit = 50;

const fetchHistory = useCallback(async () => {
const token = localStorage.getItem("cashierToken");


if (!token) {
  setError("Your cashier session has expired. Please log in again.");
  setLoading(false);
  return;
}

setLoading(true);
setError("");

try {
  const response = await axios.get(
    `${API_BASE}/cashier/stock/history`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        limit,
        offset,
      },
    }
  );

  const data = response.data;

  // Support either a direct array or a paginated response.
  const records = Array.isArray(data)
    ? data
    : data.movements ??
      data.stock_movements ??
      data.records ??
      data.items ??
      [];

  setMovements(records);
  setTotal(
    Number.isFinite(Number(data.total))
      ? Number(data.total)
      : records.length
  );
} catch (err) {
  console.error("Failed to load stock history:", err);

  if (err.response?.status === 401 || err.response?.status === 403) {
    setError(
      "Your cashier session is invalid or expired. Please log in again."
    );
  } else {
    setError(
      err.response?.data?.message ||
        err.response?.data?.error ||
        "Could not load stock history. Check that the backend is running."
    );
  }
} finally {
  setLoading(false);
}


}, [offset]);

useEffect(() => {
fetchHistory();
}, [fetchHistory]);

const currentPage = Math.floor(offset / limit) + 1;
const totalPages = Math.max(1, Math.ceil(total / limit));

const totalUnitsAdded = movements.reduce(
(sum, movement) => sum + (Number(movement.quantity_added) || 0),
0
);

return ( <div className="container py-4"> <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4"> <div> <h2 className="mb-1">My Stock History</h2> <p className="text-muted mb-0">
Review the stock you have added to the inventory. </p> </div>

    <div className="d-flex gap-2">
      <a href="/cashier/stock" className="btn btn-outline-success">
        Add Stock
      </a>

      <button
        type="button"
        className="btn btn-outline-secondary"
        onClick={fetchHistory}
        disabled={loading}
      >
        {loading ? "Refreshing..." : "Refresh"}
      </button>
    </div>
  </div>

  {error && (
    <div className="alert alert-danger" role="alert">
      <strong>Unable to load history.</strong>
      <div>{error}</div>
    </div>
  )}

  <div className="row g-3 mb-4">
    <div className="col-12 col-md-6">
      <div className="card border-0 shadow-sm h-100">
        <div className="card-body">
          <div className="text-muted small">Recorded Restock Entries</div>
          <div className="fs-3 fw-bold">{total}</div>
        </div>
      </div>
    </div>

    <div className="col-12 col-md-6">
      <div className="card border-0 shadow-sm h-100">
        <div className="card-body">
          <div className="text-muted small">
            Units Added on This Page
          </div>
          <div className="fs-3 fw-bold">{totalUnitsAdded}</div>
        </div>
      </div>
    </div>
  </div>

  <div className="card border-0 shadow-sm">
    <div className="card-header bg-white py-3">
      <h5 className="mb-0">Stock Movement Records</h5>
    </div>

    <div className="card-body p-0">
      {loading ? (
        <div className="text-center py-5">
          <div
            className="spinner-border text-success"
            role="status"
            aria-label="Loading"
          />
          <p className="text-muted mt-3 mb-0">
            Loading your stock history...
          </p>
        </div>
      ) : movements.length === 0 ? (
        <div className="text-center py-5 px-3">
          <h5>No stock entries yet</h5>
          <p className="text-muted">
            When you add stock, your recorded movements will appear here.
          </p>
          <a href="/cashier/stock" className="btn btn-success">
            Add Stock
          </a>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Date</th>
                <th>Product</th>
                <th>Previous Stock</th>
                <th>Quantity Added</th>
                <th>New Stock</th>
                <th>Reference</th>
                <th>Notes</th>
              </tr>
            </thead>

            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td className="text-nowrap">
                    {formatDate(movement.created_at)}
                  </td>

                  <td>
                    <div className="fw-semibold">
                      {movement.product_name || "Unknown product"}
                    </div>
                    <small className="text-muted">
                      Product ID: {movement.product_id ?? "—"}
                    </small>
                  </td>

                  <td>{movement.previous_stock ?? "—"}</td>

                  <td>
                    <span className="badge text-bg-success">
                      +{movement.quantity_added ?? 0}
                    </span>
                  </td>

                  <td className="fw-semibold">
                    {movement.new_stock ?? "—"}
                  </td>

                  <td>{movement.reference || "—"}</td>

                  <td
                    style={{
                      minWidth: "180px",
                      maxWidth: "280px",
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {movement.notes || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    {!loading && movements.length > 0 && (
      <div className="card-footer bg-white d-flex flex-wrap justify-content-between align-items-center gap-2">
        <small className="text-muted">
          Showing {offset + 1}–
          {offset + movements.length} of {total} entries
        </small>

        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            disabled={offset === 0 || loading}
            onClick={() => setOffset((previous) => Math.max(0, previous - limit))}
          >
            Previous
          </button>

          <span className="small text-muted">
            Page {currentPage} of {totalPages}
          </span>

          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            disabled={
              loading ||
              movements.length < limit ||
              offset + movements.length >= total
            }
            onClick={() => setOffset((previous) => previous + limit)}
          >
            Next
          </button>
        </div>
      </div>
    )}
  </div>

  <div className="alert alert-info mt-4 mb-0">
    <strong>Accountability note:</strong> This page displays stock
    movements recorded for your cashier account. These records are intended
    to provide an audit trail, not to edit the product's stock directly.
  </div>
</div>


);
}
