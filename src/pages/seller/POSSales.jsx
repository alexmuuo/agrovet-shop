import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../api/api";

const styles = {
page: {
padding: "24px",
maxWidth: "1500px",
margin: "0 auto",
color: "#172033",
},
headingRow: {
display: "flex",
justifyContent: "space-between",
alignItems: "center",
flexWrap: "wrap",
gap: "14px",
marginBottom: "22px",
},
heading: {
margin: 0,
fontSize: "28px",
fontWeight: 750,
},
subtitle: {
margin: "7px 0 0",
color: "#64748b",
fontSize: "14px",
},
button: {
border: "1px solid #dbe2ea",
borderRadius: "9px",
padding: "10px 14px",
fontSize: "13px",
fontWeight: 650,
cursor: "pointer",
background: "#fff",
color: "#172033",
},
primaryButton: {
background: "#172033",
color: "#fff",
borderColor: "#172033",
},
dangerButton: {
background: "#b42318",
color: "#fff",
borderColor: "#b42318",
},
card: {
background: "#fff",
border: "1px solid #e5eaf1",
borderRadius: "14px",
padding: "18px",
marginBottom: "20px",
boxShadow: "0 3px 12px rgba(15, 23, 42, 0.035)",
},
filters: {
display: "grid",
gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))",
gap: "12px",
},
label: {
display: "block",
fontSize: "12px",
fontWeight: 700,
color: "#475569",
marginBottom: "7px",
},
input: {
boxSizing: "border-box",
width: "100%",
minHeight: "42px",
padding: "10px 11px",
border: "1px solid #d6dee8",
borderRadius: "8px",
background: "#fff",
color: "#172033",
fontSize: "13px",
},
tableWrap: {
width: "100%",
overflowX: "auto",
},
table: {
width: "100%",
borderCollapse: "collapse",
fontSize: "13px",
minWidth: "850px",
},
th: {
textAlign: "left",
padding: "13px 12px",
color: "#64748b",
background: "#f8fafc",
borderBottom: "1px solid #e5eaf1",
fontSize: "11px",
textTransform: "uppercase",
letterSpacing: ".04em",
whiteSpace: "nowrap",
},
td: {
padding: "14px 12px",
borderBottom: "1px solid #edf1f5",
verticalAlign: "middle",
},
muted: {
color: "#64748b",
},
badge: {
display: "inline-block",
padding: "5px 8px",
borderRadius: "999px",
fontSize: "11px",
fontWeight: 750,
whiteSpace: "nowrap",
},
error: {
padding: "12px 14px",
borderRadius: "9px",
color: "#991b1b",
background: "#fef2f2",
border: "1px solid #fecaca",
fontSize: "13px",
marginBottom: "16px",
},
success: {
padding: "12px 14px",
borderRadius: "9px",
color: "#166534",
background: "#f0fdf4",
border: "1px solid #bbf7d0",
fontSize: "13px",
marginBottom: "16px",
},
warning: {
padding: "12px 14px",
borderRadius: "9px",
color: "#92400e",
background: "#fffbeb",
border: "1px solid #fde68a",
fontSize: "13px",
marginBottom: "16px",
lineHeight: 1.6,
},
overlay: {
position: "fixed",
inset: 0,
background: "rgba(15, 23, 42, 0.58)",
display: "flex",
alignItems: "center",
justifyContent: "center",
padding: "16px",
zIndex: 2000,
},
modal: {
background: "#fff",
width: "100%",
maxWidth: "950px",
maxHeight: "92vh",
overflowY: "auto",
borderRadius: "16px",
padding: "22px",
boxSizing: "border-box",
boxShadow: "0 20px 60px rgba(0,0,0,.2)",
},
smallModal: {
background: "#fff",
width: "100%",
maxWidth: "520px",
maxHeight: "92vh",
overflowY: "auto",
borderRadius: "16px",
padding: "22px",
boxSizing: "border-box",
},
sectionHeading: {
margin: "0 0 14px",
fontSize: "17px",
fontWeight: 750,
},
summaryGrid: {
display: "grid",
gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
gap: "12px",
marginBottom: "20px",
},
summaryBox: {
padding: "13px",
background: "#f8fafc",
border: "1px solid #e8edf3",
borderRadius: "10px",
},
summaryLabel: {
fontSize: "11px",
color: "#64748b",
marginBottom: "6px",
},
summaryValue: {
fontSize: "15px",
fontWeight: 750,
overflowWrap: "anywhere",
},
modalActions: {
display: "flex",
flexWrap: "wrap",
justifyContent: "flex-end",
gap: "9px",
marginTop: "20px",
},
itemRow: {
display: "grid",
gridTemplateColumns: "minmax(160px, 1fr) 100px 110px 40px",
gap: "10px",
alignItems: "end",
marginBottom: "12px",
},
auditItem: {
border: "1px solid #e5eaf1",
borderRadius: "10px",
padding: "13px",
marginBottom: "10px",
},
};

function formatMoney(value) {
const amount = Number(value ?? 0);

return `KES ${amount.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
if (!value) return "—";

const date = new Date(value);

if (Number.isNaN(date.getTime())) return "—";

return date.toLocaleString("en-KE", {
dateStyle: "medium",
timeStyle: "short",
});
}

function normaliseStatus(value) {
return String(value ?? "").trim().toLowerCase();
}

function getStatusStyle(value) {
const status = normaliseStatus(value);

if (["completed", "paid", "successful", "success"].includes(status)) {
return {
background: "#dcfce7",
color: "#166534",
};
}

if (["voided", "cancelled", "canceled", "failed"].includes(status)) {
return {
background: "#fee2e2",
color: "#991b1b",
};
}

if (["pending", "unpaid"].includes(status)) {
return {
background: "#fef3c7",
color: "#92400e",
};
}

return {
background: "#e2e8f0",
color: "#334155",
};
}

function StatusBadge({ value }) {
return (
<span
style={{
...styles.badge,
...getStatusStyle(value),
}}
>
{value || "Unknown"} </span>
);
}

function SummaryBox({ label, value }) {
return ( <div style={styles.summaryBox}> <div style={styles.summaryLabel}>{label}</div> <div style={styles.summaryValue}>{value}</div> </div>
);
}

function extractError(error, fallback) {
return (
error?.response?.data?.message ||
error?.response?.data?.error ||
error?.message ||
fallback
);
}

export default function POSSales() {
const [sales, setSales] = useState([]);
const [pagination, setPagination] = useState({
page: 1,
per_page: 50,
total: 0,
pages: 0,
});

const [searchInput, setSearchInput] = useState("");
const [filters, setFilters] = useState({
search: "",
status: "",
branch_id: "",
cashier_id: "",
start_date: "",
end_date: "",
});

const [loading, setLoading] = useState(true);
const [error, setError] = useState("");
const [notice, setNotice] = useState("");

const [selectedSale, setSelectedSale] = useState(null);
const [auditHistory, setAuditHistory] = useState([]);
const [detailsLoading, setDetailsLoading] = useState(false);

const [editorOpen, setEditorOpen] = useState(false);
const [editItems, setEditItems] = useState([]);
const [editReason, setEditReason] = useState("");
const [savingEdit, setSavingEdit] = useState(false);

const [voidOpen, setVoidOpen] = useState(false);
const [voidReason, setVoidReason] = useState("");
const [voiding, setVoiding] = useState(false);

const [branches, setBranches] = useState([]);
const [cashiers, setCashiers] = useState([]);

const [branchFilter, setBranchFilter] = useState("");
const [cashierFilter, setCashierFilter] = useState("");

const fetchSales = useCallback(
async (page = 1, overrideFilters = filters) => {
setLoading(true);
setError("");


  try {
    const params = {
      page,
      per_page: 50,
    };

    Object.entries(overrideFilters).forEach(([key, value]) => {
      if (value !== "" && value !== null && value !== undefined) {
        params[key] = value;
      }
    });

    const response = await api.get("/admin/pos-sales", {
      params,
    });

    const data = response?.data ?? {};

    setSales(Array.isArray(data.sales) ? data.sales : []);

    setPagination({
      page: Number(data.pagination?.page ?? page),
      per_page: Number(data.pagination?.per_page ?? 50),
      total: Number(data.pagination?.total ?? 0),
      pages: Number(data.pagination?.pages ?? 0),
    });
  } catch (requestError) {
    setError(
      extractError(requestError, "Failed to load POS sales.")
    );
  } finally {
    setLoading(false);
  }
},
[filters]


);

const fetchSaleDetails = useCallback(async (saleId) => {
setDetailsLoading(true);
setError("");


try {
  const response = await api.get(`/admin/pos-sales/${saleId}`);
  const data = response?.data ?? {};

  setSelectedSale(data.sale ?? null);

  setAuditHistory(
    Array.isArray(data.audit_history) ? data.audit_history : []
  );
} catch (requestError) {
  setError(
    extractError(requestError, "Failed to load sale details.")
  );
} finally {
  setDetailsLoading(false);
}


}, []);

useEffect(() => {
fetchSales(1);
}, [fetchSales]);

useEffect(() => {
let cancelled = false;


async function loadFilters() {
  try {
    const [branchesResponse, cashiersResponse] = await Promise.all([
      api.get("/admin/branches"),
      api.get("/admin/cashiers"),
    ]);

    if (cancelled) return;

    const branchData = branchesResponse?.data ?? {};
    const cashierData = cashiersResponse?.data ?? {};

    const branchList = Array.isArray(branchData)
      ? branchData
      : branchData.branches ?? branchData.data ?? [];

    const cashierList = Array.isArray(cashierData)
      ? cashierData
      : cashierData.cashiers ?? cashierData.data ?? [];

    setBranches(Array.isArray(branchList) ? branchList : []);
    setCashiers(Array.isArray(cashierList) ? cashierList : []);
  } catch {
    // Filters remain usable without optional dropdown data.
  }
}

loadFilters();

return () => {
  cancelled = true;
};


}, []);

const visibleTotal = useMemo(
() =>
sales.reduce(
(total, sale) => total + Number(sale.total ?? 0),
0
),
[sales]
);

function applyFilters(event) {
event.preventDefault();


const nextFilters = {
  search: searchInput.trim(),
  status: filters.status,
  branch_id: branchFilter,
  cashier_id: cashierFilter,
  start_date: filters.start_date,
  end_date: filters.end_date,
};

setFilters(nextFilters);
fetchSales(1, nextFilters);


}

function resetFilters() {
const emptyFilters = {
search: "",
status: "",
branch_id: "",
cashier_id: "",
start_date: "",
end_date: "",
};


setSearchInput("");
setBranchFilter("");
setCashierFilter("");
setFilters(emptyFilters);
setNotice("");
fetchSales(1, emptyFilters);


}

async function openDetails(sale) {
setSelectedSale(sale);
setAuditHistory([]);
setEditorOpen(false);
setVoidOpen(false);


await fetchSaleDetails(sale.id);


}

function closeDetails() {
if (savingEdit || voiding) return;


setSelectedSale(null);
setAuditHistory([]);
setEditorOpen(false);
setVoidOpen(false);


}

function startEditing() {
if (!selectedSale) return;


const status = normaliseStatus(selectedSale.status);
const paymentStatus = normaliseStatus(selectedSale.payment_status);

const successfulPayment = (selectedSale.payments ?? []).some(
  (payment) =>
    ["paid", "success", "successful", "completed"].includes(
      normaliseStatus(payment.status)
    )
);

if (
  ["voided", "cancelled", "canceled"].includes(status) ||
  paymentStatus === "paid" ||
  successfulPayment
) {
  setError(
    "This sale cannot be edited because it is cancelled, voided, or has a successful payment."
  );
  return;
}

setError("");
setEditReason("");

setEditItems(
  (selectedSale.items ?? []).map((item) => ({
    product_id: Number(item.product_id),
    quantity: String(item.quantity),
    product_name: item.product_name ?? "Product",
    price: Number(item.price ?? 0),
  }))
);

setEditorOpen(true);


}

function updateItem(index, field, value) {
setEditItems((current) =>
current.map((item, itemIndex) =>
itemIndex === index
? { ...item, [field]: value }
: item
)
);
}

function removeItem(index) {
setEditItems((current) =>
current.filter((_, itemIndex) => itemIndex !== index)
);
}

function addItem() {
setError(
"Adding a different product requires selecting a valid product ID. "
+ "This editor currently supports correcting quantities of existing sale items."
);
}

const editedTotal = useMemo(
() =>
editItems.reduce((total, item) => {
const quantity = Number(item.quantity);
const price = Number(item.price);


    if (
      !Number.isFinite(quantity) ||
      !Number.isFinite(price) ||
      quantity <= 0 ||
      price < 0
    ) {
      return total;
    }

    return total + quantity * price;
  }, 0),
[editItems]


);

async function saveEdit(event) {
event.preventDefault();


if (!selectedSale) return;

if (editReason.trim().length < 5) {
  setError("Please enter a meaningful reason of at least 5 characters.");
  return;
}

if (!editItems.length) {
  setError("A sale must contain at least one item.");
  return;
}

for (const item of editItems) {
  const quantity = Number(item.quantity);

  if (!Number.isInteger(quantity) || quantity < 1) {
    setError("Every item must have a positive whole-number quantity.");
    return;
  }
}

setSavingEdit(true);
setError("");
setNotice("");

try {
  await api.put(`/admin/pos-sales/${selectedSale.id}`, {
    reason: editReason.trim(),
    items: editItems.map((item) => ({
      product_id: Number(item.product_id),
      quantity: Number(item.quantity),
    })),
  });

  setNotice("POS sale updated successfully.");
  setEditorOpen(false);

  await fetchSaleDetails(selectedSale.id);
  await fetchSales(pagination.page);
} catch (requestError) {
  setError(
    extractError(requestError, "Failed to update the POS sale.")
  );
} finally {
  setSavingEdit(false);
}


}

function startVoiding() {
if (!selectedSale) return;


if (
  ["voided", "cancelled", "canceled"].includes(
    normaliseStatus(selectedSale.status)
  )
) {
  setError("This sale has already been voided or cancelled.");
  return;
}

setVoidReason("");
setError("");
setVoidOpen(true);


}

async function confirmVoid(event) {
event.preventDefault();


if (!selectedSale) return;

if (voidReason.trim().length < 5) {
  setError("Please provide a reason of at least 5 characters.");
  return;
}

const hasSuccessfulPayment = (
  selectedSale.payments ?? []
).some((payment) =>
  ["paid", "success", "successful", "completed"].includes(
    normaliseStatus(payment.status)
  )
);

const confirmation = hasSuccessfulPayment
  ? "This sale has a successful payment record. Voiding it will NOT issue a refund. Continue?"
  : "Void this sale and restore its branch stock? This cannot be undone through this page.";

if (!window.confirm(confirmation)) return;

setVoiding(true);
setError("");
setNotice("");

try {
  const response = await api.post(
    `/admin/pos-sales/${selectedSale.id}/void`,
    {
      reason: voidReason.trim(),
    }
  );

  const data = response?.data ?? {};

  setNotice(
    data.payment_notice
      ? `${data.message} ${data.payment_notice}`
      : data.message || "POS sale voided."
  );

  setVoidOpen(false);

  await fetchSaleDetails(selectedSale.id);
  await fetchSales(pagination.page);
} catch (requestError) {
  setError(
    extractError(requestError, "Failed to void the POS sale.")
  );
} finally {
  setVoiding(false);
}


}

return ( <div style={styles.page}> <div style={styles.headingRow}> <div> <h1 style={styles.heading}>POS Sales</h1> <p style={styles.subtitle}>
Review branch transactions, correct eligible sales, and maintain
a clear audit trail. </p> </div>


    <button
      type="button"
      style={{ ...styles.button, ...styles.primaryButton }}
      onClick={() => fetchSales(pagination.page)}
      disabled={loading}
    >
      {loading ? "Refreshing..." : "Refresh sales"}
    </button>
  </div>

  {error && (
    <div style={styles.error} role="alert">
      {error}
      <button
        type="button"
        onClick={() => setError("")}
        style={{
          ...styles.button,
          padding: "3px 8px",
          float: "right",
        }}
      >
        Dismiss
      </button>
    </div>
  )}

  {notice && (
    <div style={styles.success} role="status">
      {notice}
      <button
        type="button"
        onClick={() => setNotice("")}
        style={{
          ...styles.button,
          padding: "3px 8px",
          float: "right",
        }}
      >
        Dismiss
      </button>
    </div>
  )}

  <div style={styles.summaryGrid}>
    <SummaryBox
      label="Matching transactions"
      value={pagination.total.toLocaleString("en-KE")}
    />
    <SummaryBox
      label="Transactions on this page"
      value={sales.length.toLocaleString("en-KE")}
    />
    <SummaryBox
      label="Page total"
      value={formatMoney(visibleTotal)}
    />
  </div>

  <section style={styles.card}>
    <h2 style={styles.sectionHeading}>Find transactions</h2>

    <form onSubmit={applyFilters}>
      <div style={styles.filters}>
        <div>
          <label style={styles.label}>Search</label>
          <input
            style={styles.input}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Sale number..."
          />
        </div>

        <div>
          <label style={styles.label}>Status</label>
          <select
            style={styles.input}
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value,
              }))
            }
          >
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="voided">Voided</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div>
          <label style={styles.label}>Branch</label>
          <select
            style={styles.input}
            value={branchFilter}
            onChange={(event) => setBranchFilter(event.target.value)}
          >
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={styles.label}>Cashier</label>
          <select
            style={styles.input}
            value={cashierFilter}
            onChange={(event) => setCashierFilter(event.target.value)}
          >
            <option value="">All cashiers</option>
            {cashiers.map((cashier) => (
              <option key={cashier.id} value={cashier.id}>
                {cashier.full_name || cashier.username}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={styles.label}>From date</label>
          <input
            type="date"
            style={styles.input}
            value={filters.start_date}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                start_date: event.target.value,
              }))
            }
          />
        </div>

        <div>
          <label style={styles.label}>To date</label>
          <input
            type="date"
            style={styles.input}
            value={filters.end_date}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                end_date: event.target.value,
              }))
            }
          />
        </div>
      </div>

      <div style={styles.modalActions}>
        <button type="button" style={styles.button} onClick={resetFilters}>
          Reset
        </button>

        <button
          type="submit"
          style={{ ...styles.button, ...styles.primaryButton }}
        >
          Apply filters
        </button>
      </div>
    </form>
  </section>

  <section style={styles.card}>
    <div style={styles.headingRow}>
      <div>
        <h2 style={{ ...styles.sectionHeading, marginBottom: "4px" }}>
          Transactions
        </h2>
        <span style={{ ...styles.subtitle, margin: 0 }}>
          Showing {sales.length} of {pagination.total} matching sales.
        </span>
      </div>
    </div>

    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Sale number</th>
            <th style={styles.th}>Date</th>
            <th style={styles.th}>Branch</th>
            <th style={styles.th}>Cashier</th>
            <th style={styles.th}>Payment</th>
            <th style={styles.th}>Total</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>Action</th>
          </tr>
        </thead>

        <tbody>
          {loading ? (
            <tr>
              <td style={styles.td} colSpan={8}>
                Loading POS sales...
              </td>
            </tr>
          ) : sales.length === 0 ? (
            <tr>
              <td style={styles.td} colSpan={8}>
                No POS sales match your filters.
              </td>
            </tr>
          ) : (
            sales.map((sale) => (
              <tr key={sale.id}>
                <td style={styles.td}>
                  <strong>{sale.sale_number || `Sale #${sale.id}`}</strong>
                </td>

                <td style={styles.td}>
                  {formatDate(sale.created_at)}
                </td>

                <td style={styles.td}>
                  {sale.branch_name || "—"}
                </td>

                <td style={styles.td}>
                  {sale.cashier_name || "—"}
                </td>

                <td style={styles.td}>
                  <div>{sale.payment_method || "—"}</div>
                  <div style={{ marginTop: "5px" }}>
                    <StatusBadge value={sale.payment_status} />
                  </div>
                </td>

                <td style={styles.td}>
                  <strong>{formatMoney(sale.total)}</strong>
                </td>

                <td style={styles.td}>
                  <StatusBadge value={sale.status} />
                </td>

                <td style={styles.td}>
                  <button
                    type="button"
                    style={styles.button}
                    onClick={() => openDetails(sale)}
                  >
                    View details
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>

    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "12px",
        marginTop: "18px",
      }}
    >
      <span style={{ ...styles.muted, fontSize: "13px" }}>
        Page {pagination.page} of {Math.max(pagination.pages, 1)}
      </span>

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          style={styles.button}
          disabled={loading || pagination.page <= 1}
          onClick={() => fetchSales(pagination.page - 1)}
        >
          Previous
        </button>

        <button
          type="button"
          style={styles.button}
          disabled={
            loading ||
            pagination.pages === 0 ||
            pagination.page >= pagination.pages
          }
          onClick={() => fetchSales(pagination.page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  </section>

  {selectedSale && (
    <div style={styles.overlay} onMouseDown={closeDetails}>
      <section
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-sale-details-heading"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div style={styles.headingRow}>
          <div>
            <h2
              id="pos-sale-details-heading"
              style={{ ...styles.heading, fontSize: "22px" }}
            >
              {selectedSale.sale_number || `Sale #${selectedSale.id}`}
            </h2>

            <p style={styles.subtitle}>
              Created {formatDate(selectedSale.created_at)}
            </p>
          </div>

          <button
            type="button"
            style={styles.button}
            onClick={closeDetails}
            disabled={savingEdit || voiding}
          >
            Close
          </button>
        </div>

        {detailsLoading ? (
          <p>Loading sale details...</p>
        ) : (
          <>
            <div style={styles.summaryGrid}>
              <SummaryBox
                label="Branch"
                value={selectedSale.branch_name || "—"}
              />
              <SummaryBox
                label="Cashier"
                value={selectedSale.cashier_name || "—"}
              />
              <SummaryBox
                label="Total"
                value={formatMoney(selectedSale.total)}
              />
              <SummaryBox
                label="Payment method"
                value={selectedSale.payment_method || "—"}
              />
              <SummaryBox
                label="Payment status"
                value={<StatusBadge value={selectedSale.payment_status} />}
              />
              <SummaryBox
                label="Sale status"
                value={<StatusBadge value={selectedSale.status} />}
              />
            </div>

            {normaliseStatus(selectedSale.status) === "voided" &&
              (selectedSale.payments ?? []).some((payment) =>
                ["paid", "success", "successful", "completed"].includes(
                  normaliseStatus(payment.status)
                )
              ) && (
                <div style={styles.warning}>
                  <strong>Payment reconciliation required.</strong>
                  This sale is voided, but a successful payment record
                  exists. Voiding does not confirm that the customer
                  received a refund.
                </div>
              )}

            <h3 style={styles.sectionHeading}>Sale items</h3>

            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Product</th>
                    <th style={styles.th}>Quantity</th>
                    <th style={styles.th}>Unit price</th>
                    <th style={styles.th}>Subtotal</th>
                    <th style={styles.th}>Gross profit</th>
                  </tr>
                </thead>

                <tbody>
                  {(selectedSale.items ?? []).map((item) => (
                    <tr key={item.id ?? item.product_id}>
                      <td style={styles.td}>
                        {item.product_name || `Product #${item.product_id}`}
                      </td>
                      <td style={styles.td}>{item.quantity}</td>
                      <td style={styles.td}>{formatMoney(item.price)}</td>
                      <td style={styles.td}>
                        {formatMoney(
                          Number(item.price ?? 0) *
                          Number(item.quantity ?? 0)
                        )}
                      </td>
                      <td style={styles.td}>
                        {item.buying_price == null
                          ? "Unavailable"
                          : formatMoney(
                              (
                                Number(item.price) -
                                Number(item.buying_price)
                              ) * Number(item.quantity)
                            )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 style={{ ...styles.sectionHeading, marginTop: "24px" }}>
              Payment history
            </h3>

            {(selectedSale.payments ?? []).length === 0 ? (
              <p style={styles.muted}>
                No payment records are attached to this sale.
              </p>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Method</th>
                      <th style={styles.th}>Amount</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Receipt</th>
                      <th style={styles.th}>Date</th>
                    </tr>
                  </thead>

                  <tbody>
                    {selectedSale.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td style={styles.td}>
                          {payment.payment_method}
                        </td>
                        <td style={styles.td}>
                          {formatMoney(payment.amount)}
                        </td>
                        <td style={styles.td}>
                          <StatusBadge value={payment.status} />
                        </td>
                        <td style={styles.td}>
                          {payment.mpesa_receipt_number || "—"}
                        </td>
                        <td style={styles.td}>
                          {formatDate(payment.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 style={{ ...styles.sectionHeading, marginTop: "24px" }}>
              Audit history
            </h3>

            {auditHistory.length === 0 ? (
              <p style={styles.muted}>
                No administrative changes have been recorded for this sale.
              </p>
            ) : (
              auditHistory.map((audit) => (
                <div key={audit.id} style={styles.auditItem}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "8px",
                      marginBottom: "8px",
                    }}
                  >
                    <strong>
                      {audit.action === "voided"
                        ? "Sale voided"
                        : "Sale edited"}
                    </strong>

                    <span style={styles.muted}>
                      {formatDate(audit.created_at)}
                    </span>
                  </div>

                  <div style={{ fontSize: "13px", marginBottom: "5px" }}>
                    <strong>Administrator:</strong>{" "}
                    {audit.admin_username}
                  </div>

                  <div style={{ fontSize: "13px" }}>
                    <strong>Reason:</strong> {audit.reason}
                  </div>
                </div>
              ))
            )}

            {editorOpen && (
              <form
                onSubmit={saveEdit}
                style={{
                  ...styles.card,
                  marginTop: "24px",
                  background: "#f8fafc",
                }}
              >
                <h3 style={styles.sectionHeading}>Correct sale quantities</h3>

                <div style={styles.warning}>
                  This editor corrects quantities for existing sale items.
                  Unit prices and buying-price snapshots remain controlled
                  by the backend. A successful payment cannot be edited.
                </div>

                {editItems.map((item, index) => (
                  <div key={item.product_id} style={styles.itemRow}>
                    <div>
                      <label style={styles.label}>Product</label>
                      <div style={{ fontSize: "13px", padding: "11px 0" }}>
                        {item.product_name}
                      </div>
                    </div>

                    <div>
                      <label style={styles.label}>Quantity</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        style={styles.input}
                        value={item.quantity}
                        onChange={(event) =>
                          updateItem(
                            index,
                            "quantity",
                            event.target.value
                          )
                        }
                        required
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Unit price</label>
                      <div style={{ fontSize: "13px", padding: "11px 0" }}>
                        {formatMoney(item.price)}
                      </div>
                    </div>

                    <div>
                      <label style={styles.label}>Remove</label>
                      <button
                        type="button"
                        style={{
                          ...styles.button,
                          padding: "10px",
                          color: "#b42318",
                        }}
                        onClick={() => removeItem(index)}
                        aria-label={`Remove ${item.product_name}`}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  style={styles.button}
                  onClick={addItem}
                >
                  Add another product
                </button>

                <div style={{ marginTop: "16px" }}>
                  <label style={styles.label}>Reason for correction *</label>
                  <textarea
                    style={{
                      ...styles.input,
                      minHeight: "85px",
                      resize: "vertical",
                    }}
                    value={editReason}
                    onChange={(event) =>
                      setEditReason(event.target.value)
                    }
                    placeholder="Explain why this sale is being corrected..."
                    minLength={5}
                    maxLength={2000}
                    required
                  />
                </div>

                <div style={{ marginTop: "14px" }}>
                  <strong>Recalculated total: </strong>
                  {formatMoney(editedTotal)}
                </div>

                <div style={styles.modalActions}>
                  <button
                    type="button"
                    style={styles.button}
                    onClick={() => setEditorOpen(false)}
                    disabled={savingEdit}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    style={{
                      ...styles.button,
                      ...styles.primaryButton,
                    }}
                    disabled={savingEdit}
                  >
                    {savingEdit ? "Saving..." : "Save correction"}
                  </button>
                </div>
              </form>
            )}

            {voidOpen && (
              <form
                onSubmit={confirmVoid}
                style={{
                  ...styles.card,
                  marginTop: "24px",
                  borderColor: "#fecaca",
                  background: "#fffafa",
                }}
              >
                <h3 style={styles.sectionHeading}>Void this sale</h3>

                <div style={styles.warning}>
                  Voiding restores the recorded quantities to this
                  branch's stock. The original sale and payment history
                  remain in the database. A refund is not automatically
                  issued or confirmed.
                </div>

                <label style={styles.label}>Reason for voiding *</label>
                <textarea
                  style={{
                    ...styles.input,
                    minHeight: "90px",
                    resize: "vertical",
                  }}
                  value={voidReason}
                  onChange={(event) =>
                    setVoidReason(event.target.value)
                  }
                  placeholder="Explain why this transaction must be voided..."
                  minLength={5}
                  maxLength={2000}
                  required
                />

                <div style={styles.modalActions}>
                  <button
                    type="button"
                    style={styles.button}
                    onClick={() => setVoidOpen(false)}
                    disabled={voiding}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    style={{
                      ...styles.button,
                      ...styles.dangerButton,
                    }}
                    disabled={voiding}
                  >
                    {voiding ? "Voiding..." : "Confirm void"}
                  </button>
                </div>
              </form>
            )}

            {!editorOpen && !voidOpen && (
              <div style={styles.modalActions}>
                <button
                  type="button"
                  style={styles.button}
                  onClick={startEditing}
                  disabled={detailsLoading}
                >
                  Edit quantities
                </button>

                <button
                  type="button"
                  style={{
                    ...styles.button,
                    ...styles.dangerButton,
                  }}
                  onClick={startVoiding}
                  disabled={detailsLoading}
                >
                  Void sale
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )}
</div>


);
}
