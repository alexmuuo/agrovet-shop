import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../api/api";

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
    background: "#fff",
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
  dangerButton: {
    background: "#dc3545",
    color: "#fff",
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
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: "16px",
    marginBottom: "20px",
  },
  infoBox: {
    background: "#f8f9fa",
    border: "1px solid #dee2e6",
    borderRadius: "8px",
    padding: "15px",
  },
  transferSummary: {
    background: "#e8f5e9",
    border: "1px solid #badbcc",
    borderRadius: "8px",
    padding: "16px",
    marginTop: "18px",
  },
  badge: {
    display: "inline-block",
    padding: "5px 10px",
    borderRadius: "20px",
    background: "#d1e7dd",
    color: "#0f5132",
    fontSize: "12px",
    fontWeight: 700,
  },
};

const formatMoney = (value) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatQuantity = (value) =>
  Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });

function getErrorMessage(error) {
  const serverMessage =
    error?.response?.data?.message ||
    error?.response?.data?.error;

  if (serverMessage) return serverMessage;

  if (error?.response) {
    return `Server returned HTTP ${error.response.status}${
      error.response.statusText
        ? ` (${error.response.statusText})`
        : ""
    }.`;
  }

  if (error?.request) {
    return `No response received from the server. Check the API URL, Vercel routing and network connection.`;
  }

  return error?.message || "Something went wrong. Please try again.";
}

const emptyTransferItem = () => ({
  product_id: "",
  quantity: "",
});

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

  // ==========================================================
  // INTERBRANCH TRANSFER STATE
  // ==========================================================

  const [transferSourceId, setTransferSourceId] = useState("");
  const [transferDestinationId, setTransferDestinationId] =
    useState("");

  const [transferProducts, setTransferProducts] = useState([]);
  const [transferItems, setTransferItems] = useState([
    emptyTransferItem(),
  ]);

  const [transferNotes, setTransferNotes] = useState("");

  const [transferHistory, setTransferHistory] = useState([]);

  const [loadingTransferProducts, setLoadingTransferProducts] =
    useState(false);

  const [loadingTransfers, setLoadingTransfers] = useState(false);

  const [submittingTransfer, setSubmittingTransfer] =
    useState(false);

  // ==========================================================
  // LOAD BRANCHES
  // ==========================================================

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
          list.some(
            (branch) => String(branch.id) === String(currentId)
          )
        ) {
          return currentId;
        }

        const activeBranch = list.find(
          (branch) => branch.is_active !== false
        );

        return activeBranch ? String(activeBranch.id) : "";
      });

      setTransferSourceId((currentId) => {
        if (
          currentId &&
          list.some(
            (branch) =>
              String(branch.id) === String(currentId) &&
              branch.is_active !== false
          )
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

  // ==========================================================
  // LOAD EXISTING BRANCH SECTIONS
  // ==========================================================

  const loadSection = useCallback(async () => {
    if (!selectedBranchId) {
      setStock([]);
      setCashiers([]);
      setSales([]);
      return;
    }

    if (activeTab === "transfers") {
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

  // ==========================================================
  // SAVE BRANCH STOCK
  // ==========================================================

  const saveStock = async (product) => {
    const productId = product.product_id ?? product.id;

    const rawQuantity =
      stockEdits[productId] !== undefined
        ? stockEdits[productId]
        : product.quantity ?? 0;

    const quantityText = String(rawQuantity).trim();

    if (
      !/^(\d+(\.\d{1,3})?|\.\d{1,3})$/.test(quantityText)
    ) {
      setError(
        "Stock quantity must be a number of zero or more, with up to 3 decimal places."
      );
      return;
    }

    setSavingProductId(productId);
    setError("");
    setSuccess("");

    try {
      if (!selectedBranchId || !productId) {
        throw new Error(
          "A branch and product must be selected before saving stock."
        );
      }

      const quantity = Number(quantityText);

      if (!Number.isFinite(quantity) || quantity < 0) {
        throw new Error(
          "Enter a valid stock quantity of zero or more."
        );
      }

      const endpoint = `/admin/branches/${selectedBranchId}/stock/${productId}`;

      await api.put(endpoint, { quantity });

      setSuccess(`Stock updated for ${product.name}.`);

      setStockEdits((previous) => {
        const next = { ...previous };
        delete next[productId];
        return next;
      });

      try {
        const response = await api.get(
          `/admin/branches/${selectedBranchId}/stock`
        );

        const data = Array.isArray(response.data)
          ? response.data
          : response.data?.stock;

        setStock(Array.isArray(data) ? data : []);
      } catch (refreshError) {
        console.error(
          "Stock saved, but refreshing branch stock failed:",
          refreshError
        );

        setSuccess(
          `Stock updated for ${product.name}, but the stock list could not refresh. Reload the page to confirm the latest value.`
        );
      }
    } catch (err) {
      console.error("Branch stock update failed:", err);

      setError(
        `Unable to update stock: ${getErrorMessage(err)}`
      );
    } finally {
      setSavingProductId(null);
    }
  };

  // ==========================================================
  // ASSIGN CASHIER
  // ==========================================================

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

  // ==========================================================
  // INTERBRANCH TRANSFERS: LOAD SOURCE PRODUCTS
  // ==========================================================

  const loadTransferProducts = useCallback(async () => {
    if (!transferSourceId) {
      setTransferProducts([]);
      return;
    }

    setLoadingTransferProducts(true);
    setError("");

    try {
      const response = await api.get(
        `/admin/branches/${transferSourceId}/stock`
      );

      const data = Array.isArray(response.data)
        ? response.data
        : response.data?.stock;

      setTransferProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      setTransferProducts([]);

      setError(
        `Unable to load source branch products: ${getErrorMessage(err)}`
      );
    } finally {
      setLoadingTransferProducts(false);
    }
  }, [transferSourceId]);

  useEffect(() => {
    if (activeTab === "transfers") {
      loadTransferProducts();
    }
  }, [activeTab, loadTransferProducts]);

  // ==========================================================
  // INTERBRANCH TRANSFERS: LOAD HISTORY
  // ==========================================================

  const loadTransferHistory = useCallback(async () => {
    setLoadingTransfers(true);

    try {
      const response = await api.get(
        "/admin/stock-transfers"
      );

      const data = Array.isArray(response.data)
        ? response.data
        : response.data?.transfers;

      setTransferHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      setTransferHistory([]);

      setError(
        `Unable to load transfer history: ${getErrorMessage(err)}`
      );
    } finally {
      setLoadingTransfers(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "transfers") {
      loadTransferHistory();
    }
  }, [activeTab, loadTransferHistory]);

  // ==========================================================
  // TRANSFER FORM HELPERS
  // ==========================================================

  const updateTransferItem = (index, field, value) => {
    setTransferItems((previous) =>
      previous.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, [field]: value }
          : item
      )
    );
  };

  const addTransferItem = () => {
    setTransferItems((previous) => [
      ...previous,
      emptyTransferItem(),
    ]);
  };

  const removeTransferItem = (index) => {
    setTransferItems((previous) =>
      previous.length === 1
        ? [emptyTransferItem()]
        : previous.filter(
            (_, itemIndex) => itemIndex !== index
          )
    );
  };

  const availableDestinationBranches = branches.filter(
    (branch) =>
      branch.is_active !== false &&
      String(branch.id) !== String(transferSourceId)
  );

  const selectedSourceBranch = branches.find(
    (branch) => String(branch.id) === String(transferSourceId)
  );

  const selectedDestinationBranch = branches.find(
    (branch) =>
      String(branch.id) === String(transferDestinationId)
  );

  const transferPreview = useMemo(() => {
    return transferItems.map((item) => {
      const product = transferProducts.find(
        (product) =>
          String(product.product_id ?? product.id) ===
          String(item.product_id)
      );

      return {
        ...item,
        product,
        quantity: Number(item.quantity) || 0,
        available: Number(product?.quantity ?? 0),
      };
    });
  }, [transferItems, transferProducts]);

  const totalTransferItems = transferPreview.filter(
    (item) => item.product && item.quantity > 0
  ).length;

  // ==========================================================
  // SUBMIT INTERBRANCH TRANSFER
  // ==========================================================

  const submitTransfer = async () => {
    setError("");
    setSuccess("");

    if (!transferSourceId || !transferDestinationId) {
      setError("Select both source and destination branches.");
      return;
    }

    if (String(transferSourceId) === String(transferDestinationId)) {
      setError("Source and destination branches must be different.");
      return;
    }

    if (!transferItems.length) {
      setError("Add at least one product to the transfer.");
      return;
    }

    const validatedItems = [];

    for (let index = 0; index < transferItems.length; index++) {
      const item = transferItems[index];

      if (!item.product_id) {
        setError(`Select a product for transfer item ${index + 1}.`);
        return;
      }

      const quantityText = String(item.quantity).trim();

      if (
        !/^(\d+(\.\d{1,3})?|\.\d{1,3})$/.test(quantityText)
      ) {
        setError(
          `Enter a valid quantity for transfer item ${index + 1}. Use up to 3 decimal places.`
        );
        return;
      }

      const quantity = Number(quantityText);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        setError(
          `Transfer quantity for item ${index + 1} must be greater than zero.`
        );
        return;
      }

      const product = transferProducts.find(
        (product) =>
          String(product.product_id ?? product.id) ===
          String(item.product_id)
      );

      if (!product) {
        setError(
          `Product in transfer item ${index + 1} is no longer available in the source branch.`
        );
        return;
      }

      const available = Number(product.quantity ?? 0);

      if (quantity > available) {
        setError(
          `Insufficient stock for ${product.name}. Available: ${formatQuantity(available)}. Requested: ${formatQuantity(quantity)}.`
        );
        return;
      }

      validatedItems.push({
        product_id: Number(item.product_id),
        quantity: quantityText,
      });
    }

    // Prevent duplicate products in a single transfer.
    const productIds = validatedItems.map(
      (item) => item.product_id
    );

    if (new Set(productIds).size !== productIds.length) {
      setError(
        "A product can only appear once in a transfer. Combine its quantities into one item."
      );
      return;
    }

    const confirmed = window.confirm(
      `Complete this stock transfer?\n\n` +
        `From: ${selectedSourceBranch?.name}\n` +
        `To: ${selectedDestinationBranch?.name}\n` +
        `Products: ${validatedItems.length}\n\n` +
        `Stock will immediately be deducted from the source branch and added to the destination branch.`
    );

    if (!confirmed) return;

    setSubmittingTransfer(true);

    try {
      const response = await api.post(
        "/admin/stock-transfers",
        {
          source_branch_id: Number(transferSourceId),
          destination_branch_id: Number(transferDestinationId),
          items: validatedItems,
          notes: transferNotes.trim() || null,
        }
      );

      const transfer = response.data?.transfer || response.data;

      const reference =
        transfer?.reference ||
        transfer?.transfer_number ||
        transfer?.transfer_reference ||
        "Transfer completed";

      setSuccess(
        `Stock transfer completed successfully. Reference: ${reference}`
      );

      setTransferItems([emptyTransferItem()]);
      setTransferNotes("");

      await Promise.all([
        loadTransferProducts(),
        loadTransferHistory(),
      ]);
    } catch (err) {
      console.error("Interbranch transfer failed:", err);

      setError(
        `Unable to complete transfer: ${getErrorMessage(err)}`
      );
    } finally {
      setSubmittingTransfer(false);
    }
  };

  // ==========================================================
  // FILTER BRANCH STOCK
  // ==========================================================

  const filteredStock = stock.filter((product) => {
    const search = stockSearch.trim().toLowerCase();

    if (!search) return true;

    return (
      String(product.name || "")
        .toLowerCase()
        .includes(search) ||
      String(product.category || "")
        .toLowerCase()
        .includes(search)
    );
  });

  // ==========================================================
  // TAB BUTTON
  // ==========================================================

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
      {label}
    </button>
  );

  // ==========================================================
  // LOADING
  // ==========================================================

  if (loadingBranches) {
    return (
      <div style={styles.page}>
        <h2>Branch Management</h2>
        <p>Loading branches...</p>
      </div>
    );
  }

  // ==========================================================
  // MAIN PAGE
  // ==========================================================

  return (
    <main style={styles.page}>
      <h1 style={styles.title}>Branch Management</h1>

      <p style={styles.subtitle}>
        Manage branch inventory, cashier assignments, POS sales
        and interbranch stock transfers.
      </p>

      {error && (
        <div style={styles.error}>
          {error}
        </div>
      )}

      {success && (
        <div style={styles.success}>
          {success}
        </div>
      )}

      {/* =====================================================
          BRANCH SELECTOR
      ===================================================== */}

      <section style={styles.card}>
        <label
          htmlFor="branch-selector"
          style={styles.label}
        >
          Select branch
        </label>

        {branches.length === 0 ? (
          <p>
            No branches were returned by the server. Confirm that
            your branches exist in the database.
          </p>
        ) : (
          <select
            id="branch-selector"
            value={selectedBranchId}
            onChange={(event) =>
              setSelectedBranchId(event.target.value)
            }
            style={{
              ...styles.input,
              maxWidth: "500px",
            }}
          >
            {branches.map((branch) => (
              <option
                key={branch.id}
                value={String(branch.id)}
              >
                {branch.name} ({branch.code})
                {branch.is_active === false
                  ? " — Inactive"
                  : ""}
              </option>
            ))}
          </select>
        )}

        {selectedBranchId && (
          <div
            style={{
              marginTop: "14px",
              color: "#6c757d",
            }}
          >
            <strong>Selected branch:</strong>{" "}
            {
              branches.find(
                (branch) =>
                  String(branch.id) ===
                  String(selectedBranchId)
              )?.name
            }
          </div>
        )}
      </section>

      {/* =====================================================
          NAVIGATION TABS
      ===================================================== */}

      <nav
        style={styles.tabs}
        aria-label="Branch sections"
      >
        {tabButton("stock", "Branch Stock")}
        {tabButton("cashiers", "Assigned Cashiers")}
        {tabButton("sales", "POS Sales")}
        {tabButton("transfers", "Interbranch Transfers")}
      </nav>

      {/* =====================================================
          TRANSFERS SECTION
      ===================================================== */}

      {activeTab === "transfers" ? (
        <>
          {/* NEW TRANSFER FORM */}

          <section style={styles.card}>
            <h2 style={{ marginTop: 0 }}>
              Create Stock Transfer
            </h2>

            <p style={styles.subtitle}>
              Transfer stock between branches. Both inventories
              will be updated immediately once the transfer is
              completed.
            </p>

            <div style={styles.grid}>
              <div>
                <label
                  htmlFor="transfer-source"
                  style={styles.label}
                >
                  Source Branch
                </label>

                <select
                  id="transfer-source"
                  value={transferSourceId}
                  onChange={(event) => {
                    setTransferSourceId(event.target.value);
                    setTransferItems([emptyTransferItem()]);
                  }}
                  style={styles.input}
                  disabled={submittingTransfer}
                >
                  <option value="">
                    Select source branch
                  </option>

                  {branches
                    .filter(
                      (branch) => branch.is_active !== false
                    )
                    .map((branch) => (
                      <option
                        key={branch.id}
                        value={String(branch.id)}
                      >
                        {branch.name} ({branch.code})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="transfer-destination"
                  style={styles.label}
                >
                  Destination Branch
                </label>

                <select
                  id="transfer-destination"
                  value={transferDestinationId}
                  onChange={(event) =>
                    setTransferDestinationId(
                      event.target.value
                    )
                  }
                  style={styles.input}
                  disabled={submittingTransfer}
                >
                  <option value="">
                    Select destination branch
                  </option>

                  {availableDestinationBranches.map(
                    (branch) => (
                      <option
                        key={branch.id}
                        value={String(branch.id)}
                      >
                        {branch.name} ({branch.code})
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            {/* TRANSFER ROUTE */}

            {selectedSourceBranch &&
              selectedDestinationBranch && (
                <div style={styles.transferSummary}>
                  <strong>
                    {selectedSourceBranch.name}
                  </strong>

                  <span
                    style={{
                      margin: "0 15px",
                      fontSize: "20px",
                    }}
                  >
                    →
                  </span>

                  <strong>
                    {selectedDestinationBranch.name}
                  </strong>

                  <div
                    style={{
                      marginTop: "8px",
                      fontSize: "13px",
                      color: "#0f5132",
                    }}
                  >
                    Stock will be deducted from the source and
                    credited to the destination immediately.
                  </div>
                </div>
              )}

            {/* PRODUCTS */}

            <div
              style={{
                marginTop: "28px",
                marginBottom: "14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <h3 style={{ margin: 0 }}>
                Products to Transfer
              </h3>

              <button
                type="button"
                onClick={addTransferItem}
                disabled={
                  !transferSourceId ||
                  loadingTransferProducts ||
                  submittingTransfer
                }
                style={{
                  ...styles.button,
                  ...styles.secondaryButton,
                }}
              >
                + Add Product
              </button>
            </div>

            {loadingTransferProducts ? (
              <p>Loading source branch inventory...</p>
            ) : !transferSourceId ? (
              <p>Select a source branch to load its products.</p>
            ) : transferProducts.length === 0 ? (
              <div style={styles.infoBox}>
                No products were returned for the selected
                source branch.
              </div>
            ) : (
              <div style={styles.tableWrapper}>
                <table
                  style={{
                    ...styles.table,
                    minWidth: "750px",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={styles.th}>Product</th>
                      <th style={styles.th}>Available Stock</th>
                      <th style={styles.th}>Transfer Quantity</th>
                      <th style={styles.th}>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {transferItems.map((item, index) => {
                      const selectedProduct =
                        transferProducts.find(
                          (product) =>
                            String(
                              product.product_id ?? product.id
                            ) === String(item.product_id)
                        );

                      return (
                        <tr key={index}>
                          <td style={styles.td}>
                            <select
                              value={item.product_id}
                              onChange={(event) =>
                                updateTransferItem(
                                  index,
                                  "product_id",
                                  event.target.value
                                )
                              }
                              style={{
                                ...styles.input,
                                minWidth: "230px",
                              }}
                              disabled={submittingTransfer}
                            >
                              <option value="">
                                Select product
                              </option>

                              {transferProducts.map(
                                (product) => {
                                  const productId =
                                    product.product_id ??
                                    product.id;

                                  return (
                                    <option
                                      key={productId}
                                      value={String(productId)}
                                    >
                                      {product.name}
                                    </option>
                                  );
                                }
                              )}
                            </select>
                          </td>

                          <td style={styles.td}>
                            <strong>
                              {selectedProduct
                                ? formatQuantity(
                                    selectedProduct.quantity
                                  )
                                : "—"}
                            </strong>
                          </td>

                          <td style={styles.td}>
                            <input
                              type="number"
                              min="0.001"
                              step="0.001"
                              placeholder="0.000"
                              value={item.quantity}
                              onChange={(event) =>
                                updateTransferItem(
                                  index,
                                  "quantity",
                                  event.target.value
                                )
                              }
                              style={{
                                ...styles.input,
                                maxWidth: "150px",
                              }}
                              disabled={submittingTransfer}
                              aria-label={`Transfer quantity for item ${index + 1}`}
                            />
                          </td>

                          <td style={styles.td}>
                            <button
                              type="button"
                              onClick={() =>
                                removeTransferItem(index)
                              }
                              disabled={submittingTransfer}
                              style={{
                                ...styles.button,
                                ...styles.dangerButton,
                              }}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* NOTES */}

            <div style={{ marginTop: "22px" }}>
              <label
                htmlFor="transfer-notes"
                style={styles.label}
              >
                Transfer Notes (Optional)
              </label>

              <textarea
                id="transfer-notes"
                value={transferNotes}
                onChange={(event) =>
                  setTransferNotes(event.target.value)
                }
                placeholder="Reason for transfer or additional information..."
                rows={3}
                style={{
                  ...styles.input,
                  resize: "vertical",
                }}
                disabled={submittingTransfer}
              />
            </div>

            {/* SUMMARY */}

            <div style={styles.transferSummary}>
              <h3 style={{ marginTop: 0 }}>
                Transfer Summary
              </h3>

              <p>
                <strong>Products:</strong>{" "}
                {totalTransferItems}
              </p>

              <p>
                <strong>Source:</strong>{" "}
                {selectedSourceBranch?.name || "Not selected"}
              </p>

              <p>
                <strong>Destination:</strong>{" "}
                {selectedDestinationBranch?.name ||
                  "Not selected"}
              </p>

              <p
                style={{
                  fontSize: "13px",
                  marginBottom: 0,
                }}
              >
                Quantities support up to three decimal places.
                Transfers are completed immediately and do not
                require receiving confirmation.
              </p>
            </div>

            {/* SUBMIT */}

            <div
              style={{
                marginTop: "22px",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={submitTransfer}
                disabled={
                  submittingTransfer ||
                  loadingTransferProducts ||
                  !transferProducts.length
                }
                style={{
                  ...styles.button,
                  ...styles.primaryButton,
                  padding: "12px 24px",
                  opacity: submittingTransfer ? 0.65 : 1,
                }}
              >
                {submittingTransfer
                  ? "Completing Transfer..."
                  : "Complete Stock Transfer"}
              </button>
            </div>
          </section>

          {/* TRANSFER HISTORY */}

          <section style={styles.card}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                marginBottom: "18px",
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>
                  Transfer History
                </h2>

                <p
                  style={{
                    ...styles.subtitle,
                    margin: "6px 0 0",
                  }}
                >
                  Records of completed interbranch stock
                  transfers.
                </p>
              </div>

              <button
                type="button"
                onClick={loadTransferHistory}
                disabled={loadingTransfers}
                style={{
                  ...styles.button,
                  ...styles.secondaryButton,
                }}
              >
                {loadingTransfers
                  ? "Refreshing..."
                  : "Refresh History"}
              </button>
            </div>

            {loadingTransfers ? (
              <p>Loading transfer history...</p>
            ) : (
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Reference</th>
                      <th style={styles.th}>Source Branch</th>
                      <th style={styles.th}>Destination</th>
                      <th style={styles.th}>Products</th>
                      <th style={styles.th}>Initiated By</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Date</th>
                    </tr>
                  </thead>

                  <tbody>
                    {transferHistory.length === 0 ? (
                      <tr>
                        <td
                          style={styles.td}
                          colSpan={7}
                        >
                          No stock transfers found.
                        </td>
                      </tr>
                    ) : (
                      transferHistory.map((transfer) => (
                        <tr key={transfer.id}>
                          <td style={styles.td}>
                            <strong>
                              {transfer.reference ||
                                transfer.transfer_number ||
                                transfer.transfer_reference ||
                                `#${transfer.id}`}
                            </strong>
                          </td>

                          <td style={styles.td}>
                            {transfer.source_branch_name ||
                              transfer.source_branch?.name ||
                              "—"}
                          </td>

                          <td style={styles.td}>
                            {transfer.destination_branch_name ||
                              transfer.destination_branch?.name ||
                              "—"}
                          </td>

                          <td style={styles.td}>
  {Array.isArray(transfer.items) && transfer.items.length > 0 ? (
    <div>
      {transfer.items.map((item) => (
        <div
          key={item.id || item.product_id}
          style={{ marginBottom: "6px" }}
        >
          <strong>{item.product_name || "Unknown product"}</strong>
          {" — "}
          {formatQuantity(item.quantity)}
        </div>
      ))}
    </div>
  ) : (
    "No product details"
  )}
</td>

<td style={styles.td}>
  {transfer.admin_username || "—"}
</td>
                          <td style={styles.td}>
                            <span style={styles.badge}>
                              {transfer.status || "Completed"}
                            </span>
                          </td>

                          <td style={styles.td}>
                            {transfer.created_at
                              ? new Date(
                                  transfer.created_at
                                ).toLocaleString("en-KE")
                              : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          {loadingSection ? (
            <section style={styles.card}>
              Loading {activeTab}...
            </section>
          ) : (
            <>
              {/* =================================================
                  BRANCH STOCK
              ================================================= */}

              {activeTab === "stock" && (
                <section style={styles.card}>
                  <h2>Branch Inventory</h2>

                  <p style={styles.subtitle}>
                    Stock quantities here belong to this branch
                    only. Changes do not automatically alter
                    another branch's stock.
                  </p>

                  <div
                    style={{
                      marginBottom: "18px",
                      maxWidth: "420px",
                    }}
                  >
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
                                    step="0.001"
                                    value={
                                      stockEdits[productId] !==
                                      undefined
                                        ? stockEdits[productId]
                                        : product.quantity ?? 0
                                    }
                                    onChange={(event) =>
                                      setStockEdits(
                                        (previous) => ({
                                          ...previous,
                                          [productId]:
                                            event.target.value,
                                        })
                                      )
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
                                    onClick={() =>
                                      saveStock(product)
                                    }
                                    disabled={
                                      savingProductId ===
                                      productId
                                    }
                                    style={{
                                      ...styles.button,
                                      ...styles.primaryButton,
                                      opacity:
                                        savingProductId ===
                                        productId
                                          ? 0.65
                                          : 1,
                                    }}
                                  >
                                    {savingProductId ===
                                    productId
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

              {/* =================================================
                  CASHIER ASSIGNMENTS
              ================================================= */}

              {activeTab === "cashiers" && (
                <section style={styles.card}>
                  <h2>Cashier Assignments</h2>

                  <p style={styles.subtitle}>
                    Assign cashiers to a branch. A cashier should
                    work under the branch assigned to their
                    account.
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
                            <td
                              style={styles.td}
                              colSpan={4}
                            >
                              No cashiers were returned by this
                              endpoint.
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
                                      : String(
                                          cashier.branch_id
                                        )
                                  }
                                  onChange={(event) =>
                                    assignCashier(
                                      cashier.id,
                                      event.target.value
                                    )
                                  }
                                  disabled={
                                    assigningCashierId ===
                                    cashier.id
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

                                {assigningCashierId ===
                                  cashier.id && (
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

              {/* =================================================
                  POS SALES
              ================================================= */}

              {activeTab === "sales" && (
                <section style={styles.card}>
                  <h2>POS Sales</h2>

                  <p style={styles.subtitle}>
                    These are cashier POS sales for the selected
                    branch, not website customer orders.
                  </p>

                  <div style={styles.tableWrapper}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Sale Number</th>
                          <th style={styles.th}>Cashier</th>
                          <th style={styles.th}>Total</th>
                          <th style={styles.th}>
                            Payment Method
                          </th>
                          <th style={styles.th}>
                            Payment Status
                          </th>
                          <th style={styles.th}>
                            Sale Status
                          </th>
                          <th style={styles.th}>Date</th>
                        </tr>
                      </thead>

                      <tbody>
                        {sales.length === 0 ? (
                          <tr>
                            <td
                              style={styles.td}
                              colSpan={7}
                            >
                              No POS sales found for this branch.
                            </td>
                          </tr>
                        ) : (
                          sales.map((sale) => (
                            <tr key={sale.id}>
                              <td style={styles.td}>
                                {sale.sale_number ||
                                  `#${sale.id}`}
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
