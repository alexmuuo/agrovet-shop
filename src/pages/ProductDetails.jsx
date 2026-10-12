import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/api";
import { useCart } from "../context/CartContext";

function ProductDetails() {
  const { id } = useParams();
  const { addToCart } = useCart();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [imageError, setImageError] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

  // Convert stored image paths into complete backend URLs.
  // This uses the same logic as Products.jsx.
  const getImageUrl = (image) => {
    if (!image || typeof image !== "string" || !image.trim()) {
      return "/placeholder.png";
    }

    const imagePath = image.trim();

    // Preserve external image URLs.
    if (/^https?:\/\//i.test(imagePath)) {
      return imagePath;
    }

    // Derive the backend origin from the Axios configuration.
    const backendBaseUrl = (
      api.defaults.baseURL || ""
    ).replace(/\/api\/?$/, "");

    // Handle paths stored as /api/product-images/file.jpg.
    if (imagePath.startsWith("/api/")) {
      return `${backendBaseUrl}${imagePath}`;
    }

    // Handle paths stored as /product-images/file.jpg.
    if (imagePath.startsWith("/product-images/")) {
      return `${backendBaseUrl}/api${imagePath}`;
    }

    // Handle other relative image paths.
    return `${backendBaseUrl}/${imagePath.replace(/^\/+/, "")}`;
  };

  useEffect(() => {
    let cancelled = false;

    const fetchProduct = async () => {
      setLoading(true);
      setError("");
      setProduct(null);
      setImageError(false);
      setQuantity(1);
      setAddedToCart(false);

      try {
        const response = await api.get(`/products/${id}`);

        if (!cancelled) {
          setProduct(response.data);
        }
      } catch (err) {
        console.error(
          "Failed to load product:",
          err.response?.data || err.message
        );

        if (!cancelled) {
          setError(
            err.response?.status === 404
              ? "This product could not be found."
              : "Could not load this product. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchProduct();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const stock = Math.max(0, Number(product?.stock) || 0);
  const price = Number(product?.price) || 0;
  const imageUrl = getImageUrl(product?.image);

  const handleQuantityChange = (value) => {
    if (!product || value === "") {
      return;
    }

    const parsedValue = Number(value);

    if (!Number.isFinite(parsedValue)) {
      return;
    }

    const nextQuantity = Math.floor(parsedValue);

    if (nextQuantity < 1) {
      setQuantity(1);
    } else {
      setQuantity(Math.min(nextQuantity, stock));
    }

    setAddedToCart(false);
  };

  const handleAddToCart = () => {
    if (!product || stock < 1) {
      return;
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > stock
    ) {
      return;
    }

    addToCart({
      ...product,
      quantity,
    });

    setAddedToCart(true);
  };

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div
          className="spinner-border text-success"
          role="status"
        >
          <span className="visually-hidden">
            Loading product...
          </span>
        </div>

        <p className="mt-3">Loading product...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger" role="alert">
          {error}
        </div>

        <Link to="/products" className="btn btn-success">
          Back to Products
        </Link>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container py-5 text-center">
        <h3>Product not found</h3>

        <p className="text-muted">
          The product may have been removed or is no longer available.
        </p>

        <Link
          to="/products"
          className="btn btn-success mt-3"
        >
          Back to Products
        </Link>
      </div>
    );
  }

  return (
    <div className="container py-5">
      <Link
        to="/products"
        className="text-decoration-none text-success"
      >
        ← Back to Products
      </Link>

      <div className="row g-4 g-lg-5 mt-2">
        {/* Product image */}
        <div className="col-md-6">
          <div
            className="rounded shadow-sm d-flex align-items-center justify-content-center bg-light overflow-hidden"
            style={{ minHeight: "350px" }}
          >
            <img
              src={imageError ? "/placeholder.png" : imageUrl}
              alt={product.name || "Product"}
              className="img-fluid rounded"
              style={{
                width: "100%",
                height: "450px",
                objectFit: "contain",
              }}
              onError={(event) => {
                console.error(
                  `Image failed for product "${product.name}" (ID: ${product.id}).`,
                  {
                    storedImage: product.image,
                    requestedUrl: event.currentTarget.src,
                  }
                );

                if (!imageError) {
                  setImageError(true);
                } else {
                  event.currentTarget.onerror = null;
                }
              }}
            />
          </div>
        </div>

        {/* Product information */}
        <div className="col-md-6">
          {product.category && (
            <small className="text-muted">
              {product.category}
            </small>
          )}

          <h1 className="fw-bold mt-2">
            {product.name}
          </h1>

          <h3 className="text-success fw-bold mt-3">
            KSh {price.toLocaleString("en-KE")}
          </h3>

          {product.unit && (
            <p className="text-muted">
              Per {product.unit}
            </p>
          )}

          <hr />

          <p style={{ whiteSpace: "pre-line" }}>
            {product.description ||
              "No description available."}
          </p>

          {/* Stock availability */}
          {stock > 0 ? (
            <div className="alert alert-success">
              <i
                className="bi bi-check-circle me-2"
                aria-hidden="true"
              />
              {stock} {product.unit || "units"} available
            </div>
          ) : (
            <div className="alert alert-danger">
              <i
                className="bi bi-x-circle me-2"
                aria-hidden="true"
              />
              Out of stock
            </div>
          )}

          {/* Quantity and cart controls */}
          {stock > 0 && (
            <>
              <label
                htmlFor="product-quantity"
                className="form-label fw-bold"
              >
                Quantity
              </label>

              <div
                className="input-group mb-4"
                style={{ maxWidth: "200px" }}
              >
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  aria-label="Decrease quantity"
                  disabled={quantity <= 1}
                  onClick={() => {
                    setQuantity((current) =>
                      Math.max(1, current - 1)
                    );
                    setAddedToCart(false);
                  }}
                >
                  −
                </button>

                <input
                  id="product-quantity"
                  type="number"
                  className="form-control text-center"
                  value={quantity}
                  min={1}
                  max={stock}
                  step={1}
                  onChange={(event) =>
                    handleQuantityChange(event.target.value)
                  }
                />

                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  aria-label="Increase quantity"
                  disabled={quantity >= stock}
                  onClick={() => {
                    setQuantity((current) =>
                      Math.min(stock, current + 1)
                    );
                    setAddedToCart(false);
                  }}
                >
                  +
                </button>
              </div>

              <button
                type="button"
                className="btn btn-success btn-lg"
                onClick={handleAddToCart}
                disabled={
                  stock < 1 ||
                  quantity < 1 ||
                  quantity > stock
                }
              >
                <i
                  className="bi bi-cart-plus me-2"
                  aria-hidden="true"
                />
                Add to Cart
              </button>

              {addedToCart && (
                <div
                  className="alert alert-success mt-3"
                  role="status"
                >
                  <i
                    className="bi bi-check-circle me-2"
                    aria-hidden="true"
                  />

                  Added to cart successfully!

                  <Link
                    to="/cart"
                    className="d-block mt-2 fw-bold"
                  >
                    View Cart →
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProductDetails;
