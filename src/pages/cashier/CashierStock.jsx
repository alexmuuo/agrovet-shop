import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../api/api.js";

const MAX_QUANTITY = 1000000;
const QUANTITY_DECIMAL_PLACES = 3;

function getAuthHeaders() {
  const token = localStorage.getItem("cashierToken");

  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
}

function formatQuantity(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return value ?? "0";

  return number.toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
    useGrouping: false,
  });
}

function formatMoney(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number.toLocaleString("en-KE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "0.00";
}

function createEmptyRow() {
  return {
    id: `${Date.now()}-${Math.random()}`,
    product_id: "",
    quantity: "",
    buying_price: "",
    selling_price: "",
  };
}

function getErrorMessage(error, operation = "processing stock") {
  const status = error.response?.status;
  const message = error.response?.data?.message;

  if (!error.response) {
    return `Network error while ${operation}. Check your connection and backend.`;
  }

  if (status === 401) {
    return "Your cashier session has expired. Please log in again.";
  }

  if (status === 403) {
    return message || "You do not have permission to perform this operation.";
  }

  if (status === 404) {
    return message || "The stock receiving endpoint was not found.";
  }

  if (status === 409) {
    return message || "The stock operation conflicts with the current inventory.";
  }

  if (status >= 500) {
    return message || "The backend encountered an error while processing stock.";
  }

  return message || `Request failed with HTTP ${status}.`;
}

function CashierStock() {
  const [products, setProducts] = useState([]);
  const [branch, setBranch] = useState(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [receipt, setReceipt] = useState(null);

  const [rows, setRows] = useState([createEmptyRow()]);

  const [supplierReference, setSupplierReference] = useState("");
  const [notes, setNotes] = useState("");

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get("/cashier/stock/products", {
        headers: getAuthHeaders(),
      });

      const data = response.data;

      if (
        !data ||
        data.status !== "success" ||
        !Array.isArray(data.products) ||
        !data.branch ||
        data.branch.id == null ||
        !data.branch.name
      ) {
        throw new Error(
          "The inventory endpoint returned an invalid response."
        );
      }

      setProducts(data.products);
      setBranch(data.branch);
    } catch (err) {
      console.error("[Cashier Stock] Inventory loading failed:", err);

      setProducts([]);
      setBranch(null);

      setError(
        err.response
          ? getErrorMessage(err, "loading branch inventory")
          : err.message ||
              getErrorMessage(err, "loading branch inventory")
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const updateRow = (rowId, field, value) => {
    setRows((previous) =>
      previous.map((row) =>
        row.id === rowId
          ? { ...row, [field]: value }
          : row
      )
    );

    setError("");
    setSuccess("");
  };

  const addRow = () => {
    setRows((previous) => [
      ...previous,
      createEmptyRow(),
    ]);

    setError("");
    setSuccess("");
  };

  const removeRow = (rowId) => {
    setRows((previous) =>
      previous.length > 1
        ? previous.filter((row) => row.id !== rowId)
        : previous
    );

    setError("");
    setSuccess("");
  };

  const getSelectedProduct = (row) =>
    products.find(
      (product) => String(product.id) === String(row.product_id)
    );

  const totalQuantity = useMemo(
    () =>
      rows.reduce(
        (total, row) => total + (Number(row.quantity) || 0),
        0
      ),
    [rows]
  );

  const totalBuyingValue = useMemo(
    () =>
      rows.reduce(
        (total, row) =>
          total +
          (Number(row.quantity) || 0) *
            (Number(row.buying_price) || 0),
        0
      ),
    [rows]
  );

  const validateRows = () => {
    if (!rows.length) {
      return "Add at least one product.";
    }

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = index + 1;

      if (!row.product_id) {
        return `Row ${rowNumber}: select a product.`;
      }

      const productId = Number(row.product_id);

      if (!Number.isSafeInteger(productId) || productId <= 0) {
        return `Row ${rowNumber}: invalid product selection.`;
      }

      const quantityText = String(row.quantity).trim();
      const quantity = Number(quantityText);

      if (
        !quantityText ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        quantity > MAX_QUANTITY
      ) {
        return `Row ${rowNumber}: enter a valid quantity greater than zero.`;
      }

      const decimalPart = quantityText.split(".")[1] || "";

      if (decimalPart.length > QUANTITY_DECIMAL_PLACES) {
        return `Row ${rowNumber}: quantity cannot have more than three decimal places.`;
      }

      const buyingPriceText = String(row.buying_price).trim();
      const buyingPrice = Number(buyingPriceText);

      if (
        !buyingPriceText ||
        !Number.isFinite(buyingPrice) ||
        buyingPrice < 0
      ) {
        return `Row ${rowNumber}: enter a valid buying price.`;
      }

      const sellingPriceText = String(row.selling_price).trim();
      const sellingPrice = Number(sellingPriceText);

      if (
        !sellingPriceText ||
        !Number.isFinite(sellingPrice) ||
        sellingPrice < 0
      ) {
        return `Row ${rowNumber}: enter a valid selling price.`;
      }

      if (!getSelectedProduct(row)) {
        return `Row ${rowNumber}: selected product is not available in branch inventory.`;
      }
    }

    if (supplierReference.trim().length > 100) {
      return "Supplier reference cannot exceed 100 characters.";
    }

    if (notes.trim().length > 5000) {
      return "Notes cannot exceed 5,000 characters.";
    }

    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");
    setReceipt(null);

    if (!branch) {
      setError("Your assigned branch could not be verified.");
      return;
    }

    const validationError = validateRows();

    if (validationError) {
      setError(validationError);
      return;
    }

    const items = rows.map((row) => ({
      product_id: Number(row.product_id),
      quantity: Number(row.quantity),
      buying_price: Number(row.buying_price),
      selling_price: Number(row.selling_price),
    }));

    const confirmation = window.confirm(
      `Receive ${items.length} product row(s) at ${branch.name}?\n\n` +
        `Total quantity: ${formatQuantity(totalQuantity)}\n` +
        `Total buying value: KSh ${formatMoney(totalBuyingValue)}\n\n` +
        "Each row will be recorded as a separate stock batch."
    );

    if (!confirmation) return;

    setSubmitting(true);

    try {
      const response = await api.post(
        "/cashier/stock/receive-batch",
        {
          items,
          supplier_reference: supplierReference.trim(),
          notes: notes.trim(),
        },
        {
          headers: getAuthHeaders(),
        }
      );

      if (
        !response.data ||
        response.data.status !== "success" ||
        !response.data.receipt
      ) {
        throw new Error(
          response.data?.message ||
            "The server returned an invalid stock receipt response."
        );
      }

      setReceipt(response.data.receipt);

      setSuccess(
        response.data.message ||
          "All stock entries were successfully received."
      );

      setRows([createEmptyRow()]);
      setSupplierReference("");
      setNotes("");

      await loadProducts();
    } catch (err) {
      console.error("[Cashier Stock] Stock receiving failed:", {
        status: err.response?.status,
        response: err.response?.data,
        message: err.message,
      });

      setError(
        err.response
          ? getErrorMessage(err, "receiving stock")
          : err.message || "Unable to receive stock."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="container py-4 py-lg-5">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <p className="text-success fw-semibold text-uppercase small mb-1">
            Inventory
          </p>

          <h1 className="h2 fw-bold mb-2">Stock Management</h1>

          <p className="text-secondary mb-0">
            Receive multiple products and record their individual
            buying and selling prices.
          </p>

          {branch && (
            <div className="alert alert-info mt-3 mb-0">
              <i className="bi bi-shop me-2" />
              Managing inventory for{" "}
              <strong>{branch.name}</strong>
              {branch.code ? ` (${branch.code})` : ""}.
            </div>
          )}
        </div>

        <button
          type="button"
          className="btn btn-outline-success"
          onClick={loadProducts}
          disabled={loading || submitting}
        >
          <i className="bi bi-arrow-clockwise me-2" />
          Refresh Products
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          <i className="bi bi-exclamation-triangle me-2" />
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success" role="status">
          <i className="bi bi-check-circle me-2" />
          {success}
        </div>
      )}

      {receipt && (
        <div className="card border-success shadow-sm mb-4">
          <div className="card-body p-4">
            <div className="d-flex justify-content-between flex-wrap gap-2 mb-3">
              <div>
                <h2 className="h5 fw-bold text-success mb-1">
                  Stock Receipt Successful
                </h2>

                <p className="text-secondary small mb-0">
                  Reference: {receipt.reference}
                </p>
              </div>

              <span className="badge text-bg-success align-self-start">
                {receipt.number_of_rows} product rows
              </span>
            </div>

            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>BP</th>
                    <th>SP</th>
                    <th>New Stock</th>
                  </tr>
                </thead>

                <tbody>
                  {receipt.items?.map((item, index) => (
                    <tr key={`${item.product_id}-${index}`}>
                      <td className="fw-semibold">
                        {item.product_name}
                      </td>
                      <td>
                        {formatQuantity(item.quantity_received)}
                      </td>
                      <td>KSh {formatMoney(item.buying_price)}</td>
                      <td>KSh {formatMoney(item.selling_price)}</td>
                      <td className="text-success fw-semibold">
                        {formatQuantity(item.new_stock)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="small text-secondary mb-0">
              Branch: {receipt.branch_name}
            </p>
          </div>
        </div>
      )}

      <div className="card border-0 shadow-sm">
        <div className="card-body p-3 p-md-4">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
            <div>
              <h2 className="h5 fw-bold mb-1">
                <i className="bi bi-box-seam text-success me-2" />
                Receive New Stock
              </h2>

              <p className="text-secondary small mb-0">
                Add every product delivered before submitting the receipt.
              </p>
            </div>

            <button
              type="button"
              className="btn btn-outline-success"
              onClick={addRow}
              disabled={loading || submitting || products.length === 0}
            >
              <i className="bi bi-plus-lg me-2" />
              Add Product
            </button>
          </div>

          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-success" />

              <p className="text-secondary mt-3 mb-0">
                Loading branch inventory...
              </p>
            </div>
          ) : !branch ? (
            <div className="alert alert-warning">
              Your branch inventory could not be loaded.
            </div>
          ) : products.length === 0 ? (
            <div className="alert alert-info">
              No products are available in your branch inventory.
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {rows.map((row, index) => {
                const selectedProduct = getSelectedProduct(row);

                const currentStock = Number(
                  selectedProduct?.stock || 0
                );

                const quantity = Number(row.quantity) || 0;

                return (
                  <div
                    key={row.id}
                    className="border rounded-3 p-3 mb-3"
                  >
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <h3 className="h6 fw-bold mb-0">
                        Product {index + 1}
                      </h3>

                      {rows.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => removeRow(row.id)}
                          disabled={submitting}
                        >
                          <i className="bi bi-trash me-1" />
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="row g-3">
                      <div className="col-12">
                        <label className="form-label fw-semibold">
                          Product *
                        </label>

                        <select
                          className="form-select"
                          value={row.product_id}
                          onChange={(event) =>
                            updateRow(
                              row.id,
                              "product_id",
                              event.target.value
                            )
                          }
                          required
                          disabled={submitting}
                        >
                          <option value="">Select a product</option>

                          {products.map((product) => (
                            <option
                              key={product.id}
                              value={product.id}
                            >
                              {product.name} — Stock:{" "}
                              {formatQuantity(product.stock)}{" "}
                              {product.unit || ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      {selectedProduct && (
                        <div className="col-12">
                          <div className="bg-light rounded p-2 small">
                            <span className="text-secondary">
                              Current branch stock:{" "}
                            </span>

                            <strong>
                              {formatQuantity(currentStock)}{" "}
                              {selectedProduct.unit || ""}
                            </strong>

                            {quantity > 0 && (
                              <>
                                <span className="text-secondary mx-2">
                                  →
                                </span>

                                <span className="text-success fw-semibold">
                                  {formatQuantity(currentStock + quantity)}{" "}
                                  {selectedProduct.unit || ""}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="col-12 col-md-4">
                        <label className="form-label fw-semibold">
                          Quantity Received *
                        </label>

                        <input
                          type="number"
                          className="form-control"
                          min="0.001"
                          max={MAX_QUANTITY}
                          step="0.001"
                          inputMode="decimal"
                          placeholder="e.g. 10.5"
                          value={row.quantity}
                          onChange={(event) =>
                            updateRow(
                              row.id,
                              "quantity",
                              event.target.value
                            )
                          }
                          required
                          disabled={submitting}
                        />
                      </div>

                      <div className="col-12 col-md-4">
                        <label className="form-label fw-semibold">
                          Buying Price (KSh) *
                        </label>

                        <input
                          type="number"
                          className="form-control"
                          min="0"
                          step="0.01"
                          placeholder="e.g. 350"
                          value={row.buying_price}
                          onChange={(event) =>
                            updateRow(
                              row.id,
                              "buying_price",
                              event.target.value
                            )
                          }
                          required
                          disabled={submitting}
                        />
                      </div>

                      <div className="col-12 col-md-4">
                        <label className="form-label fw-semibold">
                          Selling Price (KSh) *
                        </label>

                        <input
                          type="number"
                          className="form-control"
                          min="0"
                          step="0.01"
                          placeholder="e.g. 450"
                          value={row.selling_price}
                          onChange={(event) =>
                            updateRow(
                              row.id,
                              "selling_price",
                              event.target.value
                            )
                          }
                          required
                          disabled={submitting}
                        />
                      </div>

                      {row.quantity &&
                        row.buying_price &&
                        Number(row.quantity) > 0 && (
                          <div className="col-12">
                            <div className="small text-secondary">
                              Batch buying value:{" "}
                              <strong className="text-dark">
                                KSh{" "}
                                {formatMoney(
                                  Number(row.quantity) *
                                    Number(row.buying_price)
                                )}
                              </strong>
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                );
              })}

              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
                <button
                  type="button"
                  className="btn btn-outline-success"
                  onClick={addRow}
                  disabled={submitting}
                >
                  <i className="bi bi-plus-circle me-2" />
                  Add Another Product
                </button>

                <span className="badge text-bg-light border text-dark">
                  {rows.length} product row(s)
                </span>
              </div>

              <div className="card bg-light border-0 mb-4">
                <div className="card-body">
                  <h3 className="h6 fw-bold mb-3">
                    Delivery Information
                  </h3>

                  <div className="mb-3">
                    <label className="form-label fw-semibold">
                      Supplier / Delivery Reference
                    </label>

                    <input
                      type="text"
                      className="form-control"
                      maxLength="100"
                      placeholder="e.g. SUP-2026-001"
                      value={supplierReference}
                      onChange={(event) =>
                        setSupplierReference(event.target.value)
                      }
                      disabled={submitting}
                    />
                  </div>

                  <div>
                    <label className="form-label fw-semibold">
                      Notes
                    </label>

                    <textarea
                      className="form-control"
                      rows="3"
                      maxLength="5000"
                      placeholder="Optional delivery notes..."
                      value={notes}
                      onChange={(event) =>
                        setNotes(event.target.value)
                      }
                      disabled={submitting}
                    />
                  </div>
                </div>
              </div>

              <div className="card border-success mb-4">
                <div className="card-body">
                  <h3 className="h6 fw-bold mb-3">
                    Receipt Summary
                  </h3>

                  <div className="d-flex justify-content-between mb-2">
                    <span className="text-secondary">
                      Product rows
                    </span>

                    <strong>{rows.length}</strong>
                  </div>

                  <div className="d-flex justify-content-between mb-2">
                    <span className="text-secondary">
                      Total quantity
                    </span>

                    <strong>{formatQuantity(totalQuantity)}</strong>
                  </div>

                  <div className="d-flex justify-content-between">
                    <span className="text-secondary">
                      Total buying value
                    </span>

                    <strong className="text-success">
                      KSh {formatMoney(totalBuyingValue)}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="alert alert-warning small">
                <i className="bi bi-shield-check me-2" />
                Every product row will create a separate stock batch
                with its own buying and selling prices. All rows are
                submitted together in one transaction.
              </div>

              <button
                type="submit"
                className="btn btn-success btn-lg w-100"
                disabled={submitting || !branch}
              >
                {submitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    Receiving Stock...
                  </>
                ) : (
                  <>
                    <i className="bi bi-check-circle me-2" />
                    Add New Stock
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="card border-0 shadow-sm mt-4">
        <div className="card-body p-4">
          <h2 className="h5 fw-bold mb-3">
            <i className="bi bi-boxes text-success me-2" />
            Current Branch Stock
          </h2>

          {loading ? (
            <p className="text-secondary">Loading inventory...</p>
          ) : products.length === 0 ? (
            <p className="text-secondary">
              No inventory available.
            </p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Current Stock</th>
                    <th>Unit</th>
                  </tr>
                </thead>

                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td className="fw-semibold">
                        {product.name}
                      </td>

                      <td>{product.category || "—"}</td>

                      <td>
                        <span
                          className={`badge ${
                            Number(product.stock) <= 5
                              ? "text-bg-warning"
                              : "text-bg-success"
                          }`}
                        >
                          {formatQuantity(product.stock)}
                        </span>
                      </td>

                      <td>{product.unit || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default CashierStock;
