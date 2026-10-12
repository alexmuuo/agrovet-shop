import { useEffect, useRef, useState } from "react";
import api from "../../api/api";

function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
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
    price: "",
    unit: "",
    stock: "",
    image: "",
  });

  const fetchProducts = async () => {
    try {
      setLoading(true);

      const response = await api.get("/products");

      const data = response.data;

      setProducts(
        Array.isArray(data)
          ? data
          : data.products || data.data || []
      );
    } catch (error) {
      console.error("Failed to fetch products:", error);
      alert("Failed to load products.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Clean up temporary image previews when the component unmounts.
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

    // If the admin changes the image URL, update its preview.
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

    // Accept image files only.
    if (!file.type.startsWith("image/")) {
      setImageError("Please select a valid image file.");
      event.target.value = "";
      return;
    }

    // Limit uploads to 5 MB.
    if (file.size > 5 * 1024 * 1024) {
      setImageError(
        "The image is too large. Please select an image under 5 MB."
      );

      event.target.value = "";
      return;
    }

    // Release an old temporary preview before creating another.
    setImagePreview((previous) => {
      if (previous.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }

      return URL.createObjectURL(file);
    });

    setSelectedImage(file);
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
    setImageError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    // Return to the existing URL, if there is one.
    setImagePreview(formData.image.trim());
  };

  const resetForm = () => {
    setFormData({
      name: "",
      category: "",
      description: "",
      price: "",
      unit: "",
      stock: "",
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

  const openAddForm = () => {
    resetForm();
    setShowForm(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (saving) {
      return;
    }

    if (Number(formData.price) < 0 || Number(formData.stock) < 0) {
      alert("Price and stock cannot be negative.");
      return;
    }

    if (!formData.name.trim() || !formData.category.trim()) {
      alert("Please enter the product name and category.");
      return;
    }

    try {
      setSaving(true);

      /*
       * Send FormData so the backend can receive both:
       * 1. Normal product fields.
       * 2. An optional uploaded image file.
       *
       * The backend must be updated to support multipart/form-data.
       */

      const productData = new FormData();

      productData.append("name", formData.name.trim());
      productData.append("category", formData.category.trim());
      productData.append("description", formData.description);
      productData.append("price", String(Number(formData.price)));
      productData.append("unit", formData.unit.trim());
      productData.append("stock", String(Number(formData.stock)));

      // Keep the existing image URL option.
      productData.append("image", formData.image.trim());

      // An uploaded image takes priority over the URL.
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
        await api.post("/products", productData);

        alert("Product added successfully.");
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
    setEditingProduct(product);

    setFormData({
      name: product.name || "",
      category: product.category || "",
      description: product.description || "",
      price: product.price ?? "",
      unit: product.unit || "",
      stock: product.stock ?? "",
      image: product.image || "",
    });

    setSelectedImage(null);
    setImagePreview(product.image || "");
    setImageError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setShowForm(true);
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

  return (
    <div className="container py-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="fw-bold mb-1">
            Product Management
          </h2>

          <p className="text-muted mb-0">
            Add, edit and manage your agrovet products.
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

      {/* Add/Edit Form */}
      {showForm && (
        <div className="card shadow-sm mb-4">
          <div className="card-body p-4">
            <h5 className="fw-bold mb-4">
              {editingProduct ? "Edit Product" : "Add New Product"}
            </h5>

            <form onSubmit={handleSubmit}>
              <div className="row g-3">
                {/* Product name */}
                <div className="col-md-6">
                  <label className="form-label">
                    Product Name
                  </label>

                  <input
                    type="text"
                    name="name"
                    className="form-control"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>

                {/* Category */}
                <div className="col-md-6">
                  <label className="form-label">
                    Category
                  </label>

                  <input
                    type="text"
                    name="category"
                    className="form-control"
                    value={formData.category}
                    onChange={handleChange}
                    placeholder="e.g. Animal Health"
                    required
                  />
                </div>

                {/* Price */}
                <div className="col-md-4">
                  <label className="form-label">
                    Price (KSh)
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
                </div>

                {/* Unit */}
                <div className="col-md-4">
                  <label className="form-label">
                    Unit
                  </label>

                  <input
                    type="text"
                    name="unit"
                    className="form-control"
                    value={formData.unit}
                    onChange={handleChange}
                    placeholder="e.g. 50kg bag"
                    required
                  />
                </div>

                {/* Stock */}
                <div className="col-md-4">
                  <label className="form-label">
                    Stock
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
                </div>

                {/* Description */}
                <div className="col-12">
                  <label className="form-label">
                    Description
                  </label>

                  <textarea
                    name="description"
                    className="form-control"
                    rows="3"
                    value={formData.description}
                    onChange={handleChange}
                  />
                </div>

                {/* Device image upload */}
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
                      Select an image from your device. Supported formats:
                      JPG, PNG, WEBP and GIF. Maximum size: 5 MB.
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

                {/* Existing image URL option */}
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
                    will take priority over this URL.
                  </small>
                </div>
              </div>

              {/* Buttons */}
              <div className="mt-4 d-flex gap-2 flex-wrap">
                <button
                  type="submit"
                  className="btn btn-success"
                  disabled={saving}
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
                      {editingProduct
                        ? "Update Product"
                        : "Save Product"}
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

      {/* Products table */}
      <div className="card shadow-sm">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="fw-bold mb-0">
              Products
            </h5>

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

              <p className="mt-2 text-muted">
                Loading products...
              </p>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-5">
              <i className="bi bi-box-seam fs-1 text-muted"></i>

              <p className="text-muted mt-3">
                No products found.
              </p>

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
                    <th>Price</th>
                    <th>Unit</th>
                    <th>Stock</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.name}
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
                        KSh{" "}
                        {Number(product.price).toLocaleString()}
                      </td>

                      <td>{product.unit}</td>

                      <td>
                        <span
                          className={
                            product.stock <= 5
                              ? "badge bg-danger"
                              : product.stock <= 10
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
                  ))}
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