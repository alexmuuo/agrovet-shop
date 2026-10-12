import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import api from "../api/api";

function Cart() {
  const {
    cartItems,
    cartTotal,
    updateQuantity,
    removeFromCart,
  } = useCart();

  if (cartItems.length === 0) {
    return (
      <div className="container py-5">
        <div className="text-center py-5">

          <i className="bi bi-cart-x display-1 text-secondary"></i>

          <h2 className="fw-bold mt-4">
            Your cart is empty
          </h2>

          <p className="text-secondary">
            You haven't added any products yet.
          </p>

          <Link
            to="/products"
            className="btn btn-success mt-3"
          >
            <i className="bi bi-shop me-2"></i>
            Browse Products
          </Link>

        </div>
      </div>
    );
  }

  return (
    <div className="container py-5">

      <div className="mb-5">
        <span className="text-success fw-semibold">
          YOUR SHOPPING CART
        </span>

        <h1 className="fw-bold mt-2">
          Cart
        </h1>
      </div>

      <div className="row g-4">

        {/* Cart Items */}
        <div className="col-lg-8">

          {cartItems.map((item) => (
            <div
              key={item.id}
              className="card border-0 shadow-sm mb-3"
            >
              <div className="card-body">

                <div className="row align-items-center g-3">

                  <div className="col-3 col-md-2">
                   <img
  src={
    item.image
      ? /^https?:\/\//i.test(String(item.image))
        ? item.image
        : new URL(
            String(item.image).startsWith("/api/")
              ? item.image
              : `/api/product-images/${String(item.image)
                  .replace(/\\/g, "/")
                  .split("/")
                  .pop()}`,
            api.defaults.baseURL || "http://127.0.0.1:5000"
          ).href
      : ""
  }
  alt={item.name}
  className="cart-product-image"
  onError={(event) => {
    console.error(
      "Cart product image failed to load:",
      event.currentTarget.src
    );
  }}
/>
                  </div>

                  <div className="col-9 col-md-4">

                    <small className="text-success fw-semibold">
                      {item.category}
                    </small>

                    <h5 className="fw-bold mb-1">
                      {item.name}
                    </h5>

                    <small className="text-secondary">
                      {item.unit}
                    </small>

                  </div>

                  <div className="col-6 col-md-2">

                    <label className="small text-secondary">
                      Quantity
                    </label>

                    <input
                      type="number"
                      min="1"
                      max={item.stock}
                      value={item.quantity}
                      className="form-control"
                      onChange={(e) =>
                        updateQuantity(
                          item.id,
                          e.target.value
                        )
                      }
                    />

                  </div>

                  <div className="col-6 col-md-2 text-end">

                    <small className="text-secondary">
                      Price
                    </small>

                    <div className="fw-bold">
                      KSh{" "}
                      {(
                        item.price * item.quantity
                      ).toLocaleString()}
                    </div>

                  </div>

                  <div className="col-12 col-md-2 text-md-end">

                    <button
                      className="btn btn-outline-danger btn-sm"
                      onClick={() =>
                        removeFromCart(item.id)
                      }
                    >
                      <i className="bi bi-trash me-1"></i>
                      Remove
                    </button>

                  </div>

                </div>

              </div>
            </div>
          ))}

        </div>

        {/* Summary */}
        <div className="col-lg-4">

          <div className="card border-0 shadow-sm">

            <div className="card-body p-4">

              <h4 className="fw-bold mb-4">
                Order Summary
              </h4>

              <div className="d-flex justify-content-between mb-3">
                <span className="text-secondary">
                  Subtotal
                </span>

                <span className="fw-semibold">
                  KSh {cartTotal.toLocaleString()}
                </span>
              </div>

              <div className="d-flex justify-content-between mb-3">
                <span className="text-secondary">
                  Delivery
                </span>

                <span className="text-secondary">
                  Calculated at checkout
                </span>
              </div>

              <hr />

              <div className="d-flex justify-content-between mb-4">
                <span className="fw-bold">
                  Total
                </span>

                <span className="fw-bold text-success fs-5">
                  KSh {cartTotal.toLocaleString()}
                </span>
              </div>

              <Link
                to="/checkout"
                className="btn btn-success btn-lg w-100"
              >
                Proceed to Checkout
                <i className="bi bi-arrow-right ms-2"></i>
              </Link>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}

export default Cart;