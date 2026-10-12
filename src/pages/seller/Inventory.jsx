import { useEffect, useState } from "react";
import api from "../../api/api";

function Inventory() {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [stockValue, setStockValue] = useState("");

  const fetchProducts = async () => {
    try {
      setLoading(true);

      const response = await api.get("/products");

      setProducts(response.data);
      setFilteredProducts(response.data);
    } catch (error) {
      console.error("Failed to load inventory:", error);
      alert("Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Search products
  useEffect(() => {
    const searchTerm = search.toLowerCase().trim();

    if (!searchTerm) {
      setFilteredProducts(products);
      return;
    }

    const filtered = products.filter(
      (product) =>
        product.name.toLowerCase().includes(searchTerm) ||
        product.category.toLowerCase().includes(searchTerm)
    );

    setFilteredProducts(filtered);
  }, [search, products]);

  const getStockStatus = (stock) => {
    if (stock === 0) {
      return {
        label: "Out of Stock",
        className: "bg-danger",
      };
    }

    if (stock <= 5) {
      return {
        label: "Critical",
        className: "bg-danger",
      };
    }

    if (stock <= 10) {
      return {
        label: "Low Stock",
        className: "bg-warning text-dark",
      };
    }

    return {
      label: "In Stock",
      className: "bg-success",
    };
  };

  const startEditing = (product) => {
    setEditingId(product.id);
    setStockValue(product.stock);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setStockValue("");
  };

  const saveStock = async (product) => {
    const newStock = Number(stockValue);

    if (!Number.isInteger(newStock) || newStock < 0) {
      alert("Please enter a valid stock quantity.");
      return;
    }

    try {
      await api.put(`/products/${product.id}`, {
        stock: newStock,
      });

      alert("Stock updated successfully.");

      cancelEditing();

      fetchProducts();
    } catch (error) {
      console.error("Failed to update stock:", error);

      alert(
        error.response?.data?.message ||
          "Failed to update stock."
      );
    }
  };

  const increaseStock = (product) => {
    setEditingId(product.id);
    setStockValue(product.stock + 1);
  };

  const decreaseStock = (product) => {
    if (product.stock <= 0) {
      return;
    }

    setEditingId(product.id);
    setStockValue(product.stock - 1);
  };

  const totalProducts = products.length;

  const lowStockProducts = products.filter(
    (product) => product.stock > 0 && product.stock <= 10
  ).length;

  const outOfStockProducts = products.filter(
    (product) => product.stock === 0
  ).length;

  const totalStockUnits = products.reduce(
    (total, product) => total + product.stock,
    0
  );

  return (
    <div className="container py-4">

      {/* Header */}
      <div className="mb-4">
        <h2 className="fw-bold mb-1">
          Inventory
        </h2>

        <p className="text-muted mb-0">
          Monitor stock levels and update product quantities.
        </p>
      </div>

      {/* Inventory summary */}
      <div className="row g-3 mb-4">

        <div className="col-md-3">
          <div className="card shadow-sm h-100">
            <div className="card-body">

              <div className="d-flex justify-content-between align-items-center">

                <div>
                  <p className="text-muted mb-1">
                    Products
                  </p>

                  <h3 className="fw-bold mb-0">
                    {totalProducts}
                  </h3>
                </div>

                <i className="bi bi-box-seam fs-2 text-primary"></i>

              </div>

            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card shadow-sm h-100">
            <div className="card-body">

              <div className="d-flex justify-content-between align-items-center">

                <div>
                  <p className="text-muted mb-1">
                    Stock Units
                  </p>

                  <h3 className="fw-bold mb-0">
                    {totalStockUnits}
                  </h3>
                </div>

                <i className="bi bi-boxes fs-2 text-success"></i>

              </div>

            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card shadow-sm h-100">
            <div className="card-body">

              <div className="d-flex justify-content-between align-items-center">

                <div>
                  <p className="text-muted mb-1">
                    Low Stock
                  </p>

                  <h3 className="fw-bold mb-0">
                    {lowStockProducts}
                  </h3>
                </div>

                <i className="bi bi-exclamation-triangle fs-2 text-warning"></i>

              </div>

            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card shadow-sm h-100">
            <div className="card-body">

              <div className="d-flex justify-content-between align-items-center">

                <div>
                  <p className="text-muted mb-1">
                    Out of Stock
                  </p>

                  <h3 className="fw-bold mb-0">
                    {outOfStockProducts}
                  </h3>
                </div>

                <i className="bi bi-x-circle fs-2 text-danger"></i>

              </div>

            </div>
          </div>
        </div>

      </div>

      {/* Search */}
      <div className="card shadow-sm mb-4">
        <div className="card-body">

          <div className="input-group">

            <span className="input-group-text">
              <i className="bi bi-search"></i>
            </span>

            <input
              type="text"
              className="form-control"
              placeholder="Search products or categories..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />

          </div>

        </div>
      </div>

      {/* Inventory table */}
      <div className="card shadow-sm">

        <div className="card-body">

          <div className="d-flex justify-content-between align-items-center mb-3">

            <h5 className="fw-bold mb-0">
              Stock Levels
            </h5>

            <span className="text-muted">
              {filteredProducts.length} products
            </span>

          </div>

          {loading ? (
            <div className="text-center py-5">

              <div
                className="spinner-border text-success"
                role="status"
              ></div>

              <p className="text-muted mt-2">
                Loading inventory...
              </p>

            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-5">

              <i className="bi bi-search fs-1 text-muted"></i>

              <p className="text-muted mt-3">
                No products found.
              </p>

            </div>
          ) : (
            <div className="table-responsive">

              <table className="table table-hover align-middle">

                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Current Stock</th>
                    <th>Status</th>
                    <th>Stock Adjustment</th>
                  </tr>
                </thead>

                <tbody>

                  {filteredProducts.map((product) => {
                    const status = getStockStatus(product.stock);

                    const isEditing =
                      editingId === product.id;

                    return (
                      <tr key={product.id}>

                        {/* Product */}
                        <td>
                          <div className="d-flex align-items-center gap-2">

                            {product.image ? (
                              <img
                                src={product.image}
                                alt={product.name}
                                style={{
                                  width: "45px",
                                  height: "45px",
                                  objectFit: "cover",
                                  borderRadius: "8px",
                                }}
                              />
                            ) : (
                              <div
                                className="bg-light d-flex align-items-center justify-content-center"
                                style={{
                                  width: "45px",
                                  height: "45px",
                                  borderRadius: "8px",
                                }}
                              >
                                <i className="bi bi-box"></i>
                              </div>
                            )}

                            <strong>
                              {product.name}
                            </strong>

                          </div>
                        </td>

                        {/* Category */}
                        <td>
                          {product.category}
                        </td>

                        {/* Current stock */}
                        <td>

                          {isEditing ? (
                            <input
                              type="number"
                              className="form-control"
                              style={{ width: "100px" }}
                              min="0"
                              value={stockValue}
                              onChange={(event) =>
                                setStockValue(
                                  event.target.value
                                )
                              }
                            />
                          ) : (
                            <strong>
                              {product.stock}
                            </strong>
                          )}

                        </td>

                        {/* Status */}
                        <td>

                          <span
                            className={`badge ${status.className}`}
                          >
                            {status.label}
                          </span>

                        </td>

                        {/* Actions */}
                        <td>

                          {isEditing ? (
                            <div className="d-flex gap-2">

                              <button
                                className="btn btn-sm btn-success"
                                onClick={() =>
                                  saveStock(product)
                                }
                              >
                                <i className="bi bi-check-lg me-1"></i>
                                Save
                              </button>

                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={cancelEditing}
                              >
                                Cancel
                              </button>

                            </div>
                          ) : (
                            <div className="d-flex gap-2">

                              <button
                                className="btn btn-sm btn-outline-danger"
                                title="Decrease stock"
                                disabled={product.stock === 0}
                                onClick={() =>
                                  decreaseStock(product)
                                }
                              >
                                <i className="bi bi-dash-lg"></i>
                              </button>

                              <button
                                className="btn btn-sm btn-outline-success"
                                title="Increase stock"
                                onClick={() =>
                                  increaseStock(product)
                                }
                              >
                                <i className="bi bi-plus-lg"></i>
                              </button>

                              <button
                                className="btn btn-sm btn-outline-primary"
                                onClick={() =>
                                  startEditing(product)
                                }
                              >
                                <i className="bi bi-pencil me-1"></i>
                                Edit
                              </button>

                            </div>
                          )}

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

export default Inventory;