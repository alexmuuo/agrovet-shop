import { useCallback, useEffect, useMemo, useState } from "react";
import api from "./api/api";

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

  if (!Number.isFinite(number)) {
    return value ?? "0";
  }

  return number.toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: QUANTITY_DECIMAL_PLACES,
    useGrouping: false,
  });
}

function getErrorMessage(error, operation = "loading inventory") {
  const status = error.response?.status;
  const data = error.response?.data;
  const serverMessage =
    typeof data?.message === "string" ? data.message.trim() : "";

  if (!error.response) {
    return (
      `Network error while ${operation}. ` +
      "No HTTP response was received. Check the API base URL, " +
      "backend availability, and browser Network tab."
    );
  }

  if (status === 401) {
    return (
      `Authentication failed while ${operation} (HTTP 401). ` +
      "The cashier token may be missing, invalid, or expired. " +
      "Log out and sign in again."
    );
  }

  if (status === 403) {
    return (
      `Permission denied while ${operation} (HTTP 403). ` +
      (serverMessage
        ? `Backend message: ${serverMessage}`
        : "The backend rejected the request without a message. " +
          "Check the cashier's permissions and branch-validation logic.")
    );
  }

  if (status === 404) {
    return (
      `API endpoint not found while ${operation} (HTTP 404). ` +
      "Check the API base URL, deployed backend version, and route registration."
    );
  }

  if (status === 409) {
    return (
      `Conflict while ${operation} (HTTP 409). ` +
      (serverMessage || "The request conflicts with the current inventory state.")
    );
  }

  if (status === 422) {
    return (
      `Validation failed while ${operation} (HTTP 422). ` +
      (serverMessage || "The backend rejected the supplied data.")
    );
  }

  if (status === 429) {
    return (
      `Too many requests while ${operation} (HTTP 429). ` +
      "Wait briefly before trying again."
    );
  }

  if (status >= 500) {
    return (
      `Backend error while ${operation} (HTTP ${status}). ` +
      (serverMessage ||
        "The server failed without providing a useful error message. " +
        "Inspect the deployed backend logs.")
    );
  }

  return (
    `Request failed while ${operation} (HTTP ${status}). ` +
    (serverMessage || "Inspect the browser Network tab for the response.")
  );
}

function logDiagnostic(operation, error, extra = {}) {
  console.error(`[Cashier Stock] ${operation}`, {
    endpoint: error.config?.url || "Unknown endpoint",
    method: error.config?.method?.toUpperCase() || "Unknown method",
    httpStatus: error.response?.status ?? null,
    responseData: error.response?.data ?? null,
    responseHeaders: error.response?.headers ?? null,
    errorMessage: error.message,
    ...extra,
  });
}

function getResponseProblem(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return (
      "The inventory endpoint returned an invalid response. " +
      "Expected a JSON object containing status, products, and branch."
    );
  }

  if (data.status !== "success") {
    return (
      "The inventory endpoint returned an unexpected status. " +
      `Received status: ${String(data.status ?? "missing")}. ` +
      "Expected status: success."
    );
  }

  if (!Array.isArray(data.products)) {
    return (
      "The inventory endpoint returned an invalid products field. " +
      "Expected products to be an array."
    );
  }

  if (!data.branch || typeof data.branch !== "object") {
    const availableKeys = Object.keys(data).join(", ") || "none";

    return (
      "The inventory endpoint returned products but no valid branch object. " +
      `Response fields received: ${availableKeys}. ` +
      "Check the GET /cashier/stock/products response and its branch serialization."
    );
  }

  if (data.branch.id == null || !data.branch.name) {
    return (
      "The inventory endpoint returned an incomplete branch object. " +
      "The branch must include an id and name. " +
      "Check the backend branch serializer."
    );
  }

  return "";
}

function CashierStock() {
  const [products, setProducts] = useState([]);
  const [branch, setBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lastMovement, setLastMovement] = useState(null);

  const [form, setForm] = useState({
    product_id: "",
    quantity: "",
    reference: "",
    notes: "",
  });

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get("/cashier/stock/products", {
        headers: getAuthHeaders(),
      });

      const data = response.data;
      const responseProblem = getResponseProblem(data);

      if (responseProblem) {
        console.error("[Cashier Stock] Invalid inventory response", {
          endpoint: "/cashier/stock/products",
          httpStatus: response.status,
          responseData: data,
          responseHeaders: response.headers,
          responseProblem,
        });

        setProducts([]);
        setBranch(null);
        setError(responseProblem);
        return;
      }

      setProducts(data.products);
      setBranch(data.branch);

      if (data.products.length === 0) {
        setError(
          "The assigned branch was confirmed, but its inventory contains no products. " +
          "Check BranchProductStock records for this branch."
        );
      }
    } catch (err) {
      logDiagnostic("Failed to load branch inventory", err);

      setProducts([]);
      setBranch(null);
      setError(getErrorMessage(err, "loading branch inventory"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const selectedProduct = useMemo(
    () =>
      products.find(
        (product) =>
          String(product.id) === String(form.product_id)
      ),
    [products, form.product_id]
  );

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
    setSuccess("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");
    setLastMovement(null);

    if (!branch) {
      setError(
        "Stock addition stopped before sending a request: no valid branch " +
        "was loaded. Resolve the inventory-loading error first."
      );
      return;
    }

    const productId = Number(form.product_id);
    const quantityText = form.quantity.trim();
    const quantity = Number(quantityText);

    if (!Number.isSafeInteger(productId) || productId <= 0) {
      setError("Invalid product selection. Select a valid product.");
      return;
    }

    if (
      quantityText === "" ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      setError("Invalid quantity. Enter a number greater than zero.");
      return;
    }

    if (quantity > MAX_QUANTITY) {
      setError("Quantity exceeds the maximum permitted value of 1,000,000.");
      return;
    }

    const decimalPart = quantityText.split(".")[1] || "";

    if (decimalPart.length > QUANTITY_DECIMAL_PLACES) {
      setError(
        "Quantity precision error. Use no more than three decimal places, " +
        "for example 0.5, 1.25, or 2.375."
      );
      return;
    }

    if (form.reference.trim().length > 150) {
      setError("Reference validation failed: maximum length is 150 characters.");
      return;
    }

    if (form.notes.trim().length > 5000) {
      setError("Notes validation failed: maximum length is 5,000 characters.");
      return;
    }

    if (!selectedProduct) {
      setError(
        "Product selection error. The selected product is not present " +
        "in the currently loaded branch inventory. Refresh and try again."
      );
      return;
    }

    const currentStock = Number(selectedProduct.stock);

    if (!Number.isFinite(currentStock) || currentStock < 0) {
      setError(
        "Inventory data error. The selected product has an invalid stock quantity. " +
        "Inspect its BranchProductStock record and backend serialization."
      );
      return;
    }

    const newStock = currentStock + quantity;

    const confirmed = window.confirm(
      `Add ${formatQuantity(quantity)} ${
        selectedProduct.unit || "units"
      } to ${selectedProduct.name} at ${branch.name}?\n\n` +
      `Current branch stock: ${formatQuantity(currentStock)}\n` +
      `New stock after addition: ${formatQuantity(newStock)}`
    );

    if (!confirmed) {
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.post(
        "/cashier/stock/add",
        {
          product_id: productId,
          quantity,
          reference: form.reference.trim(),
          notes: form.notes.trim(),
        },
        {
          headers: getAuthHeaders(),
        }
      );

      if (
        !response.data ||
        typeof response.data !== "object" ||
        response.data.status !== "success"
      ) {
        console.error("[Cashier Stock] Unexpected stock-add response", {
          endpoint: "/cashier/stock/add",
          httpStatus: response.status,
          responseData: response.data,
        });

        setError(
          "The stock-add request returned HTTP " +
          `${response.status}, but the response did not contain ` +
          'the expected status "success". Verify the backend response ' +
          "before attempting another addition."
        );

        return;
      }

      setSuccess(
        response.data.message ||
        "Stock addition was accepted by the backend."
      );

      setLastMovement(response.data.movement || null);

      setForm({
        product_id: "",
        quantity: "",
        reference: "",
        notes: "",
      });

      await loadProducts();
    } catch (err) {
      logDiagnostic("Failed to add branch stock", err, {
        productId,
        quantity,
        branchId: branch.id,
      });

      setError(getErrorMessage(err, "adding branch stock"));
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
            Receive stock for your assigned branch and automatically
            record who performed each addition.
          </p>

          {branch && (
            <div className="alert alert-info mt-3 mb-0">
              <i className="bi bi-shop me-2" />
              Managing inventory for <strong>{branch.name}</strong>
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

      {lastMovement && (
        <div className="card border-success shadow-sm mb-4">
          <div className="card-body">
            <h2 className="h6 fw-bold text-success">
              <i className="bi bi-check-circle-fill me-2" />
              Stock Addition Recorded
            </h2>

            <div className="row g-3">
              <div className="col-6 col-md-3">
                <div className="small text-secondary">Product</div>
                <div className="fw-semibold">
                  {lastMovement.product_name || "—"}
                </div>
              </div>

              <div className="col-6 col-md-3">
                <div className="small text-secondary">Previous Stock</div>
                <div className="fw-semibold">
                  {formatQuantity(lastMovement.previous_stock)}
                </div>
              </div>

              <div className="col-6 col-md-3">
                <div className="small text-secondary">Quantity Added</div>
                <div className="fw-semibold text-success">
                  +{formatQuantity(lastMovement.quantity_added)}
                </div>
              </div>

              <div className="col-6 col-md-3">
                <div className="small text-secondary">New Stock</div>
                <div className="fw-semibold">
                  {formatQuantity(lastMovement.new_stock)}
                </div>
              </div>
            </div>

            {branch && (
              <p className="small text-secondary mt-3 mb-0">
                Branch: {branch.name}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="row g-4">
        <div className="col-12 col-lg-7">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body p-4">
              <h2 className="h5 fw-bold mb-4">
                <i className="bi bi-box-seam text-success me-2" />
                Record Stock Received
              </h2>

              {loading ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-success" role="status">
                    <span className="visually-hidden">
                      Loading products...
                    </span>
                  </div>

                  <p className="text-secondary mt-3 mb-0">
                    Loading your branch inventory...
                  </p>
                </div>
              ) : !branch ? (
                <div className="alert alert-warning mb-0">
                  <i className="bi bi-exclamation-triangle me-2" />
                  Inventory loading failed. Read the detailed error above
                  to identify whether authentication, branch resolution,
                  response formatting, or the backend is responsible.
                </div>
              ) : products.length === 0 ? (
                <div className="alert alert-info mb-0">
                  Your branch was confirmed, but no products are available
                  in its inventory.
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label
                      htmlFor="stockProduct"
                      className="form-label fw-semibold"
                    >
                      Product <span className="text-danger">*</span>
                    </label>

                    <select
                      id="stockProduct"
                      name="product_id"
                      className="form-select"
                      value={form.product_id}
                      onChange={handleChange}
                      required
                      disabled={submitting}
                    >
                      <option value="">Select a product</option>

                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} — Stock:{" "}
                          {formatQuantity(product.stock)}{" "}
                          {product.unit || ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedProduct && (
                    <div className="rounded bg-light p-3 mb-3">
                      <div className="d-flex justify-content-between gap-3">
                        <span className="text-secondary">
                          Current branch stock
                        </span>

                        <strong>
                          {formatQuantity(selectedProduct.stock)}{" "}
                          {selectedProduct.unit || ""}
                        </strong>
                      </div>

                      <div className="d-flex justify-content-between gap-3 mt-2">
                        <span className="text-secondary">Category</span>
                        <span className="fw-semibold">
                          {selectedProduct.category || "Uncategorized"}
                        </span>
                      </div>

                      <div className="d-flex justify-content-between gap-3 mt-2">
                        <span className="text-secondary">Branch</span>
                        <span className="fw-semibold">{branch.name}</span>
                      </div>

                      {form.quantity !== "" &&
                        Number.isFinite(Number(form.quantity)) &&
                        Number(form.quantity) > 0 && (
                          <div className="d-flex justify-content-between gap-3 mt-2 pt-2 border-top">
                            <span className="text-secondary">
                              Stock after addition
                            </span>

                            <strong className="text-success">
                              {formatQuantity(
                                Number(selectedProduct.stock || 0) +
                                  Number(form.quantity)
                              )}{" "}
                              {selectedProduct.unit || ""}
                            </strong>
                          </div>
                        )}
                    </div>
                  )}

                  <div className="mb-3">
                    <label
                      htmlFor="stockQuantity"
                      className="form-label fw-semibold"
                    >
                      Quantity Received{" "}
                      <span className="text-danger">*</span>
                    </label>

                    <input
                      id="stockQuantity"
                      name="quantity"
                      type="number"
                      className="form-control"
                      min="0.001"
                      max={MAX_QUANTITY}
                      step="0.001"
                      inputMode="decimal"
                      placeholder="e.g. 0.5, 1, 1.25"
                      value={form.quantity}
                      onChange={handleChange}
                      required
                      disabled={submitting}
                    />

                    <div className="form-text">
                      Enter a positive quantity with up to three decimal
                      places, for example 0.5, 1.25 or 2.375.
                    </div>
                  </div>

                  <div className="mb-3">
                    <label
                      htmlFor="stockReference"
                      className="form-label fw-semibold"
                    >
                      Supplier / Delivery Reference
                    </label>

                    <input
                      id="stockReference"
                      name="reference"
                      type="text"
                      className="form-control"
                      maxLength="150"
                      placeholder="e.g. SUP-2026-001"
                      value={form.reference}
                      onChange={handleChange}
                      disabled={submitting}
                    />
                  </div>

                  <div className="mb-4">
                    <label
                      htmlFor="stockNotes"
                      className="form-label fw-semibold"
                    >
                      Notes
                    </label>

                    <textarea
                      id="stockNotes"
                      name="notes"
                      className="form-control"
                      rows="3"
                      maxLength="5000"
                      placeholder="Optional notes about the delivery..."
                      value={form.notes}
                      onChange={handleChange}
                      disabled={submitting}
                    />
                  </div>

                  <div className="alert alert-warning small">
                    <i className="bi bi-shield-check me-2" />
                    Stock additions are validated by the backend and
                    recorded against the authenticated cashier.
                  </div>

                  <button
                    type="submit"
                    className="btn btn-success w-100 py-2"
                    disabled={submitting || !selectedProduct}
                  >
                    {submitting ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                          aria-hidden="true"
                        />
                        Recording Stock...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-plus-circle me-2" />
                        Add Stock
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-5">
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-body p-4">
              <h2 className="h5 fw-bold mb-3">
                <i className="bi bi-shield-check text-success me-2" />
                Stock Accountability
              </h2>

              <ul className="list-unstyled mb-0">
                <li className="d-flex gap-2 mb-3">
                  <i className="bi bi-check-circle-fill text-success mt-1" />
                  <span>
                    Each addition is linked to the authenticated cashier.
                  </span>
                </li>

                <li className="d-flex gap-2 mb-3">
                  <i className="bi bi-check-circle-fill text-success mt-1" />
                  <span>
                    Previous and new stock quantities are recorded.
                  </span>
                </li>

                <li className="d-flex gap-2 mb-3">
                  <i className="bi bi-check-circle-fill text-success mt-1" />
                  <span>
                    Supplier references and notes can be saved.
                  </span>
                </li>

                <li className="d-flex gap-2">
                  <i className="bi bi-check-circle-fill text-success mt-1" />
                  <span>
                    Failed transactions should be rolled back by the backend.
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div className="card border-0 shadow-sm">
            <div className="card-body p-4">
              <h2 className="h5 fw-bold mb-2">
                <i className="bi bi-clock-history text-success me-2" />
                Stock History
              </h2>

              <p className="text-secondary mb-3">
                Review previous stock additions, quantities, timestamps,
                and references.
              </p>

              <a
                href="/cashier/stock-history"
                className="btn btn-outline-success w-100"
              >
                View My Stock History
                <i className="bi bi-arrow-right ms-2" />
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="card border-0 shadow-sm mt-4">
        <div className="card-body p-4">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
            <div>
              <h2 className="h5 fw-bold mb-1">Current Branch Stock</h2>

              <p className="text-secondary small mb-0">
                Inventory quantities for active products at your assigned
                branch.
              </p>
            </div>

            <span className="badge text-bg-success">
              {products.length} products
            </span>
          </div>

          {loading ? (
            <p className="text-secondary mb-0">
              Loading branch inventory...
            </p>
          ) : products.length === 0 ? (
            <p className="text-secondary mb-0">
              No branch inventory is currently available.
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
                      <td className="fw-semibold">{product.name}</td>
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

