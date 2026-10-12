import { Link } from "react-router-dom";
import {
  STORE_NAME,
  STORE_TAGLINE,
  STORE_LOCATION,
} from "../config/store";

function Home() {
  const categories = [
    {
      icon: "bi-heart-pulse",
      title: "Veterinary Medicines",
      description: "Products for livestock and animal health",
    },
    {
      icon: "bi-egg",
      title: "Poultry",
      description: "Feeds, supplements and poultry products",
    },
    {
      icon: "bi-flower1",
      title: "Crop Protection",
      description: "Products to protect your crops",
    },
    {
      icon: "bi-tree",
      title: "Seeds & Fertilizers",
      description: "Everything you need for better crops",
    },
  ];

  return (
    <>
      {/* HERO SECTION */}
      <section className="hero-section">
        <div className="container">
          <div className="row align-items-center min-vh-75">

            <div className="col-lg-7">

              <span className="badge bg-success-subtle text-success mb-3 px-3 py-2">
                🌱 Trusted Agrovet
              </span>

              <h1 className="display-4 fw-bold mb-3">
                Quality products for your farm & animals
              </h1>

              <p className="lead text-secondary mb-4">
                {STORE_TAGLINE}. Shop agricultural and veterinary
                products conveniently from {STORE_NAME}.
              </p>

              <div className="d-flex flex-wrap gap-3">

                <Link
                  to="/products"
                  className="btn btn-success btn-lg px-4"
                >
                  <i className="bi bi-shop me-2"></i>
                  Shop Products
                </Link>

                <Link
                  to="/ask-agrovet"
                  className="btn btn-outline-success btn-lg px-4"
                >
                  <i className="bi bi-chat-dots me-2"></i>
                  Ask the Agrovet
                </Link>

              </div>

              <div className="mt-4 text-secondary">
                <i className="bi bi-geo-alt me-2"></i>
                {STORE_LOCATION}
              </div>

            </div>

            <div className="col-lg-5 mt-5 mt-lg-0">

              <div className="hero-card">

                <div className="hero-icon">
                  <i className="bi bi-flower1"></i>
                </div>

                <h3 className="fw-bold mt-3">
                  Everything you need
                </h3>

                <p className="text-secondary">
                  From animal health products to farm supplies,
                  we've got you covered.
                </p>

                <div className="row text-center mt-4">

                  <div className="col-4">
                    <i className="bi bi-shield-check fs-2 text-success"></i>
                    <small className="d-block mt-2">
                      Trusted
                    </small>
                  </div>

                  <div className="col-4">
                    <i className="bi bi-cart-check fs-2 text-success"></i>
                    <small className="d-block mt-2">
                      Easy Orders
                    </small>
                  </div>

                  <div className="col-4">
                    <i className="bi bi-truck fs-2 text-success"></i>
                    <small className="d-block mt-2">
                      Delivery
                    </small>
                  </div>

                </div>

              </div>

            </div>

          </div>
        </div>
      </section>


      {/* CATEGORIES */}
      <section className="py-5 bg-white">

        <div className="container">

          <div className="text-center mb-5">

            <span className="text-success fw-semibold">
              SHOP BY CATEGORY
            </span>

            <h2 className="fw-bold mt-2">
              What are you looking for?
            </h2>

            <p className="text-secondary">
              Find the products you need quickly.
            </p>

          </div>


          <div className="row g-4">

            {categories.map((category, index) => (

              <div className="col-md-6 col-lg-3" key={index}>

                <Link
                  to="/products"
                  className="text-decoration-none text-dark"
                >

                  <div className="category-card h-100">

                    <div className="category-icon">
                      <i className={`bi ${category.icon}`}></i>
                    </div>

                    <h5 className="fw-bold mt-3">
                      {category.title}
                    </h5>

                    <p className="text-secondary mb-0">
                      {category.description}
                    </p>

                    <div className="mt-3 text-success fw-semibold">
                      Browse
                      <i className="bi bi-arrow-right ms-2"></i>
                    </div>

                  </div>

                </Link>

              </div>

            ))}

          </div>

        </div>

      </section>


      {/* HOW IT WORKS */}
      <section className="py-5">

        <div className="container">

          <div className="text-center mb-5">

            <span className="text-success fw-semibold">
              SIMPLE & CONVENIENT
            </span>

            <h2 className="fw-bold mt-2">
              How ordering works
            </h2>

          </div>


          <div className="row g-4 text-center">

            <div className="col-md-4">

              <div className="how-card">

                <div className="step-number">
                  1
                </div>

                <h5 className="fw-bold">
                  Browse Products
                </h5>

                <p className="text-secondary">
                  Find the agricultural or veterinary products
                  you need.
                </p>

              </div>

            </div>


            <div className="col-md-4">

              <div className="how-card">

                <div className="step-number">
                  2
                </div>

                <h5 className="fw-bold">
                  Place Your Order
                </h5>

                <p className="text-secondary">
                  Add products to your cart and send your order
                  to the agrovet.
                </p>

              </div>

            </div>


            <div className="col-md-4">

              <div className="how-card">

                <div className="step-number">
                  3
                </div>

                <h5 className="fw-bold">
                  Pickup or Delivery
                </h5>

                <p className="text-secondary">
                  Choose to collect your order or have it
                  delivered.
                </p>

              </div>

            </div>

          </div>

        </div>

      </section>


      {/* CALL TO ACTION */}
      <section className="cta-section py-5">

        <div className="container text-center">

          <h2 className="fw-bold">
            Need help finding a product?
          </h2>

          <p className="mb-4">
            Talk to our agrovet team and we'll help you find
            what you need.
          </p>

          <Link
            to="/ask-agrovet"
            className="btn btn-light btn-lg px-4"
          >
            <i className="bi bi-chat-dots me-2"></i>
            Talk to the Agrovet
          </Link>

        </div>

      </section>

    </>
  );
}

export default Home;