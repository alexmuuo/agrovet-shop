import { useCallback, useEffect, useState } from "react";
import api from "../../api/axios";

const styles = {
page: {
padding: "24px",
maxWidth: "1500px",
margin: "0 auto",
color: "#212529",
},
title: {
marginBottom: "6px",
fontWeight: 700,
},
subtitle: {
color: "#6c757d",
marginBottom: "24px",
},
card: {
background: "#fff",
border: "1px solid #dee2e6",
borderRadius: "10px",
padding: "20px",
marginBottom: "24px",
boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
},
label: {
display: "block",
fontWeight: 600,
marginBottom: "8px",
},
input: {
width: "100%",
padding: "10px 12px",
border: "1px solid #ced4da",
borderRadius: "6px",
boxSizing: "border-box",
},
button: {
padding: "9px 14px",
border: "none",
borderRadius: "6px",
cursor: "pointer",
fontWeight: 600,
},
primaryButton: {
background: "#198754",
color: "#fff",
},
secondaryButton: {
background: "#e9ecef",
color: "#212529",
},
tableWrapper: {
overflowX: "auto",
},
table: {
width: "100%",
borderCollapse: "collapse",
minWidth: "650px",
},
th: {
padding: "12px",
textAlign: "left",
background: "#f8f9fa",
borderBottom: "1px solid #dee2e6",
whiteSpace: "nowrap",
},
td: {
padding: "12px",
borderBottom: "1px solid #e9ecef",
verticalAlign: "middle",
},
error: {
background: "#f8d7da",
color: "#842029",
border: "1px solid #f5c2c7",
padding: "12px",
borderRadius: "6px",
marginBottom: "16px",
},
success: {
background: "#d1e7dd",
color: "#0f5132",
border: "1px solid #badbcc",
padding: "12px",
borderRadius: "6px",
marginBottom: "16px",
},
tabs: {
display: "flex",
gap: "8px",
flexWrap: "wrap",
marginBottom: "20px",
},
};

const formatMoney = (value) =>
new Intl.NumberFormat("en-KE", {
style: "currency",
currency: "KES",
minimumFractionDigits: 2,
}).format(Number(value) || 0);

function getErrorMessage(error) {
return (
error?.response?.data?.message ||
error?.response?.data?.error ||
error?.message ||
"Something went wrong. Please try again."
);
}

function Branches() {
const [branches, setBranches] = useState([]);
const [selectedBranchId, setSelectedBranchId] = useState("");
const [activeTab, setActiveTab] = useState("stock");

const [stock, setStock] = useState([]);
const [cashiers, setCashiers] = useState([]);
const [sales, setSales] = useState([]);

const [loadingBranches, setLoadingBranches] = useState(true);
const [loadingSection, setLoadingSection] = useState(false);
const [error, setError] = useState("");
const [success, setSuccess] = useState("");

const [stockSearch, setStockSearch] = useState("");
const [stockEdits, setStockEdits] = useState({});
const [savingProductId, setSavingProductId] = useState(null);
const [assigningCashierId, setAssigningCashierId] = useState(null);

const loadBranches = useCallback(async () => {
setLoadingBranches(true);
setError("");


try {
  const response = await api.get("/admin/branches");
  const data = Array.isArray(response.data)
    ? response.data
    : response.data?.branches;

  const list = Array.isArray(data) ? data : [];

  setBranches(list);

  setSelectedBranchId((currentId) => {
    if (
      currentId &&
      list.some((branch) => String(branch.id) === String(currentId))
    ) {
      return currentId;
    }

    const activeBranch = list.find(
      (branch) => branch.is_active !== false
    );

    return activeBranch ? String(activeBranch.id) : "";
  });
} catch (err) {
  setError(
    `Unable to load branches: ${getErrorMessage(err)}`
  );
} finally {
  setLoadingBranches(false);
}


}, []);

const loadSection = useCallback(async () => {
if (!selectedBranchId) {
setStock([]);
setCashiers([]);
setSales([]);
return;
}


setLoadingSection(true);
setError("");
setSuccess("");

try {
  if (activeTab === "stock") {
    const response = await api.get(
      `/admin/branches/${selectedBranchId}/stock`
    );

    const data = Array.isArray(response.data)
      ? response.data
      : response.data?.stock;

    setStock(Array.isArray(data) ? data : []);
    setStockEdits({});
  } else if (activeTab === "cashiers") {
    const response = await api.get(
      `/admin/branches/${selectedBranchId}/cashiers`
    );

    const data = Array.isArray(response.data)
      ? response.data
      : response.data?.cashiers;

    setCashiers(Array.isArray(data) ? data : []);
  } else if (activeTab === "sales") {
    const response = await api.get(
      `/admin/branches/${selectedBranchId}/sales`
    );

    const data = Array.isArray(response.data)
      ? response.data
      : response.data?.sales;

    setSales(Array.isArray(data) ? data : []);
  }
} catch (err) {
  setError(
    `Unable to load ${activeTab}: ${getErrorMessage(err)}`
  );
} finally {
  setLoadingSection(false);
}


}, [selectedBranchId, activeTab]);

useEffect(() => {
loadBranches();
}, [loadBranches]);

useEffect(() => {
loadSection();
}, [loadSection]);

const saveStock = async (product) => {
const productId = product.product_id ?? product.id;
const rawQuantity =
stockEdits[productId] !== undefined
? stockEdits[productId]
: product.quantity;


if (
  rawQuantity === "" ||
  !Number.isInteger(Number(rawQuantity)) ||
  Number(rawQuantity) < 0
) {
  setError("Stock quantity must be a whole number of zero or more.");
  return;
}

setSavingProductId(productId);
setError("");
setSuccess("");

try {
  await api.put(
    `/admin/branches/${selectedBranchId}/stock/${productId}`,
    { quantity: Number(rawQuantity) }
  );

  setSuccess(`Stock updated for ${product.name}.`);
  await loadSection();
} catch (err) {
  setError(`Unable to update stock: ${getErrorMessage(err)}`);
} finally {
  setSavingProductId(null);
}


};

const assignCashier = async (cashierId, branchId) => {
setAssigningCashierId(cashierId);
setError("");
setSuccess("");


try {
  await api.put(`/admin/cashiers/${cashierId}/branch`, {
    branch_id: branchId ? Number(branchId) : null,
  });

  setSuccess("Cashier assignment updated.");
  await loadSection();
} catch (err) {
  setError(
    `Unable to update cashier assignment: ${getErrorMessage(err)}`
  );
} finally {
  setAssigningCashierId(null);
}


};

const selectedBranch = branches.find(
(branch) => String(branch.id) === String(selectedBranchId)
);

const filteredStock = stock.filter((product) => {
const search = stockSearch.trim().toLowerCase();


if (!search) return true;

return (
  String(product.name || "").toLowerCase().includes(search) ||
  String(product.category || "").toLowerCase().includes(search)
);


});

const tabButton = (tab, label) => (
<button
key={tab}
type="button"
onClick={() => {
setActiveTab(tab);
setError("");
setSuccess("");
}}
style={{
...styles.button,
...(activeTab === tab
? styles.primaryButton
: styles.secondaryButton),
}}
>
{label} </button>
);

if (loadingBranches) {
return ( <div style={styles.page}> <h2>Branch Management</h2> <p>Loading branches...</p> </div>
);
}

return ( <main style={styles.page}> <h1 style={styles.title}>Branch Management</h1>

```
  <p style={styles.subtitle}>
    Manage branch inventory, cashier assignments, and POS sales
    independently.
  </p>

  {error && <div style={styles.error}>{error}</div>}
  {success && <div style={styles.success}>{success}</div>}

  <section style={styles.card}>
    <label htmlFor="branch-selector" style={styles.label}>
      Select branch
    </label>

    {branches.length === 0 ? (
      <p>
        No branches were returned by the server. Confirm that your
        branches exist in the database and that the admin branch API
        is available.
      </p>
    ) : (
      <select
        id="branch-selector"
        value={selectedBranchId}
        onChange={(event) =>
          setSelectedBranchId(event.target.value)
        }
        style={{ ...styles.input, maxWidth: "500px" }}
      >
        {branches.map((branch) => (
          <option key={branch.id} value={String(branch.id)}>
            {branch.name} ({branch.code})
            {branch.is_active === false ? " — Inactive" : ""}
          </option>
        ))}
      </select>
    )}

    {selectedBranch && (
      <div style={{ marginTop: "14px", color: "#6c757d" }}>
        <strong>Branch code:</strong> {selectedBranch.code}
        {" · "}
        <strong>Status:</strong>{" "}
        {selectedBranch.is_active === false ? "Inactive" : "Active"}
      </div>
    )}
  </section>

  {selectedBranchId && (
    <>
      <nav style={styles.tabs} aria-label="Branch sections">
        {tabButton("stock", "Branch Stock")}
        {tabButton("cashiers", "Assigned Cashiers")}
        {tabButton("sales", "POS Sales")}
      </nav>

      {loadingSection ? (
        <section style={styles.card}>
          Loading {activeTab}...
        </section>
      ) : (
        <>
          {activeTab === "stock" && (
            <section style={styles.card}>
              <h2>Branch Inventory</h2>

              <p style={styles.subtitle}>
                Stock quantities here belong to this branch only.
                Changes do not automatically alter another branch's
                stock.
              </p>

              <div style={{ marginBottom: "18px", maxWidth: "420px" }}>
                <label
                  htmlFor="stock-search"
                  style={styles.label}
                >
                  Search products
                </label>

                <input
                  id="stock-search"
                  type="search"
                  placeholder="Search by product name or category..."
                  value={stockSearch}
                  onChange={(event) =>
                    setStockSearch(event.target.value)
                  }
                  style={styles.input}
                />
              </div>

              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Product</th>
                      <th style={styles.th}>Category</th>
                      <th style={styles.th}>Selling Price</th>
                      <th style={styles.th}>Branch Stock</th>
                      <th style={styles.th}>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredStock.length === 0 ? (
                      <tr>
                        <td
                          style={styles.td}
                          colSpan={5}
                        >
                          No products found for this branch.
                        </td>
                      </tr>
                    ) : (
                      filteredStock.map((product) => {
                        const productId =
                          product.product_id ?? product.id;

                        return (
                          <tr key={productId}>
                            <td style={styles.td}>
                              {product.name}
                            </td>

                            <td style={styles.td}>
                              {product.category || "—"}
                            </td>

                            <td style={styles.td}>
                              {formatMoney(product.price)}
                            </td>

                            <td style={styles.td}>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={
                                  stockEdits[productId] !== undefined
                                    ? stockEdits[productId]
                                    : product.quantity ?? 0
                                }
                                onChange={(event) =>
                                  setStockEdits((previous) => ({
                                    ...previous,
                                    [productId]: event.target.value,
                                  }))
                                }
                                aria-label={`Stock quantity for ${product.name}`}
                                style={{
                                  ...styles.input,
                                  maxWidth: "120px",
                                }}
                              />
                            </td>

                            <td style={styles.td}>
                              <button
                                type="button"
                                onClick={() => saveStock(product)}
                                disabled={
                                  savingProductId === productId
                                }
                                style={{
                                  ...styles.button,
                                  ...styles.primaryButton,
                                  opacity:
                                    savingProductId === productId
                                      ? 0.65
                                      : 1,
                                }}
                              >
                                {savingProductId === productId
                                  ? "Saving..."
                                  : "Save"}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "cashiers" && (
            <section style={styles.card}>
              <h2>Cashier Assignments</h2>

              <p style={styles.subtitle}>
                Assign cashiers to a branch. A cashier should work
                under the branch assigned to their account.
              </p>

              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Username</th>
                      <th style={styles.th}>Full Name</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Assignment</th>
                    </tr>
                  </thead>

                  <tbody>
                    {cashiers.length === 0 ? (
                      <tr>
                        <td style={styles.td} colSpan={4}>
                          No cashiers were returned by this endpoint.
                        </td>
                      </tr>
                    ) : (
                      cashiers.map((cashier) => (
                        <tr key={cashier.id}>
                          <td style={styles.td}>
                            {cashier.username}
                          </td>

                          <td style={styles.td}>
                            {cashier.full_name ||
                              cashier.fullname ||
                              "—"}
                          </td>

                          <td style={styles.td}>
                            {cashier.is_active === false ||
                            cashier.isactive === false
                              ? "Inactive"
                              : "Active"}
                          </td>

                          <td style={styles.td}>
                            <select
                              value={
                                cashier.branch_id == null
                                  ? ""
                                  : String(cashier.branch_id)
                              }
                              onChange={(event) =>
                                assignCashier(
                                  cashier.id,
                                  event.target.value
                                )
                              }
                              disabled={
                                assigningCashierId === cashier.id
                              }
                              style={{
                                ...styles.input,
                                minWidth: "220px",
                              }}
                              aria-label={`Assign ${cashier.username} to a branch`}
                            >
                              <option value="">
                                Unassigned
                              </option>

                              {branches.map((branch) => (
                                <option
                                  key={branch.id}
                                  value={String(branch.id)}
                                  disabled={
                                    branch.is_active === false
                                  }
                                >
                                  {branch.name}
                                </option>
                              ))}
                            </select>

                            {assigningCashierId === cashier.id && (
                              <small> Saving...</small>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "sales" && (
            <section style={styles.card}>
              <h2>POS Sales</h2>

              <p style={styles.subtitle}>
                These are cashier POS sales for the selected branch,
                not website customer orders.
              </p>

              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Sale Number</th>
                      <th style={styles.th}>Cashier</th>
                      <th style={styles.th}>Total</th>
                      <th style={styles.th}>Payment Method</th>
                      <th style={styles.th}>Payment Status</th>
                      <th style={styles.th}>Sale Status</th>
                      <th style={styles.th}>Date</th>
                    </tr>
                  </thead>

                  <tbody>
                    {sales.length === 0 ? (
                      <tr>
                        <td style={styles.td} colSpan={7}>
                          No POS sales found for this branch.
                        </td>
                      </tr>
                    ) : (
                      sales.map((sale) => (
                        <tr key={sale.id}>
                          <td style={styles.td}>
                            {sale.sale_number || `#${sale.id}`}
                          </td>

                          <td style={styles.td}>
                            {sale.cashier_name ||
                              sale.cashier?.full_name ||
                              sale.cashier?.username ||
                              "—"}
                          </td>

                          <td style={styles.td}>
                            {formatMoney(sale.total)}
                          </td>

                          <td style={styles.td}>
                            {sale.payment_method || "—"}
                          </td>

                          <td style={styles.td}>
                            {sale.payment_status || "—"}
                          </td>

                          <td style={styles.td}>
                            {sale.status || "—"}
                          </td>

                          <td style={styles.td}>
                            {sale.created_at
                              ? new Date(
                                  sale.created_at
                                ).toLocaleString()
                              : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </>
  )}
</main>


);
}

export default Branches;
