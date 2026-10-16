import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../api/api";

const PAGE_SIZE = 20;

function formatDate(value) {
if (!value) return "—";

const date = new Date(value);

if (Number.isNaN(date.getTime())) return "—";

return date.toLocaleString();
}

function getRecords(data) {
if (Array.isArray(data)) return data;

if (!data || typeof data !== "object") return [];

if (Array.isArray(data.movements)) return data.movements;
if (Array.isArray(data.stock_movements)) return data.stock_movements;
if (Array.isArray(data.records)) return data.records;
if (Array.isArray(data.items)) return data.items;

return [];
}

function StockHistory() {
const [records, setRecords] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");
const [search, setSearch] = useState("");
const [cashierFilter, setCashierFilter] = useState("all");
const [startDate, setStartDate] = useState("");
const [endDate, setEndDate] = useState("");
const [page, setPage] = useState(1);

const loadStockHistory = useCallback(async () => {
setLoading(true);
setError("");

try {
  const response = await api.get("/admin/stock-history");
  setRecords(getRecords(response.data));
} catch (err) {
  console.error(
    "Could not load admin stock history:",
    err.response?.data || err.message
  );

  setRecords([]);
  setError(
    err.response?.data?.message ||
      err.response?.data?.error ||
      "Could not load stock history. Please check the backend endpoint and try again."
  );
} finally {
  setLoading(false);
}


}, []);

useEffect(() => {
loadStockHistory();
}, [loadStockHistory]);

const cashiers = useMemo(() => {
const uniqueCashiers = new Map();


records.forEach((record) => {
  if (record.cashier_id == null) return;

  uniqueCashiers.set(
    String(record.cashier_id),
    record.cashier_name || `Cashier #${record.cashier_id}`
  );
});

return Array.from(uniqueCashiers.entries())
  .map(([id, name]) => ({ id, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

}, [records]);

const filteredRecords = useMemo(() => {
const normalizedSearch = search.trim().toLowerCase();

return records.filter((record) => {
  const searchableText = [
    record.product_name,
    record.cashier_name,
    record.reference,
    record.notes,
    record.product_id,
    record.cashier_id,
  ]
    .filter((value) => value != null)
    .join(" ")
    .toLowerCase();

  if (
    normalizedSearch &&
    !searchableText.includes(normalizedSearch)
  ) {
    return false;
  }

  if (
    cashierFilter !== "all" &&
    String(record.cashier_id) !== cashierFilter
  ) {
    return false;
  }

  const recordDate = record.created_at
    ? new Date(record.created_at)
    : null;

  if (startDate) {
    if (
      !recordDate ||
      Number.isNaN(recordDate.getTime()) ||
      recordDate < new Date(`${startDate}T00:00:00`)
    ) {
      return false;
    }
  }

  if (endDate) {
    const inclusiveEnd = new Date(`${endDate}T23:59:59.999`);

    if (
      !recordDate ||
      Number.isNaN(recordDate.getTime()) ||
      recordDate > inclusiveEnd
    ) {
      return false;
    }
  }

  return true;
});


}, [records, search, cashierFilter, startDate, endDate]);

useEffect(() => {
setPage(1);
}, [search, cashierFilter, startDate, endDate]);

const totalPages = Math.max(
1,
Math.ceil(filteredRecords.length / PAGE_SIZE)
);

const safePage = Math.min(page, totalPages);

const paginatedRecords = filteredRecords.slice(
(safePage - 1) * PAGE_SIZE,
safePage * PAGE_SIZE
);

const totalUnitsAdded = filteredRecords.reduce(
(total, record) => total + (Number(record.quantity_added) || 0),
0
);

const clearFilters = () => {
setSearch("");
setCashierFilter("all");
setStartDate("");
setEndDate("");
setPage(1);
};

return ( <div className="container-fluid px-3 px-lg-4 py-4">
{/* PAGE HEADER */} <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4"> <div> <div className="text-secondary small mb-1">
ADMINISTRATION / INVENTORY </div>


      <h2 className="fw-bold mb-1">
        <i className="bi bi-clock-history me-2 text-primary"></i>
        Stock History
      </h2>

      <p className="text-secondary mb-0">
        Audit stock additions and track which cashiers performed them.
      </p>
    </div>

    <button
      type="button"
      className="btn btn-outline-primary"
      onClick={loadStockHistory}
      disabled={loading}
    >
      <i
        className={`bi ${
          loading ? "bi-arrow-repeat" : "bi-arrow-clockwise"
        } me-2`}
      ></i>
      {loading ? "Refreshing..." : "Refresh"}
    </button>
  </div>

  {/* SUMMARY CARDS */}
  <div className="row g-3 mb-4">
    <div className="col-12 col-md-6 col-xl-4">
      <div className="card border-0 shadow-sm h-100">
        <div className="card-body d-flex align-items-center gap-3">
          <div className="rounded-3 bg-primary bg-opacity-10 p-3">
            <i className="bi bi-journal-text fs-3 text-primary"></i>
          </div>

          <div>
            <div className="text-secondary small">
              Matching Stock Records
            </div>
            <div className="fs-3 fw-bold">
              {filteredRecords.length}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="col-12 col-md-6 col-xl-4">
      <div className="card border-0 shadow-sm h-100">
        <div className="card-body d-flex align-items-center gap-3">
          <div className="rounded-3 bg-success bg-opacity-10 p-3">
            <i className="bi bi-boxes fs-3 text-success"></i>
          </div>

          <div>
            <div className="text-secondary small">
              Units Added in Matching Records
            </div>
            <div className="fs-3 fw-bold">
              {totalUnitsAdded.toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="col-12 col-md-6 col-xl-4">
      <div className="card border-0 shadow-sm h-100">
        <div className="card-body d-flex align-items-center gap-3">
          <div className="rounded-3 bg-info bg-opacity-10 p-3">
            <i className="bi bi-person-check fs-3 text-info"></i>
          </div>

          <div>
            <div className="text-secondary small">
              Cashiers in Records
            </div>
            <div className="fs-3 fw-bold">
              {cashiers.length}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  {/* FILTERS */}
  <div className="card border-0 shadow-sm mb-4">
    <div className="card-body">
      <div className="row g-3 align-items-end">
        <div className="col-12 col-lg-4">
          <label
            htmlFor="stockHistorySearch"
            className="form-label fw-semibold"
          >
            Search records
          </label>

          <div className="input-group">
            <span className="input-group-text">
              <i className="bi bi-search"></i>
            </span>

            <input
              id="stockHistorySearch"
              type="search"
              className="form-control"
              placeholder="Product, cashier, reference..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="col-12 col-md-6 col-lg-2">
          <label
            htmlFor="stockHistoryCashier"
            className="form-label fw-semibold"
          >
            Cashier
          </label>

          <select
            id="stockHistoryCashier"
            className="form-select"
            value={cashierFilter}
            onChange={(event) =>
              setCashierFilter(event.target.value)
            }
          >
            <option value="all">All cashiers</option>

            {cashiers.map((cashier) => (
              <option key={cashier.id} value={cashier.id}>
                {cashier.name}
              </option>
            ))}
          </select>
        </div>

        <div className="col-12 col-md-6 col-lg-2">
          <label
            htmlFor="stockHistoryStart"
            className="form-label fw-semibold"
          >
            From date
          </label>

          <input
            id="stockHistoryStart"
            type="date"
            className="form-control"
            value={startDate}
            max={endDate || undefined}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>

        <div className="col-12 col-md-6 col-lg-2">
          <label
            htmlFor="stockHistoryEnd"
            className="form-label fw-semibold"
          >
            To date
          </label>

          <input
            id="stockHistoryEnd"
            type="date"
            className="form-control"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>

        <div className="col-12 col-md-6 col-lg-2">
          <button
            type="button"
            className="btn btn-light border w-100"
            onClick={clearFilters}
          >
            <i className="bi bi-x-circle me-2"></i>
            Clear filters
          </button>
        </div>
      </div>
    </div>
  </div>

  {/* ERROR */}
  {error && (
    <div
      className="alert alert-danger d-flex flex-wrap justify-content-between align-items-center gap-2"
      role="alert"
    >
      <div>
        <i className="bi bi-exclamation-triangle me-2"></i>
        {error}
      </div>

      <button
        type="button"
        className="btn btn-sm btn-outline-danger"
        onClick={loadStockHistory}
      >
        Try again
      </button>
    </div>
  )}

  {/* STOCK HISTORY TABLE */}
  <div className="card border-0 shadow-sm">
    <div className="card-header bg-white border-0 py-3">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <h5 className="fw-bold mb-0">Stock Movement Records</h5>

        <span className="badge text-bg-light border">
          {filteredRecords.length} record(s)
        </span>
      </div>
    </div>

    <div className="card-body p-0">
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th className="px-3">Date &amp; Time</th>
              <th>Cashier</th>
              <th>Product</th>
              <th className="text-end">Previous</th>
              <th className="text-end">Added</th>
              <th className="text-end">New Stock</th>
              <th>Reference</th>
              <th>Notes</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" className="text-center py-5">
                  <div
                    className="spinner-border text-primary mb-3"
                    role="status"
                  >
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <div className="text-secondary">
                    Loading stock history...
                  </div>
                </td>
              </tr>
            ) : paginatedRecords.length === 0 ? (
              <tr>
                <td colSpan="8" className="text-center py-5">
                  <i className="bi bi-inbox display-5 text-secondary"></i>

                  <h6 className="fw-semibold mt-3">
                    No stock records found
                  </h6>

                  <p className="text-secondary mb-0">
                    Try changing your filters or refresh the records.
                  </p>
                </td>
              </tr>
            ) : (
              paginatedRecords.map((record) => (
                <tr key={record.id}>
                  <td className="px-3 text-nowrap">
                    {formatDate(record.created_at)}
                  </td>

                  <td>
                    <span className="fw-semibold">
                      {record.cashier_name ||
                        (record.cashier_id != null
                          ? `Cashier #${record.cashier_id}`
                          : "Unknown")}
                    </span>
                  </td>

                  <td>
                    <div className="fw-semibold">
                      {record.product_name || "Unnamed product"}
                    </div>

                    {record.product_id != null && (
                      <small className="text-secondary">
                        ID: {record.product_id}
                      </small>
                    )}
                  </td>

                  <td className="text-end">
                    {Number(record.previous_stock ?? 0).toLocaleString()}
                  </td>

                  <td className="text-end">
                    <span className="badge text-bg-success">
                      +{Number(record.quantity_added ?? 0).toLocaleString()}
                    </span>
                  </td>

                  <td className="text-end fw-semibold">
                    {Number(record.new_stock ?? 0).toLocaleString()}
                  </td>

                  <td>{record.reference || "—"}</td>

                  <td>
                    <span
                      className="d-inline-block text-truncate"
                      style={{ maxWidth: "220px" }}
                      title={record.notes || ""}
                    >
                      {record.notes || "—"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>

    {/* PAGINATION */}
    {!loading && filteredRecords.length > 0 && (
      <div className="card-footer bg-white d-flex flex-wrap justify-content-between align-items-center gap-3">
        <small className="text-secondary">
          Showing{" "}
          {(safePage - 1) * PAGE_SIZE + 1}–
          {Math.min(
            safePage * PAGE_SIZE,
            filteredRecords.length
          )}{" "}
          of {filteredRecords.length} records
        </small>

        <div className="btn-group" role="group" aria-label="Pagination">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            disabled={safePage <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            <i className="bi bi-chevron-left me-1"></i>
            Previous
          </button>

          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            disabled={safePage >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
            <i className="bi bi-chevron-right ms-1"></i>
          </button>
        </div>
      </div>
    )}
  </div>

  <p className="small text-secondary mt-3 mb-0">
    <i className="bi bi-shield-check me-1"></i>
    Stock history is intended for auditing. Stock changes should be
    performed through the authorised stock-management workflow.
  </p>
</div>

);
}

export default StockHistory;
