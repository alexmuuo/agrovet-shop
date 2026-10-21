import { useEffect, useMemo, useRef, useState } from "react";
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

  const emptyForm = {
    name: "", category: "", description: "", buying_price: "", price: "",
    unit: "", stock: "", branch_id: "", initial_branch_stock: "", image: "",
    allow_portion_sales: false, portions_per_unit: "", portion_price: "",
  };
  const [formData, setFormData] = useState(emptyForm);

  const emptyFilters = {
    search: "", category: "all", stockStatus: "all", minStock: "", maxStock: "",
    status: "all", minSellingPrice: "", maxSellingPrice: "",
    minBuyingPrice: "", maxBuyingPrice: "",
    portions: "all", datePreset: "all", dateFrom: "", dateTo: "", sortBy: "newest",
  };
  const [filters, setFilters] = useState(emptyFilters);

  const toInputValue = (value) =>
    value === null || value === undefined ? "" : String(value);

  const formatMoney = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "0.00";
    return amount.toLocaleString("en-KE", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  };

  const formatStock = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "0.000";
    return amount.toLocaleString("en-KE", {
      minimumFractionDigits: 0, maximumFractionDigits: 3,
    });
  };

  const getCreatedDate = (product) => {
    const value = product.created_at ?? product.createdAt ??
      product.date_created ?? product.date_added ?? product.created;
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await api.get("/products");
      const data = response.data;
      const fetchedProducts = Array.isArray(data) ? data :
        Array.isArray(data?.products) ? data.products :
        Array.isArray(data?.data) ? data.data : [];
      setProducts(fetchedProducts);
    } catch (error) {
      console.error("Failed to fetch products:", error);
      alert(error.response?.data?.message || "Failed to load products. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      setLoadingBranches(true);
      const response = await api.get("/admin/branches");
      const data = response.data;
      const fetchedBranches = Array.isArray(data) ? data :
        Array.isArray(data?.branches) ? data.branches :
        Array.isArray(data?.data) ? data.data : [];
      const activeBranches = fetchedBranches.filter((branch) =>
        branch.is_active === true || branch.is_active === 1 || branch.is_active === "true"
      );
      setBranches(activeBranches);
      setFormData((previous) => {
        const selectedBranchExists = activeBranches.some(
          (branch) => String(branch.id) === String(previous.branch_id)
        );
        return {
          ...previous,
          branch_id: selectedBranchExists ? previous.branch_id :
            activeBranches.length === 1 ? String(activeBranches[0].id) : "",
        };
      });
    } catch (error) {
      console.error("Failed to fetch branches:", error);
      setBranches([]);
      alert(error.response?.data?.message ||
        "Failed to load branches. Check your admin access and try again.");
    } finally {
      setLoadingBranches(false);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  useEffect(() => {
    return () => {
      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData((previous) => ({ ...previous, [name]: type === "checkbox" ? checked : value }));
    if (name === "image" && !selectedImage) {
      setImagePreview(value.trim());
      setImageError("");
    }
  };

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageError("");
    if (!file.type.startsWith("image/")) {
      setImageError("Please select a valid image file.");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("The image is too large. Please select an image under 5 MB.");
      event.target.value = "";
      return;
    }
    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
    setImageError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setImagePreview(toInputValue(formData.image).trim());
  };

  const resetForm = () => {
    setFormData({
      ...emptyForm,
      branch_id: branches.length === 1 ? String(branches[0].id) : "",
    });
    setSelectedImage(null);
    setImagePreview("");
    setImageError("");
    setEditingProduct(null);
    setShowForm(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openAddForm = async () => {
    resetForm();
    setShowForm(true);
    await fetchBranches();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    const name = toInputValue(formData.name).trim();
    const category = toInputValue(formData.category).trim();
    const description = toInputValue(formData.description);
    const unit = toInputValue(formData.unit).trim();
    const priceText = toInputValue(formData.price).trim();
    const buyingPriceText = toInputValue(formData.buying_price).trim();
    const stockText = toInputValue(formData.stock).trim();
    const sellingPrice = Number(priceText);
    const buyingPrice = buyingPriceText === "" ? null : Number(buyingPriceText);
    const stock = Number(stockText);

    if (!name || !category) return alert("Please enter the product name and category.");
    if (!unit) return alert("Please enter the product unit.");

    const validMoney = (value) =>
      Number.isFinite(value) && value >= 0 &&
      Number.isFinite(value * 100) &&
      Math.abs(value * 100 - Math.round(value * 100)) <= 0.000001;

    if (priceText === "" || !validMoney(sellingPrice)) {
      return alert("Please enter a valid selling price with up to two decimal places.");
    }
    if (buyingPrice !== null && !validMoney(buyingPrice)) {
      return alert("Please enter a valid buying price with up to two decimal places.");
    }
    if (!editingProduct && buyingPrice === null) {
      return alert("Please enter the buying price for this product.");
    }

    const validStock = (value) => {
      const text = toInputValue(value).trim();
      if (!/^\d+(\.\d{1,3})?$/.test(text)) return false;
      const number = Number(text);
      return Number.isFinite(number) && number >= 0;
    };

    if (!validStock(stockText)) {
      return alert("Please enter a valid stock quantity with up to three decimal places.");
    }

    let branchId = null;
    let initialBranchStock = null;
    if (!editingProduct) {
      const branchIdText = toInputValue(formData.branch_id).trim();
      const branchStockText = toInputValue(formData.initial_branch_stock).trim();
      branchId = Number(branchIdText);
      initialBranchStock = Number(branchStockText);

      if (branchIdText === "" || !Number.isInteger(branchId) || branchId <= 0) {
        return alert("Please select a branch for this product.");
      }
      if (!branches.some((branch) => String(branch.id) === String(formData.branch_id))) {
        return alert("The selected branch is unavailable. Please select an active branch.");
      }
      if (!validStock(branchStockText)) {
        return alert("Please enter a valid initial branch stock quantity with up to three decimal places.");
      }
    }

    let portionsPerUnit = null;
    let portionPrice = null;
    if (formData.allow_portion_sales) {
      const portionsText = toInputValue(formData.portions_per_unit).trim();
      const portionPriceText = toInputValue(formData.portion_price).trim();
      portionsPerUnit = Number(portionsText);
      portionPrice = Number(portionPriceText);

      if (portionsText === "" || !Number.isInteger(portionsPerUnit) || portionsPerUnit <= 0) {
        return alert("Enter a positive whole number for portions per stock unit.");
      }
      if (portionPriceText === "" || !validMoney(portionPrice)) {
        return alert("Enter a valid portion price with up to two decimal places.");
      }
    }

    try {
      setSaving(true);
      const productData = new FormData();
      productData.append("name", name);
      productData.append("category", category);
      productData.append("description", description);
      productData.append("buying_price", buyingPrice === null ? "" : String(buyingPrice));
      productData.append("price", String(sellingPrice));
      productData.append("unit", unit);
      productData.append("stock", String(stock));
      productData.append("allow_portion_sales", String(formData.allow_portion_sales));
      productData.append("portions_per_unit", portionsPerUnit === null ? "" : String(portionsPerUnit));
      productData.append("portion_price", portionPrice === null ? "" : String(portionPrice));
      productData.append("image", toInputValue(formData.image).trim());
      if (selectedImage) productData.append("image_file", selectedImage);

      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, productData);
        alert("Product updated successfully.");
      } else {
        productData.append("branch_id", String(branchId));
        productData.append("initial_branch_stock", String(initialBranchStock));
        await api.post("/products", productData);
        alert("Product and initial branch stock added successfully.");
      }
      resetForm();
      await fetchProducts();
    } catch (error) {
      console.error("Failed to save product:", error);
      alert(error.response?.data?.message || error.response?.data?.error ||
        "Failed to save product. Please try again.");
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
      allow_portion_sales: Boolean(product.allow_portion_sales),
      portions_per_unit: toInputValue(product.portions_per_unit),
      portion_price: toInputValue(product.portion_price),
    });
    setSelectedImage(null);
    setImagePreview(toInputValue(product.image));
    setImageError("");
    setShowForm(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeactivate = async (product) => {
    if (!window.confirm(`Are you sure you want to deactivate "${product.name}"?`)) return;
    try {
      await api.delete(`/products/${product.id}`);
      alert("Product deactivated successfully.");
      await fetchProducts();
    } catch (error) {
      console.error("Failed to deactivate product:", error);
      alert(error.response?.data?.message || "Failed to deactivate product.");
    }
  };

  const updateFilter = (event) => {
    const { name, value } = event.target;
    setFilters((previous) => ({ ...previous, [name]: value }));
  };

  const filteredProducts = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let presetStart = null;
    if (filters.datePreset === "today") presetStart = startOfToday;
    if (filters.datePreset === "7days") presetStart = new Date(startOfToday.getTime() - 6 * 86400000);
    if (filters.datePreset === "30days") presetStart = new Date(startOfToday.getTime() - 29 * 86400000);

    const fromDate = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : presetStart;
    const toDate = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`) : null;
    const search = filters.search.trim().toLowerCase();

    const result = products.filter((product) => {
      const name = toInputValue(product.name).toLowerCase();
      const category = toInputValue(product.category).toLowerCase();
      const description = toInputValue(product.description).toLowerCase();
      const unit = toInputValue(product.unit).toLowerCase();
      const stock = Number(product.stock);
      const selling = Number(product.price);
      const created = getCreatedDate(product);
      const active = product.is_active === true || product.is_active === 1 ||
        product.is_active === "true" || product.is_active === "1";
      const portionsEnabled = Boolean(product.allow_portion_sales);

      if (search && ![name, category, description, unit].some((field) => field.includes(search))) return false;
      if (filters.category !== "all" && category !== filters.category.toLowerCase()) return false;
      if (filters.status === "active" && !active) return false;
      if (filters.status === "inactive" && active) return false;

      if (filters.stockStatus === "out" && stock > 0) return false;
      if (filters.stockStatus === "low" && !(stock > 0 && stock <= 5)) return false;
      if (filters.stockStatus === "normal" && !(stock > 5 && stock <= 10)) return false;
      if (filters.stockStatus === "healthy" && stock <= 10) return false;
      if (filters.minStock !== "" && (!Number.isFinite(stock) || stock < Number(filters.minStock))) return false;
      if (filters.maxStock !== "" && (!Number.isFinite(stock) || stock > Number(filters.maxStock))) return false;

      if (filters.minSellingPrice !== "" && (!Number.isFinite(selling) || selling < Number(filters.minSellingPrice))) return false;
      if (filters.maxSellingPrice !== "" && (!Number.isFinite(selling) || selling > Number(filters.maxSellingPrice))) return false;
      if (filters.minBuyingPrice !== "" && (!hasBuying || !Number.isFinite(buying) || buying < Number(filters.minBuyingPrice))) return false;
      if (filters.maxBuyingPrice !== "" && (!hasBuying || !Number.isFinite(buying) || buying > Number(filters.maxBuyingPrice))) return false;

      if (filters.portions === "enabled" && !portionsEnabled) return false;
      if (filters.portions === "disabled" && portionsEnabled) return false;

      if (filters.datePreset !== "all" || filters.dateFrom || filters.dateTo) {
        if (!created) return false;
        if (fromDate && created < fromDate) return false;
        if (toDate && created > toDate) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      const aName = toInputValue(a.name).toLowerCase();
      const bName = toInputValue(b.name).toLowerCase();
      const aStock = Number(a.stock) || 0;
      const bStock = Number(b.stock) || 0;
      const aPrice = Number(a.price) || 0;
      const bPrice = Number(b.price) || 0;
      const aDate = getCreatedDate(a)?.getTime() ?? 0;
      const bDate = getCreatedDate(b)?.getTime() ?? 0;
      switch (filters.sortBy) {
        case "oldest": return aDate - bDate;
        case "name-asc": return aName.localeCompare(bName);
        case "name-desc": return bName.localeCompare(aName);
        case "stock-asc": return aStock - bStock;
        case "stock-desc": return bStock - aStock;
        case "price-asc": return aPrice - bPrice;
        case "price-desc": return bPrice - aPrice;
        case "newest":
        default: return bDate - aDate;
      }
    });
    return result;
  }, [products, filters]);

  const categories = useMemo(() =>
    [...new Set(products.map((product) => toInputValue(product.category).trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b)), [products]);

  const productsWithDates = products.filter((product) => getCreatedDate(product)).length;
  const buyingPriceText = toInputValue(formData.buying_price).trim();
  const sellingPriceText = toInputValue(formData.price).trim();
  const hasValidPrices = buyingPriceText !== "" && sellingPriceText !== "" &&
    Number.isFinite(Number(buyingPriceText)) && Number.isFinite(Number(sellingPriceText));
  const grossProfitPreview = hasValidPrices ? Number(sellingPriceText) - Number(buyingPriceText) : null;
  const portionPriceText = toInputValue(formData.portion_price).trim();
  const portionPriceNumber = Number(portionPriceText);
  const portionCount = Number(formData.portions_per_unit);
  const validPortionPreview = formData.allow_portion_sales &&
    Number.isInteger(portionCount) && portionCount > 0 && portionPriceText !== "" &&
    Number.isFinite(portionPriceNumber) && portionPriceNumber >= 0;

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="fw-bold mb-1">Product Management</h2>
          <p className="text-muted mb-0">Manage products, costs, selling prices, inventory and portion sales.</p>
        </div>
        <button type="button" className="btn btn-success" onClick={openAddForm}>
          <i className="bi bi-plus-lg me-2"></i>Add Product
        </button>
      </div>

      {showForm && (
        <div className="card shadow-sm mb-4">
          <div className="card-body p-4">
            <h5 className="fw-bold mb-4">{editingProduct ? "Edit Product" : "Add New Product"}</h5>
            <form onSubmit={handleSubmit}>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label">Product Name</label>
                  <input type="text" name="name" className="form-control" value={formData.name} onChange={handleChange} required />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Category</label>
                  <input type="text" name="category" className="form-control" value={formData.category} onChange={handleChange} placeholder="e.g. whiskey, beer, wine, spirits" required />
                </div>
                <div className="col-md-4">
                  <label className="form-label">Buying Price (KSh)</label>
                  <input type="number" name="buying_price" className="form-control" value={formData.buying_price} onChange={handleChange} min="0" step="0.01" placeholder="Cost per whole stock unit" required={!editingProduct} />
                  <small className="text-muted">Cost of purchasing one whole stock unit.</small>
                </div>
                <div className="col-md-4">
                  <label className="form-label">Selling Price (KSh)</label>
                  <input type="number" name="price" className="form-control" value={formData.price} onChange={handleChange} min="0" step="0.01" required />
                  <small className="text-muted">Price charged for one whole stock unit.</small>
                </div>
                <div className="col-md-4">
                  <label className="form-label">Stock Unit</label>
                  <input type="text" name="unit" className="form-control" value={formData.unit} onChange={handleChange} placeholder="e.g. bottle, crate, 750ml" required />
                  <small className="text-muted">The unit used to track branch inventory.</small>
                </div>
                <div className="col-md-4">
                  <label className="form-label">General Product Stock</label>
                  <input type="number" name="stock" className="form-control" value={formData.stock} onChange={handleChange} min="0" step="0.001" required />
                  <small className="text-muted">General inventory, separate from branch stock.</small>
                </div>

                {!editingProduct && <>
                  <div className="col-md-4">
                    <label className="form-label">Branch <span className="text-danger">*</span></label>
                    <select name="branch_id" className="form-select" value={formData.branch_id} onChange={handleChange} disabled={loadingBranches || saving} required>
                      <option value="">{loadingBranches ? "Loading branches..." : "Select a branch"}</option>
                      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.code ? ` (${branch.code})` : ""}</option>)}
                    </select>
                    {!loadingBranches && branches.length === 0 && <small className="text-danger d-block mt-1">No active branches found. Check your branch setup and admin access.</small>}
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Initial Branch Stock <span className="text-danger">*</span></label>
                    <input type="number" name="initial_branch_stock" className="form-control" value={formData.initial_branch_stock} onChange={handleChange} min="0" step="0.001" placeholder="Quantity available at this branch" required />
                    <small className="text-muted">Stock available to sell at this branch's POS.</small>
                  </div>
                  <div className="col-12"><div className="alert alert-info mb-0"><i className="bi bi-info-circle me-2"></i>Only the selected branch receives this initial stock. Other branches are not updated automatically.</div></div>
                </>}

                <div className={editingProduct ? "col-md-8" : "col-md-12"}>
                  <label className="form-label">Gross Profit per Whole Unit</label>
                  <div className="form-control bg-light">{grossProfitPreview !== null ? `KSh ${formatMoney(grossProfitPreview)}` : "Enter both prices to calculate"}</div>
                  <small className="text-muted">Selling price minus buying price. This is not net profit.</small>
                </div>

                <div className="col-12">
                  <hr /><h6 className="fw-bold">Portion Selling</h6>
                  <div className="form-check form-switch mb-3">
                    <input className="form-check-input" type="checkbox" role="switch" id="allow_portion_sales" name="allow_portion_sales" checked={formData.allow_portion_sales} onChange={handleChange} />
                    <label className="form-check-label" htmlFor="allow_portion_sales">Allow this product to be sold in portions</label>
                  </div>
                  {formData.allow_portion_sales && <div className="row g-3">
                    <div className="col-md-4">
                      <label className="form-label">Portions per Whole Unit</label>
                      <input type="number" name="portions_per_unit" className="form-control" min="1" step="1" value={formData.portions_per_unit} onChange={handleChange} placeholder="e.g. 4" required />
                      <small className="text-muted">How many portions come from one stock unit.</small>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Selling Price per Portion (KSh)</label>
                      <input type="number" name="portion_price" className="form-control" min="0" step="0.01" value={formData.portion_price} onChange={handleChange} placeholder="e.g. 90" required />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Revenue if All Portions Sell</label>
                      <div className="form-control bg-light">{validPortionPreview ? `KSh ${formatMoney(portionCount * portionPriceNumber)}` : "Enter portion count and price"}</div>
                      <small className="text-muted">Compared with the whole-unit price of KSh {formatMoney(formData.price)}.</small>
                    </div>
                    {validPortionPreview && <div className="col-12"><div className="alert alert-info mb-0">One whole stock unit provides <strong>{portionCount} portions</strong>. At <strong>KSh {formatMoney(portionPriceNumber)}</strong> each, selling all portions generates <strong>KSh {formatMoney(portionCount * portionPriceNumber)}</strong>. Inventory will be tracked in whole-unit equivalents.</div></div>}
                  </div>}
                </div>

                <div className="col-12">
                  <label className="form-label">Description</label>
                  <textarea name="description" className="form-control" rows="3" value={formData.description} onChange={handleChange} />
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold">Upload Product Image</label>
                  <div className="border rounded-3 p-3">
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="form-control" onChange={handleImageSelect} />
                    <small className="text-muted d-block mt-2">Supported formats: JPG, PNG, WEBP and GIF. Maximum size: 5 MB.</small>
                    {selectedImage && <div className="mt-2 small text-success"><i className="bi bi-check-circle me-1"></i>Selected: {selectedImage.name}</div>}
                    {imagePreview && <div className="mt-3">
                      <p className="small fw-semibold mb-2">Image Preview</p>
                      <img src={imagePreview} alt="Product preview" onError={() => setImageError("The image preview could not be loaded. Check the selected file or image URL.")} onLoad={() => setImageError("")} style={{ width: "180px", height: "180px", objectFit: "contain", background: "#f8f9fa", border: "1px solid #dee2e6", borderRadius: "10px", padding: "8px" }} />
                      {selectedImage && <div className="mt-2"><button type="button" className="btn btn-sm btn-outline-danger" onClick={removeSelectedImage}><i className="bi bi-x-circle me-1"></i>Remove Selected Image</button></div>}
                    </div>}
                    {imageError && <div className="text-danger small mt-2">{imageError}</div>}
                  </div>
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold">Or Use an Image URL</label>
                  <input type="url" name="image" className="form-control" value={formData.image} onChange={handleChange} placeholder="https://example.com/product-image.jpg" />
                  <small className="text-muted">If you select an image from your device, that image takes priority.</small>
                </div>
              </div>
              <div className="mt-4 d-flex gap-2 flex-wrap">
                <button type="submit" className="btn btn-success" disabled={saving || (!editingProduct && (loadingBranches || branches.length === 0))}>
                  {saving ? <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Saving...</> : <><i className="bi bi-check-lg me-2"></i>{editingProduct ? "Update Product" : "Save Product"}</>}
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={saving}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
            <div>
              <h5 className="fw-bold mb-1">Filter Products</h5>
              <small className="text-muted">Narrow the list by search, category, stock, status, prices or date added.</small>
            </div>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setFilters(emptyFilters)}>
              <i className="bi bi-arrow-counterclockwise me-1"></i>Reset Filters
            </button>
          </div>
          <div className="row g-3">
            <div className="col-lg-4 col-md-6">
              <label className="form-label">Search</label>
              <input type="search" name="search" className="form-control" value={filters.search} onChange={updateFilter} placeholder="Name, category, description or unit" />
            </div>
            <div className="col-lg-2 col-md-6">
              <label className="form-label">Category</label>
              <select name="category" className="form-select" value={filters.category} onChange={updateFilter}>
                <option value="all">All categories</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <div className="col-lg-2 col-md-6">
              <label className="form-label">Product Status</label>
              <select name="status" className="form-select" value={filters.status} onChange={updateFilter}>
                <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="col-lg-2 col-md-6">
              <label className="form-label">Stock Status</label>
              <select name="stockStatus" className="form-select" value={filters.stockStatus} onChange={updateFilter}>
                <option value="all">All stock levels</option><option value="out">Out of stock (0)</option><option value="low">Low (above 0–5)</option><option value="normal">Moderate (above 5–10)</option><option value="healthy">Healthy (above 10)</option>
              </select>
            </div>
            <div className="col-lg-2 col-md-6">
              <label className="form-label">Portion Selling</label>
              <select name="portions" className="form-select" value={filters.portions} onChange={updateFilter}>
                <option value="all">All products</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option>
              </select>
            </div>

            <div className="col-md-3">
              <label className="form-label">Minimum Stock</label>
              <input type="number" name="minStock" className="form-control" min="0" step="0.001" value={filters.minStock} onChange={updateFilter} placeholder="e.g. 0.5" />
            </div>
            <div className="col-md-3">
              <label className="form-label">Maximum Stock</label>
              <input type="number" name="maxStock" className="form-control" min="0" step="0.001" value={filters.maxStock} onChange={updateFilter} placeholder="e.g. 20" />
            </div>
            <div className="col-md-3">
              <label className="form-label">Date Added</label>
              <select name="datePreset" className="form-select" value={filters.datePreset} onChange={updateFilter}>
                <option value="all">Any date</option><option value="today">Today</option><option value="7days">Last 7 days</option><option value="30days">Last 30 days</option><option value="custom">Custom date range</option>
              </select>
            </div>

            {(filters.datePreset === "custom" || filters.dateFrom || filters.dateTo) && <><div className="col-md-3">
              <label className="form-label">Added From</label>
              <input type="date" name="dateFrom" className="form-control" value={filters.dateFrom} onChange={updateFilter} />
            </div><div className="col-md-3">
              <label className="form-label">Added To</label>
              <input type="date" name="dateTo" className="form-control" value={filters.dateTo} onChange={updateFilter} />
            </div></>}

            <div className="col-md-3">
              <label className="form-label">Minimum Selling Price (KSh)</label>
              <input type="number" name="minSellingPrice" className="form-control" min="0" step="0.01" value={filters.minSellingPrice} onChange={updateFilter} placeholder="Minimum" />
            </div>
            <div className="col-md-3">
              <label className="form-label">Maximum Selling Price (KSh)</label>
              <input type="number" name="maxSellingPrice" className="form-control" min="0" step="0.01" value={filters.maxSellingPrice} onChange={updateFilter} placeholder="Maximum" />
            </div>
            <div className="col-md-3">
              <label className="form-label">Minimum Buying Price (KSh)</label>
              <input type="number" name="minBuyingPrice" className="form-control" min="0" step="0.01" value={filters.minBuyingPrice} onChange={updateFilter} placeholder="Minimum" />
            </div>
            <div className="col-md-3">
              <label className="form-label">Maximum Buying Price (KSh)</label>
              <input type="number" name="maxBuyingPrice" className="form-control" min="0" step="0.01" value={filters.maxBuyingPrice} onChange={updateFilter} placeholder="Maximum" />
            </div>
            <div className="col-md-3">
              <label className="form-label">Sort Results</label>
              <select name="sortBy" className="form-select" value={filters.sortBy} onChange={updateFilter}>
                <option value="newest">Newest added</option><option value="oldest">Oldest added</option><option value="name-asc">Name (A–Z)</option><option value="name-desc">Name (Z–A)</option><option value="stock-asc">Stock (lowest first)</option><option value="stock-desc">Stock (highest first)</option><option value="price-asc">Selling price (lowest first)</option><option value="price-desc">Selling price (highest first)</option>
              </select>
            </div>
          </div>
          {filters.datePreset !== "all" && productsWithDates === 0 && <div className="alert alert-warning mt-3 mb-0">
            Product creation dates are not included in the data returned by the API, so date filtering cannot match products until the backend returns a field such as <code>created_at</code>.
          </div>}
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3 pt-3 border-top">
            <span className="fw-semibold">Showing {filteredProducts.length} of {products.length} products</span>
            <small className="text-muted">Filters update automatically as you change them.</small>
          </div>
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
            <h5 className="fw-bold mb-0">Products</h5>
            <span className="badge bg-secondary">{filteredProducts.length} matching</span>
          </div>
          {loading ? <div className="text-center py-5">
            <div className="spinner-border text-success" role="status"></div><p className="mt-2 text-muted">Loading products...</p>
          </div> : filteredProducts.length === 0 ? <div className="text-center py-5">
            <i className="bi bi-search fs-1 text-muted"></i><p className="text-muted mt-3">{products.length === 0 ? "No products found." : "No products match these filters."}</p>
            {products.length === 0 ? <button type="button" className="btn btn-success" onClick={openAddForm}>Add Your First Product</button> : <button type="button" className="btn btn-outline-secondary" onClick={() => setFilters(emptyFilters)}>Clear Filters</button>}
          </div> : <div className="table-responsive">
            <table className="table table-hover align-middle">
              <thead><tr>
                <th>Product</th><th>Category</th><th>Buying Price</th><th>Selling Price</th><th>Gross Profit / Unit</th><th>Unit</th><th>General Stock</th><th>Portion Selling</th><th>Status</th><th>Actions</th>
              </tr></thead>
              <tbody>{filteredProducts.map((product) => {
                const hasBuyingPrice = product.buying_price !== null && product.buying_price !== undefined && product.buying_price !== "";
                const sellingPrice = Number(product.price);
                const buyingPrice = Number(product.buying_price);
                const grossProfit = hasBuyingPrice && Number.isFinite(sellingPrice) && Number.isFinite(buyingPrice) ? sellingPrice - buyingPrice : null;
                const stock = Number(product.stock);
                const active = product.is_active === true || product.is_active === 1 || product.is_active === "true" || product.is_active === "1";
                return <tr key={product.id}>
                  <td><div className="d-flex align-items-center gap-2">
                    {product.image ? <img src={product.image} alt={product.name || "Product"} onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} style={{ width: "50px", height: "50px", objectFit: "cover", borderRadius: "8px" }} /> :
                      <div className="bg-light d-flex align-items-center justify-content-center" style={{ width: "50px", height: "50px", borderRadius: "8px" }}><i className="bi bi-box"></i></div>}
                    <div><strong>{product.name}</strong>{getCreatedDate(product) && <div className="small text-muted">Added {getCreatedDate(product).toLocaleDateString()}</div>}</div>
                  </div></td>
                  <td>{product.category}</td>
                  <td>{hasBuyingPrice ? `KSh ${formatMoney(product.buying_price)}` : <span className="badge bg-warning text-dark">Not set</span>}</td>
                  <td>KSh {formatMoney(product.price)}</td>
                  <td>{grossProfit === null ? <span className="text-muted">—</span> : <span className={grossProfit < 0 ? "text-danger fw-semibold" : grossProfit > 0 ? "text-success fw-semibold" : "text-muted fw-semibold"}>KSh {formatMoney(grossProfit)}</span>}</td>
                  <td>{product.unit}</td>
                  <td><span className={!Number.isFinite(stock) || stock <= 5 ? "badge bg-danger" : stock <= 10 ? "badge bg-warning text-dark" : "badge bg-success"}>{formatStock(product.stock)}</span></td>
                  <td>{product.allow_portion_sales ? <div><span className="badge bg-info text-dark">Enabled</span><div className="small text-muted mt-1">{product.portions_per_unit} portions<br />KSh {formatMoney(product.portion_price)} each</div></div> : <span className="text-muted">Not enabled</span>}</td>
                  <td>{active ? <span className="badge bg-success">Active</span> : <span className="badge bg-secondary">Inactive</span>}</td>
                  <td><div className="d-flex gap-2">
                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => handleEdit(product)} title="Edit product"><i className="bi bi-pencil"></i></button>
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleDeactivate(product)} title="Deactivate product"><i className="bi bi-trash"></i></button>
                  </div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
        </div>
      </div>
    </div>
  );
}

export default Products;
