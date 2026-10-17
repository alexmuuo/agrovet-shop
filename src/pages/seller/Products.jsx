import { useEffect, useRef, useState } from "react";
import api from "../../api/api";

function Products() {
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageError, setImageError] = useState("");

  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    name: "",
    category: "",
    description: "",
    buying_price: "",
    price: "",
    unit: "",
    stock: "",
    branch_id: "",
    initial_branch_stock: "",
    image: "",
  });

  const toInputValue = (value) => {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value);
  };

  const formatMoney = (value) => {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
      return "0.00";
    }

    return amount.toLocaleString("en-KE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);

      const response = await api.get("/products");
      const data = response.data;

      const fetchedProducts = Array.isArray(data)
        ? data
        : Array.isArray(data?.products)
        ? data.products
        : Array.isArray(data?.data)
        ? data.data
        : [];

      setProducts(fetchedProducts);
    } catch (error) {
      console.error("Failed to fetch products:", error);

      alert(
        error.response?.data?.message ||
          "Failed to load products. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      setLoadingBranches(true);

      const response = await api.get("/admin/branches");
      const data = response.data;

      const fetchedBranches = Array.isArray(data)
        ? data
        : Array.isArray(data?.branches)
        ? data.branches
        : Array.isArray(data?.data)
        ? data.data
        : [];

      const activeBranches = fetchedBranches.filter(
        (branch) =>
          branch.is_active === true ||
          branch.is_active === 1 ||
          branch.is_active === "true"
      );

      setBranches(activeBranches);

      setFormData((previous) => {
        const selectedBranchExists = activeBranches.some(
          (branch) =>
            String(branch.id) === String(previous.branch_id)
        );

        return {
          ...previous,
          branch_id: selectedBranchExists
            ? previous.branch_id
            : activeBranches.length === 1
            ? String(activeBranches[0].id)
            : "",
        };
      });
    } catch (error) {
      console.error("Failed to fetch branches:", error);

      setBranches([]);

      alert(
        error.response?.data?.message ||
          "Failed to load branches. Check your admin access and try again."
      );
    } finally {
      setLoadingBranches(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (name === "image" && !selectedImage) {
      setImagePreview(value.trim());
      setImageError("");
    }
  };

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setImageError("");

    if (!file.type.startsWith("image/")) {
      setImageError("Please select a valid image file.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImageError(
        "The image is too large. Please select an image under 5 MB."
      );
      event.target.value = "";
      return;
    }

    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
    setImageError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setImagePreview(toInputValue(formData.image).trim());
  };

  const resetForm = () => {
    setFormData({
      name: "",
      category: "",
      description: "",
      buying_price: "",
      price: "",
      unit: "",
      stock: "",
      branch_id:
        branches.length === 1 ? String(branches[0].id) : "",
      initial_branch_stock: "",
      image: "",
    });

    setSelectedImage(null);
    setImagePreview("");
    setImageError("");
    setEditingProduct(null);
    setShowForm(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const openAddForm = async () => {
    resetForm();
    setShowForm(true);

    await fetchBranches();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (saving) {
      return;
    }

    const name = toInputValue(formData.name).trim();
    const category = toInputValue(formData.category).trim();
    const description = toInputValue(formData.description);
    const unit = toInputValue(formData.unit).trim();

    const priceText = toInputValue(formData.price).trim();
    const buyingPriceText = toInputValue(
      formData.buying_price
    ).trim();
    const stockText = toInputValue(formData.stock).trim();

    const sellingPrice = Number(priceText);

    const buyingPrice =
      buyingPriceText === "" ? null : Number(buyingPriceText);

    const stock = Number(stockText);

    if (!name || !category) {
      alert("Please enter the product name and category.");
      return;
    }

    if (!unit) {
      alert("Please enter the product unit.");
      return;
    }

    if (
      priceText === "" ||
      !Number.isFinite(sellingPrice) ||
      sellingPrice < 0
    ) {
      alert("Please enter a valid, non-negative selling price.");
      return;
    }

    if (
      buyingPrice !== null &&
      (!Number.isFinite(buyingPrice) || buyingPrice < 0)
    ) {
      alert("Please enter a valid, non-negative buying price.");
      return;
    }

    if (!editingProduct && buyingPrice === null) {
      alert("Please enter the buying price for this product.");
      return;
    }

    if (
      stockText === "" ||
      !Number.isFinite(stock) ||
      stock < 0 ||
      !Number.isInteger(stock)
    ) {
      alert("General stock must be a non-negative whole number.");
      return;
    }

    let branchId = null;
    let initialBranchStock = null;

    if (!editingProduct) {
      const branchIdText = toInputValue(formData.branch_id).trim();
      const branchStockText = toInputValue(
        formData.initial_branch_stock
      ).trim();

      branchId = Number(branchIdText);
      initialBranchStock = Number(branchStockText);

      if (
        branchIdText === "" ||
        !Number.isInteger(branchId) ||
        branchId <= 0
      ) {
        alert("Please select a branch for this product.");
        return;
      }

      if (
        !branches.some(
          (branch) =>
            String(branch.id) === String(formData.branch_id)
        )
      ) {
        alert("The selected branch is unavailable. Please select an active branch.");
        return;
      }

      if (
        branchStockText === "" ||
        !Number.isFinite(initialBranchStock) ||
        initialBranchStock < 0 ||
        !Number.isInteger(initialBranchStock)
      ) {
        alert(
          "Initial branch stock must be a non-negative whole number."
        );
        return;
      }
    }

    try {
      setSaving(true);

      const productData = new FormData();

      productData.append("name", name);
      productData.append("category", category);
      productData.append("description", description);
      productData.append("price", String(sellingPrice));
      productData.append("unit", unit);
      productData.append("stock", String(stock));
      productData.append(
        "image",
        toInputValue(formData.image).trim()
      );

      if (buyingPrice !== null) {
        productData.append("buying_price", String(buyingPrice));
      }

      if (selectedImage) {
        productData.append("image_file", selectedImage);
      }

      if (editingProduct) {
        await api.put(
          `/products/${editingProduct.id}`,
          productData
        );

        alert("Product updated successfully.");
      } else {
        productData.append("branch_id", String(branchId));
        productData.append(
          "initial_branch_stock",
          String(initialBranchStock)
        );

        await api.post("/products", productData);

        alert(
          "Product and initial branch stock added successfully."
        );
      }

      resetForm();
      await fetchProducts();
    } catch (error) {
      console.error("Failed to save product:", error);

      alert(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to save product. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (product) => {
    if (!product || product.id === null || product.id === undefined) {
      alert("Unable to edit this product because its ID is missing.");
      return;
    }

    setEditingProduct(product);

    setFormData({
      name: toInputValue(product.name),
      category: toInputValue(product.category),
      description: toInputValue(product.description),
      buying_price: toInputValue(product.buying_price),
      price: toInputValue(product.price),
      unit: toInputValue(product.unit),
      stock: toInputValue(product.stock),
      branch_id: "",
      initial_branch_stock: "",
      image: toInputValue(product.image),
    });

    setSelectedImage(null);
    setImagePreview(toInputValue(product.image));
    setImageError("");
    setShowForm(true);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDeactivate = async (product) => {
    const confirmed = window.confirm(
      `Are you sure you want to deactivate "${product.name}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.delete(`/products/${product.id}`);

      alert("Product deactivated successfully.");

      await fetchProducts();
    } catch (error) {
      console.error("Failed to deactivate product:", error);

      alert(
        error.response?.data?.message ||
          "Failed to deactivate product."
      );
    }
  };

  const buyingPriceText = toInputValue(
    formData.buying_price
  ).trim();

  const sellingPriceText = toInputValue(formData.price).trim();

  const hasValidPrices =
    buyingPriceText !== "" &&
    sellingPriceText !== "" &&
    Number.isFinite(Number(buyingPriceText)) &&
    Number.isFinite(Number(sellingPriceText));

  const grossProfitPreview = hasValidPrices
    ? Number(sellingPriceText) - Number(buyingPriceText)
    : null;

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="fw-bold mb-1">Product Management</h2>

          <p className="text-muted mb-0">
            Manage products, buying costs, selling prices and stock.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-success"
          onClick={openAddForm}
        >
          <i className="bi bi-plus-lg me-2"></i>
          Add Product
        </button>
      </div>

      {showForm && (
        <div className="card shadow-sm mb-4">
          <div className="card-body p-4">
            <h5 className="fw-bold mb-4">
              {editingProduct ? "Edit Product" : "Add New Product"}
            </h5>

            <form onSubmit={handleSubmit}>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label">Product Name</label>

                  <input
                    type="text"
                    name="name"
                    className="form-control"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label">Category</label>

                  <input
                    type="text"
                    name="category"
                    className="form-control"
                    value={formData.category}
                    onChange={handleChange}
                    placeholder="e.g. whiskey, beer, wine, spirits"
                    required
                  />
                </div>

                <div className="col-md-4">
                  <label className="form-label">
                    Buying Price (KSh)
                  </label>

                  <input
                    type="number"
                    name="buying_price"
                    className="form-control"
                    value={formData.buying_price}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    placeholder="Cost to the business"
                    required={!editingProduct}
                  />

                  <small className="text-muted">
                    Cost of purchasing one unit.
                  </small>
                </div>

                <div className="col-md-4">
                  <label className="form-label">
                    Selling Price (KSh)
                  </label>

                  <input
                    type="number"
                    name="price"
                    className="form-control"
                    value={formData.price}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    required
                  />

                  <small className="text-muted">
                    Price charged to customers.
                  </small>
                </div>

                <div className="col-md-4">
                  <label className="form-label">Unit</label>

                  <input
                    type="text"
                    name="unit"
                    className="form-control"
                    value={formData.unit}
                    onChange={handleChange}
                    placeholder="e.g. 750ml, 1L, 500g, 1 pack"
                    required
                  />
                </div>

                <div className="col-md-4">
                  <label className="form-label">
                    General Product Stock
                  </label>

                  <input
                    type="number"
                    name="stock"
                    className="form-control"
                    value={formData.stock}
                    onChange={handleChange}
                    min="0"
                    step="1"
                    required
                  />

                  <small className="text-muted">
                    General product inventory; separate from branch stock.
                  </small>
                </div>

                {!editingProduct && (
                  <>
                    <div className="col-md-4">
                      <label className="form-label">
                        Branch <span className="text-danger">*</span>
                      </label>

                      <select
                        name="branch_id"
                        className="form-select"
                        value={formData.branch_id}
                        onChange={handleChange}
                        disabled={loadingBranches || saving}
                        required
                      >
                        <option value="">
                          {loadingBranches
                            ? "Loading branches..."
                            : "Select a branch"}
                        </option>

                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                            {branch.code ? ` (${branch.code})` : ""}
                          </option>
                        ))}
                      </select>

                      {!loadingBranches && branches.length === 0 && (
                        <small className="text-danger d-block mt-1">
                          No active branches found. Check your branch setup
                          and admin access.
                        </small>
                      )}
                    </div>

                    <div className="col-md-4">
                      <label className="form-label">
                        Initial Branch Stock{" "}
                        <span className="text-danger">*</span>
                      </label>

                      <input
                        type="number"
                        name="initial_branch_stock"
                        className="form-control"
                        value={formData.initial_branch_stock}
                        onChange={handleChange}
                        min="0"
                        step="1"
                        placeholder="Quantity available at this branch"
                        required
                      />

                      <small className="text-muted">
                        Stock available to sell at the selected branch's POS.
                      </small>
                    </div>

                    <div className="col-12">
                      <div className="alert alert-info mb-0">
                        <i className="bi bi-info-circle me-2"></i>
                        The selected branch receives the initial branch
                        stock. Other branches will not receive stock
                        automatically.
                      </div>
                    </div>
                  </>
                )}

                <div className={editingProduct ? "col-md-8" : "col-md-12"}>
                  <label className="form-label">
                    Gross Profit per Unit
                  </label>

                  <div className="form-control bg-light">
                    {grossProfitPreview !== null
                      ? `KSh ${formatMoney(grossProfitPreview)}`
                      : "Enter both prices to calculate"}
                  </div>

                  <small className="text-muted">
                    Selling price minus buying price. This is not net profit.
                  </small>
                </div>

                <div className="col-12">
                  <label className="form-label">Description</label>

                  <textarea
                    name="description"
                    className="form-control"
                    rows="3"
                    value={formData.description}
                    onChange={handleChange}
                  />
                </div>

                <div className="col-12">
                  <label className="form-label fw-semibold">
                    Upload Product Image
                  </label>

                  <div className="border rounded-3 p-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="form-control"
                      onChange={handleImageSelect}
                    />

                    <small className="text-muted d-block mt-2">
                      Supported formats: JPG, PNG, WEBP and GIF.
                      Maximum size: 5 MB.
                    </small>

                    {selectedImage && (
                      <div className="mt-2 small text-success">
                        <i className="bi bi-check-circle me-1"></i>
                        Selected: {selectedImage.name}
                      </div>
                    )}

                    {imagePreview && (
                      <div className="mt-3">
                        <p className="small fw-semibold mb-2">
                          Image Preview
                        </p>

                        <img
                          src={imagePreview}
                          alt="Product preview"
                          onError={() =>
                            setImageError(
                              "The image preview could not be loaded. Check the selected file or image URL."
                            )
                          }
                          onLoad={() => setImageError("")}
                          style={{
                            width: "180px",
                            height: "180px",
                            objectFit: "contain",
                            background: "#f8f9fa",
                            border: "1px solid #dee2e6",
                            borderRadius: "10px",
                            padding: "8px",
                          }}
                        />

                        {selectedImage && (
                          <div className="mt-2">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={removeSelectedImage}
                            >
                              <i className="bi bi-x-circle me-1"></i>
                              Remove Selected Image
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {imageError && (
                      <div className="text-danger small mt-2">
                        {imageError}
                      </div>
                    )}
                  </div>
                </div>

                <div className="col-12">
                  <label className="form-label fw-semibold">
                    Or Use an Image URL
                  </label>

                  <input
                    type="url"
                    name="image"
                    className="form-control"
                    value={formData.image}
                    onChange={handleChange}
                    placeholder="https://example.com/product-image.jpg"
                  />

                  <small className="text-muted">
                    If you select an image from your device, that image
                    takes priority over this URL.
                  </small>
                </div>
              </div>

              <div className="mt-4 d-flex gap-2 flex-wrap">
                <button
                  type="submit"
                  className="btn btn-success"
                  disabled={
                    saving ||
                    (!editingProduct &&
                      (loadingBranches || branches.length === 0))
                  }
                >
                  {saving ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm me-2"
                        role="status"
                        aria-hidden="true"
                      ></span>
                      Saving...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check-lg me-2"></i>
                      {editingProduct ? "Update Product" : "Save Product"}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card shadow-sm">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
            <h5 className="fw-bold mb-0">Products</h5>

            <span className="badge bg-secondary">
              {products.length} products
            </span>
          </div>

          {loading ? (
            <div className="text-center py-5">
              <div
                className="spinner-border text-success"
                role="status"
              ></div>

              <p className="mt-2 text-muted">Loading products...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-5">
              <i className="bi bi-box-seam fs-1 text-muted"></i>

              <p className="text-muted mt-3">No products found.</p>

              <button
                type="button"
                className="btn btn-success"
                onClick={openAddForm}
              >
                Add Your First Product
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Buying Price</th>
                    <th>Selling Price</th>
                    <th>Gross Profit / Unit</th>
                    <th>Unit</th>
                    <th>General Stock</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {products.map((product) => {
                    const hasBuyingPrice =
                      product.buying_price !== null &&
                      product.buying_price !== undefined &&
                      product.buying_price !== "";

                    const sellingPrice = Number(product.price);
                    const buyingPrice = Number(product.buying_price);

                    const grossProfit =
                      hasBuyingPrice &&
                      Number.isFinite(sellingPrice) &&
                      Number.isFinite(buyingPrice)
                        ? sellingPrice - buyingPrice
                        : null;

                    const stock = Number(product.stock);

                    return (
                      <tr key={product.id}>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            {product.image ? (
                              <img
                                src={product.image}
                                alt={product.name || "Product"}
                                onError={(event) => {
                                  event.currentTarget.style.visibility =
                                    "hidden";
                                }}
                                style={{
                                  width: "50px",
                                  height: "50px",
                                  objectFit: "cover",
                                  borderRadius: "8px",
                                }}
                              />
                            ) : (
                              <div
                                className="bg-light d-flex align-items-center justify-content-center"
                                style={{
                                  width: "50px",
                                  height: "50px",
                                  borderRadius: "8px",
                                }}
                              >
                                <i className="bi bi-box"></i>
                              </div>
                            )}

                            <strong>{product.name}</strong>
                          </div>
                        </td>

                        <td>{product.category}</td>

                        <td>
                          {hasBuyingPrice ? (
                            `KSh ${formatMoney(product.buying_price)}`
                          ) : (
                            <span className="badge bg-warning text-dark">
                              Not set
                            </span>
                          )}
                        </td>

                        <td>KSh {formatMoney(product.price)}</td>

                        <td>
                          {grossProfit === null ? (
                            <span className="text-muted">—</span>
                          ) : (
                            <span
                              className={
                                grossProfit < 0
                                  ? "text-danger fw-semibold"
                                  : grossProfit > 0
                                  ? "text-success fw-semibold"
                                  : "text-muted fw-semibold"
                              }
                            >
                              KSh {formatMoney(grossProfit)}
                            </span>
                          )}
                        </td>

                        <td>{product.unit}</td>

                        <td>
                          <span
                            className={
                              !Number.isFinite(stock) || stock <= 5
                                ? "badge bg-danger"
                                : stock <= 10
                                ? "badge bg-warning text-dark"
                                : "badge bg-success"
                            }
                          >
                            {product.stock}
                          </span>
                        </td>

                        <td>
                          {product.is_active ? (
                            <span className="badge bg-success">
                              Active
                            </span>
                          ) : (
                            <span className="badge bg-secondary">
                              Inactive
                            </span>
                          )}
                        </td>

                        <td>
                          <div className="d-flex gap-2">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => handleEdit(product)}
                              title="Edit product"
                            >
                              <i className="bi bi-pencil"></i>
                            </button>

                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => handleDeactivate(product)}
                              title="Deactivate product"
                            >
                              <i className="bi bi-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Products;

