import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/api";

const styles = `
  .hm-products {
    min-height: 100vh;
    background: #f7f6f2;
    color: #20251f;
    padding-bottom: 72px;
  }

  .hm-products * {
    box-sizing: border-box;
  }

  .hm-products-hero {
    position: relative;
    overflow: hidden;
    background: #17251d;
    color: #fff;
    padding: 68px 24px 62px;
  }

  .hm-products-hero::before {
    content: "";
    position: absolute;
    width: 340px;
    height: 340px;
    border: 1px solid rgba(212, 175, 55, .2);
    border-radius: 50%;
    right: -90px;
    top: -150px;
    box-shadow:
      0 0 0 35px rgba(212, 175, 55, .035),
      0 0 0 75px rgba(212, 175, 55, .025);
    pointer-events: none;
  }

  .hm-products-hero-inner {
    max-width: 1200px;
    margin: 0 auto;
    position: relative;
    z-index: 1;
  }

  .hm-eyebrow {
    color: #d7b65b;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 3px;
    text-transform: uppercase;
    margin-bottom: 17px;
  }

  .hm-products-hero h1 {
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(38px, 6vw, 65px);
    font-weight: 700;
    letter-spacing: -1.5px;
    line-height: 1.08;
    margin: 0 0 18px;
    max-width: 760px;
    overflow-wrap: anywhere;
  }

  .hm-products-hero p {
    color: #d0d7d0;
    font-size: 16px;
    line-height: 1.8;
    max-width: 590px;
    margin: 0;
  }

  .hm-products-hero-rule {
    width: 58px;
    height: 3px;
    background: #d7b65b;
    margin: 25px 0 0;
  }

  .hm-products-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 36px 24px 0;
  }

  .hm-products-topline {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 18px;
    margin-bottom: 23px;
    flex-wrap: wrap;
  }

  .hm-products-topline h2 {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 29px;
    font-weight: 700;
    margin: 0 0 6px;
    color: #20251f;
  }

  .hm-products-topline p {
    color: #74786f;
    font-size: 14px;
    margin: 0;
  }

  .hm-products-count {
    color: #52624f;
    background: #e8ede5;
    border-radius: 30px;
    padding: 9px 15px;
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }

  .hm-category-list {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 35px;
    padding-bottom: 25px;
    border-bottom: 1px solid #e4e3dc;
  }

  .hm-category-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    padding: 10px 17px;
    min-height: 42px;
    border: 1px solid #dedfd6;
    border-radius: 4px;
    color: #394238;
    background: #fff;
    font-size: 13px;
    font-weight: 700;
    transition: background .2s, color .2s, border-color .2s;
  }

  .hm-category-link:hover {
    border-color: #244532;
    color: #244532;
    background: #edf1eb;
  }

  .hm-category-link.active {
    background: #244532;
    color: #fff;
    border-color: #244532;
  }

  .hm-product-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 24px;
  }

  .hm-product-card {
    min-width: 0;
    background: #fff;
    border: 1px solid #e9e7df;
    border-radius: 5px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: transform .22s ease, box-shadow .22s ease;
  }

  .hm-product-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 14px 32px rgba(29, 40, 29, .09);
  }

  .hm-product-image-wrap {
    position: relative;
    height: 245px;
    overflow: hidden;
    background: #efeee8;
  }

  .hm-product-image {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
    padding: 15px;
    transition: transform .3s ease;
  }

  .hm-product-card:hover .hm-product-image {
    transform: scale(1.045);
  }

  .hm-product-category {
    position: absolute;
    left: 13px;
    top: 13px;
    max-width: calc(100% - 26px);
    padding: 6px 10px;
    background: rgba(255, 255, 255, .94);
    color: #354b38;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .8px;
    text-transform: uppercase;
    border-radius: 3px;
    overflow-wrap: anywhere;
  }

  .hm-product-card-body {
    padding: 19px 18px 18px;
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  .hm-product-name {
    color: #20251f;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 19px;
    font-weight: 700;
    line-height: 1.35;
    margin: 0 0 9px;
    overflow-wrap: anywhere;
  }

  .hm-product-description {
    color: #74786f;
    font-size: 13px;
    line-height: 1.7;
    margin: 0 0 20px;
    overflow-wrap: anywhere;
  }

  .hm-product-bottom {
    border-top: 1px solid #eeede7;
    padding-top: 16px;
    margin-top: auto;
  }

  .hm-product-price-label {
    color: #85877f;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1.3px;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .hm-product-price {
    color: #244532;
    font-size: 24px;
    font-weight: 800;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  .hm-product-unit {
    color: #85877f;
    font-size: 12px;
    margin-top: 3px;
  }

  .hm-product-button {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    margin-top: 17px;
    padding: 12px 14px;
    background: #244532;
    color: #fff;
    border: 1px solid #244532;
    border-radius: 3px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .5px;
    text-decoration: none;
    transition: background .2s, border-color .2s;
  }

  .hm-product-button:hover {
    background: #182c20;
    border-color: #182c20;
    color: #fff;
  }

  .hm-products-empty {
    background: #fff;
    border: 1px solid #e9e7df;
    text-align: center;
    padding: 65px 20px;
    border-radius: 5px;
  }

  .hm-products-empty-icon {
    font-size: 40px;
    color: #a7ad9e;
    margin-bottom: 15px;
  }

  .hm-products-empty h3 {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 25px;
    font-weight: 700;
    margin-bottom: 10px;
  }

  .hm-products-empty p {
    color: #74786f;
    font-size: 14px;
  }

  .hm-products-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 11px 19px;
    background: #244532;
    color: #fff;
    border-radius: 3px;
    text-decoration: none;
    font-size: 13px;
    font-weight: 700;
    margin-top: 10px;
  }

  .hm-products-action:hover {
    background: #182c20;
    color: #fff;
  }

  .hm-products-state {
    max-width: 1200px;
    margin: 55px auto;
    padding: 0 24px;
  }

  .hm-products-state-box {
    background: #fff;
    border: 1px solid #e9e7df;
    padding: 35px;
    border-radius: 5px;
    text-align: center;
  }

  .hm-products-state-box h2 {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 26px;
    margin-bottom: 12px;
  }

  .hm-products-state-box p {
    color: #74786f;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }

  .hm-products-retry {
    background: #244532;
    color: #fff;
    border: 0;
    padding: 11px 18px;
    border-radius: 3px;
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
  }

  .hm-products-retry:hover {
    background: #182c20;
  }

  .hm-products-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 15px;
    min-height: 350px;
    color: #667064;
  }

  .hm-products-spinner {
    width: 37px;
    height: 37px;
    border: 3px solid #dce3d8;
    border-top-color: #244532;
    border-radius: 50%;
    animation: hm-product-spin .8s linear infinite;
  }

  @keyframes hm-product-spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 1000px) {
    .hm-product-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px;
    }

    .hm-product-image-wrap {
      height: 220px;
    }
  }

  @media (max-width: 700px) {
    .hm-products-hero {
      padding: 49px 20px 45px;
    }

    .hm-products-content {
      padding: 28px 16px 0;
    }

    .hm-products-topline h2 {
      font-size: 25px;
    }

    .hm-product-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 13px;
    }

    .hm-product-image-wrap {
      height: 185px;
    }

    .hm-product-card-body {
      padding: 14px 12px;
    }

    .hm-product-name {
      font-size: 16px;
    }

    .hm-product-description {
      font-size: 12px;
      margin-bottom: 15px;
    }

    .hm-product-price {
      font-size: 20px;
    }

    .hm-category-link {
      padding: 9px 12px;
      font-size: 12px;
    }
  }

  @media (max-width: 380px) {
    .hm-product-grid {
      grid-template-columns: 1fr;
    }

    .hm-product-image-wrap {
      height: 245px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hm-products *,
    .hm-products *::before,
    .hm-products *::after {
      animation-duration: .01ms !important;
      transition-duration: .01ms !important;
    }
  }
`;

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
    const configuredBaseUrl = api.defaults.baseURL || "";
    const backendBaseUrl = configuredBaseUrl.replace(/\/api\/?$/, "");

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
              "Could not load products. Please check your connection and try again."
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

  const formatPrice = (price) => {
    return Number(price || 0).toLocaleString("en-KE", {
      maximumFractionDigits: 2,
    });
  };

  if (loading) {
    return (
      <>
        <style>{styles}</style>

        <main className="hm-products">
          <div className="hm-products-loading" role="status">
            <div className="hm-products-spinner" aria-hidden="true" />
            <span>Discovering our collection...</span>
          </div>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <style>{styles}</style>

        <main className="hm-products">
          <section className="hm-products-state">
            <div className="hm-products-state-box" role="alert">
              <div className="hm-eyebrow">Headmaster Liquors</div>
              <h2>We couldn't load the collection</h2>
              <p>{error}</p>

              <button
                type="button"
                className="hm-products-retry"
                onClick={() => window.location.reload()}
              >
                Try Again
              </button>
            </div>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <style>{styles}</style>

      <main className="hm-products">
        <section className="hm-products-hero">
          <div className="hm-products-hero-inner">
            <div className="hm-eyebrow">
              Headmaster Liquors · The Collection
            </div>

            <h1>
              Find your
              <br />
              next favourite.
            </h1>

            <p>
              Explore our collection and discover something worth
              sharing. Browse the range, find your pick, and view the
              details before adding it to your occasion.
            </p>

            <div className="hm-products-hero-rule" />
          </div>
        </section>

        <section className="hm-products-content">
          <div className="hm-products-topline">
            <div>
              <h2>
                {selectedCategory || "Explore the Collection"}
              </h2>

              <p>
                Take your time. Find the right bottle for the moment.
              </p>
            </div>

            <div className="hm-products-count">
              {filteredProducts.length}{" "}
              {filteredProducts.length === 1 ? "PRODUCT" : "PRODUCTS"}
            </div>
          </div>

          <nav
            className="hm-category-list"
            aria-label="Filter products by category"
          >
            <Link
              to="/products"
              className={`hm-category-link ${
                !selectedCategory ? "active" : ""
              }`}
              aria-current={!selectedCategory ? "page" : undefined}
            >
              All Products
            </Link>

            {categories.map((category) => {
              const active =
                selectedCategory.toLowerCase() ===
                category.toLowerCase();

              return (
                <Link
                  key={category}
                  to={`/products?category=${encodeURIComponent(category)}`}
                  className={`hm-category-link ${
                    active ? "active" : ""
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  {category}
                </Link>
              );
            })}
          </nav>

          {filteredProducts.length === 0 ? (
            <div className="hm-products-empty">
              <div
                className="hm-products-empty-icon"
                aria-hidden="true"
              >
                <i className="bi bi-box-seam" />
              </div>

              <h3>No products found</h3>

              <p>
                {selectedCategory
                  ? `There are currently no products in "${selectedCategory}".`
                  : "There are no products available at the moment."}
              </p>

              {selectedCategory && (
                <Link
                  to="/products"
                  className="hm-products-action"
                >
                  Browse All Products
                </Link>
              )}
            </div>
          ) : (
            <div className="hm-product-grid">
              {filteredProducts.map((product) => {
                const imageUrl = getImageUrl(product.image);

                return (
                  <article
                    className="hm-product-card"
                    key={product.id}
                  >
                    <div className="hm-product-image-wrap">
                      <img
                        src={imageUrl}
                        className="hm-product-image"
                        alt={product.name || "Product"}
                        loading="lazy"
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

                      {product.category && (
                        <span className="hm-product-category">
                          {product.category}
                        </span>
                      )}
                    </div>

                    <div className="hm-product-card-body">
                      <h3 className="hm-product-name">
                        {product.name}
                      </h3>

                      {product.description && (
                        <p className="hm-product-description">
                          {product.description}
                        </p>
                      )}

                      <div className="hm-product-bottom">
                        <div className="hm-product-price-label">
                          Price
                        </div>

                        <div className="hm-product-price">
                          KSh {formatPrice(product.price)}
                        </div>

                        {product.unit && (
                          <div className="hm-product-unit">
                            Per {product.unit}
                          </div>
                        )}

                        <Link
                          to={`/products/${product.id}`}
                          className="hm-product-button"
                          aria-label={`View ${product.name}`}
                        >
                          VIEW PRODUCT{" "}
                          <span aria-hidden="true">&nbsp;→</span>
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

export default Products;
