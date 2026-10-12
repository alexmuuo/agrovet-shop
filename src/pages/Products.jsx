import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/api";

function Products() {
const [products, setProducts] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");
const [searchParams] = useSearchParams();

const selectedCategory = searchParams.get("category") || "";

// Convert locally stored image paths into complete backend URLs.
const getImageUrl = (image) => {
if (!image || typeof image !== "string" || !image.trim()) {
return "/placeholder.png";
}


const imagePath = image.trim();

// Preserve external image URLs.
if (/^https?:\/\//i.test(imagePath)) {
  return imagePath;
}

// Derive the backend origin from the existing Axios configuration.
const backendBaseUrl = api.defaults.baseURL.replace(/\/api\/?$/, "");

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


const loadProducts = async () => {
  try {
    setLoading(true);
    setError("");

    const response = await api.get("/products");

    if (!cancelled) {
      if (Array.isArray(response.data)) {
        setProducts(response.data);
      } else {
        console.error(
          "Unexpected products API response:",
          response.data
        );

        setProducts([]);
        setError(
          "The server returned an unexpected products response."
        );
      }
    }
  } catch (err) {
    if (!cancelled) {
      console.error(
        "Could not load products:",
        err.response?.data || err.message
      );

      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Could not load products. Please check that the backend server is running."
      );
    }
  } finally {
    if (!cancelled) {
      setLoading(false);
    }
  }
};

loadProducts();

return () => {
  cancelled = true;
};


}, []);

const categories = useMemo(() => {
return [
...new Set(
products
.map((product) =>
typeof product.category === "string"
? product.category.trim()
: ""
)
.filter(Boolean)
),
].sort((a, b) => a.localeCompare(b));
}, [products]);

const filteredProducts = useMemo(() => {
if (!selectedCategory) {
return products;
}

return products.filter(
  (product) =>
    typeof product.category === "string" &&
    product.category.trim().toLowerCase() ===
      selectedCategory.trim().toLowerCase()
);

}, [products, selectedCategory]);

if (loading) {
return ( <div className="container py-5 text-center"> <div className="spinner-border text-success" role="status"> <span className="visually-hidden">Loading...</span> </div>


    <p className="mt-3">Loading products...</p>
  </div>
);


}

if (error) {
return ( <div className="container py-5"> <div className="alert alert-danger" role="alert"> <h5 className="alert-heading">Unable to load products</h5>


      <p className="mb-2">{error}</p>

      <button
        type="button"
        className="btn btn-outline-danger btn-sm"
        onClick={() => window.location.reload()}
      >
        Try Again
      </button>
    </div>
  </div>
);

}

return ( <div className="container py-5"> <div className="text-center mb-4"> <h1 className="fw-bold">
{selectedCategory || "Our Products"} </h1>

    <p className="text-muted">
      Quality products for healthier farms and animals.
    </p>
  </div>

  {/* CATEGORY FILTER */}
  <div className="d-flex flex-wrap justify-content-center align-items-center gap-2 mb-4">
    <Link
      to="/products"
      className={`btn ${
        !selectedCategory
          ? "btn-success"
          : "btn-outline-success"
      }`}
    >
      All Products
    </Link>

    {categories.map((category) => (
      <Link
        key={category}
        to={`/products?category=${encodeURIComponent(category)}`}
        className={`btn ${
          selectedCategory.toLowerCase() ===
          category.toLowerCase()
            ? "btn-success"
            : "btn-outline-success"
        }`}
      >
        {category}
      </Link>
    ))}
  </div>

  {filteredProducts.length === 0 ? (
    <div className="text-center py-5">
      <i className="bi bi-box-seam fs-1 text-secondary"></i>

      <h4 className="mt-3">No products found</h4>

      <p className="text-muted">
        {selectedCategory
          ? `There are currently no products in "${selectedCategory}".`
          : "There are no products available at the moment."}
      </p>

      {selectedCategory && (
        <Link to="/products" className="btn btn-success">
          View All Products
        </Link>
      )}
    </div>
  ) : (
    <div className="row g-4">
      {filteredProducts.map((product) => {
        const imageUrl = getImageUrl(product.image);

        return (
          <div
            className="col-md-6 col-lg-3"
            key={product.id}
          >
            <div className="card h-100 shadow-sm border-0">
              <img
                src={imageUrl}
                className="card-img-top"
                alt={product.name || "Product"}
                loading="lazy"
                style={{
                  height: "220px",
                  objectFit: "cover",
                }}
                onError={(event) => {
                  console.error(
                    `Image failed for product "${product.name}" (ID: ${product.id}).`,
                    {
                      storedImage: product.image,
                      requestedUrl: event.currentTarget.src,
                    }
                  );

                  event.currentTarget.onerror = null;
                  event.currentTarget.src = "/placeholder.png";
                }}
              />

              <div className="card-body d-flex flex-column">
                <small className="text-muted">
                  {product.category}
                </small>

                <h5 className="card-title mt-2">
                  {product.name}
                </h5>

                <p className="card-text text-muted">
                  {product.description}
                </p>

                <div className="mt-auto">
                  <h5 className="fw-bold">
                    KSh{" "}
                    {Number(product.price || 0).toLocaleString()}
                  </h5>

                  <small className="text-muted">
                    per {product.unit}
                  </small>

                  <div className="d-grid mt-3">
                    <Link
                      to={`/products/${product.id}`}
                      className="btn btn-success"
                    >
                      View Product
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  )}
</div>


);
}

export default Products;
