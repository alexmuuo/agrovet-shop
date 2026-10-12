import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import api from "../api/api";

const POLL_INTERVAL = 3000;
const MAX_POLL_ATTEMPTS = 60;

function Checkout() {
  const { cartItems, cartTotal, clearCart } = useCart();
  const navigate = useNavigate();

  const loggedInCustomer = JSON.parse(
    localStorage.getItem("customer") || "null"
  );

  const [formData, setFormData] = useState({
    name: loggedInCustomer?.name || "",
    phone: loggedInCustomer?.phone || "",
    email: loggedInCustomer?.email || "",
    orderType: "pickup",
    location: "",
    notes: "",
    paymentMethod: "mpesa",
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  // Retain the order if payment initiation fails or times out.
  const [pendingOrder, setPendingOrder] = useState(null);

  // Prevent overlapping payment polling loops.
  const pollingRef = useRef(false);

  const sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  // =========================================================
  // VERIFY PAYMENT STATUS WITH THE BACKEND
  // =========================================================

  const checkPaymentStatus = async (order) => {
    if (!order?.id) {
      throw new Error("The order ID is missing.");
    }

    const response = await api.get(
      `/payments/status/${order.id}`
    );

    return response.data;
  };

  // =========================================================
  // POLL UNTIL PAYMENT IS VERIFIED, FAILED, OR TIMES OUT
  // =========================================================

  const waitForPaymentConfirmation = async (order) => {
    if (pollingRef.current) {
      return;
    }

    pollingRef.current = true;

    setSubmitting(true);
    setError("");
    setStatusMessage(
      "Waiting for M-Pesa confirmation. Please complete the prompt on your phone."
    );

    let consecutiveErrors = 0;

    try {
      for (
        let attempt = 0;
        attempt < MAX_POLL_ATTEMPTS;
        attempt++
      ) {
        if (attempt > 0) {
          await sleep(POLL_INTERVAL);
        }

        let payment;

        try {
          payment = await checkPaymentStatus(order);
          consecutiveErrors = 0;
        } catch (err) {
          console.error(
            "Could not check payment status:",
            err
          );

          consecutiveErrors++;

          // Retry temporary network/server errors.
          if (consecutiveErrors < 5) {
            setStatusMessage(
              "Reconnecting to the payment service. Your order is being retained."
            );
            continue;
          }

          setError(
            "We couldn't verify your payment because the payment service is unavailable. Your cart has been retained. Please try checking again."
          );

          setStatusMessage("");
          return;
        }

        const paymentStatus = String(
          payment.payment_status || ""
        ).toLowerCase();

        const transactionStatus = String(
          payment.transaction_status || ""
        ).toLowerCase();

        // Only the backend's verified paid status permits success.
        if (
          paymentStatus === "paid" &&
          transactionStatus === "paid"
        ) {
          setStatusMessage(
            "Payment confirmed successfully!"
          );

          const confirmedOrder = {
            ...order,
            payment_status: "paid",
          };

          clearCart();
          setPendingOrder(null);

          navigate("/order-confirmation", {
            replace: true,
            state: {
              order: confirmedOrder,
              payment: {
                method: "mpesa",
                status: "paid",
                receipt: payment.receipt || null,
                message:
                  payment.message ||
                  "Your M-Pesa payment has been confirmed.",
              },
            },
          });

          return;
        }

        if (
          paymentStatus === "failed" ||
          transactionStatus === "failed"
        ) {
          setStatusMessage("");

          setError(
            payment.message ||
              "M-Pesa payment failed. Your cart has been retained. You can retry payment for the same order."
          );

          return;
        }

        if (
          transactionStatus === "not_initiated"
        ) {
          setStatusMessage(
            "No active payment request was found. You can retry payment for this order."
          );

          return;
        }

        setStatusMessage(
          `Waiting for payment confirmation... (${attempt + 1}/${MAX_POLL_ATTEMPTS})`
        );
      }

      setStatusMessage("");

      setError(
        "Payment confirmation is taking longer than expected. Do not place another order. Your cart has been retained; check your M-Pesa messages and try checking payment again."
      );
    } finally {
      pollingRef.current = false;
      setSubmitting(false);
    }
  };

  // =========================================================
  // INITIATE M-PESA PAYMENT FOR AN EXISTING ORDER
  // =========================================================

  const initiateMpesaPayment = async (order) => {
    if (!order?.id) {
      setError(
        "The order ID is missing. Please contact support before retrying."
      );
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      setStatusMessage(
        "Connecting to M-Pesa..."
      );

      const response = await api.post(
        "/payments/stk-push",
        {
          order_id: order.id,
          phone: formData.phone.trim(),
        }
      );

      console.log(
        "M-Pesa STK Push initiated:",
        response.data
      );

      setStatusMessage(
        "Payment prompt requested. Check your phone and enter your M-Pesa PIN."
      );
    } catch (err) {
      console.error(
        "M-Pesa payment initiation response:",
        err
      );

      const status = err.response?.status;
      const data = err.response?.data || {};

      /*
       * A 409 response indicating an existing pending payment
       * may mean the earlier STK Push was successfully initiated.
       *
       * Check the existing payment status instead of creating
       * another order or immediately declaring success.
       */
      if (
        status === 409 &&
        String(data.payment_status || "").toLowerCase() ===
          "pending"
      ) {
        setStatusMessage(
          "An M-Pesa payment request may already be active. Checking its status..."
        );
      } else {
        setStatusMessage("");

        setError(
          `${data.error || data.message || "Could not initiate M-Pesa payment."} Your order has been retained. You can retry using the same order.`
        );

        return;
      }
    } finally {
      setSubmitting(false);
    }

    // Whether the STK Push response succeeded or an existing
    // pending request was detected, verify the actual payment.
    await waitForPaymentConfirmation(order);
  };

  // =========================================================
  // RESUME PAYMENT STATUS CHECKING
  // =========================================================

  const resumePaymentCheck = async () => {
    if (!pendingOrder || submitting) {
      return;
    }

    await waitForPaymentConfirmation(pendingOrder);
  };

  // =========================================================
  // SUBMIT CHECKOUT
  // =========================================================

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setStatusMessage("");

    if (submitting) {
      return;
    }

    if (cartItems.length === 0 && !pendingOrder) {
      setError("Your cart is empty.");
      return;
    }

    if (
      !formData.name.trim() ||
      !formData.phone.trim()
    ) {
      setError(
        "Please provide your name and phone number."
      );
      return;
    }

    if (
      formData.orderType === "delivery" &&
      !formData.location.trim() &&
      !pendingOrder
    ) {
      setError("Please enter your delivery location.");
      return;
    }

    // Never create a second order when one already exists.
    if (pendingOrder) {
      await initiateMpesaPayment(pendingOrder);
      return;
    }

    try {
      setSubmitting(true);

      const orderData = {
        customer: {
          id: loggedInCustomer?.id || null,
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim() || null,
        },

        order_type: formData.orderType,

        delivery_location:
          formData.orderType === "delivery"
            ? formData.location.trim()
            : null,

        payment_method: formData.paymentMethod,

        notes: formData.notes.trim() || null,

        items: cartItems.map((item) => ({
          product_id: item.id,
          quantity: item.quantity,
        })),
      };

      // STEP 1: CREATE THE ORDER

      const orderResponse = await api.post(
        "/orders",
        orderData
      );

      const order = orderResponse.data?.order;

      if (!order?.id) {
        throw new Error(
          "The server response did not contain an order ID."
        );
      }

      console.log("Order created:", order);

      // STEP 2A: M-PESA CHECKOUT

      if (formData.paymentMethod === "mpesa") {
        // Save the order before initiating payment.
        setPendingOrder(order);
        setSubmitting(false);

        await initiateMpesaPayment(order);
        return;
      }

      // STEP 2B: CASH CHECKOUT

      clearCart();

      navigate("/order-confirmation", {
        replace: true,
        state: {
          order,
          payment: {
            method: "cash",
            status: "pending",
            message:
              "Your order has been placed. Payment is due on pickup or delivery.",
          },
        },
      });
    } catch (err) {
      console.error("Order creation failed:", err);

      const message =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        "Could not place your order. Please try again.";

      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // =========================================================
  // EMPTY CART
  // =========================================================

  if (
    cartItems.length === 0 &&
    !pendingOrder
  ) {
    return (
      <div className="container py-5 text-center">
        <i className="bi bi-cart-x display-1 text-secondary"></i>

        <h2 className="fw-bold mt-4">
          Your cart is empty
        </h2>

        <p className="text-secondary">
          Add some products before checking out.
        </p>

        <Link
          to="/products"
          className="btn btn-success"
        >
          Browse Products
        </Link>
      </div>
    );
  }

  // =========================================================
  // CHECKOUT UI
  // =========================================================

  return (
    <div className="container py-5">
      <div className="mb-5">
        <span className="text-success fw-semibold">
          CHECKOUT
        </span>

        <h1 className="fw-bold mt-2">
          Complete Your Order
        </h1>

        <p className="text-secondary">
          Enter your details and choose how you would
          like to receive your order.
        </p>
      </div>

      {error && (
        <div
          className="alert alert-danger mb-4"
          role="alert"
        >
          <i className="bi bi-exclamation-triangle me-2"></i>
          {error}
        </div>
      )}

      {statusMessage && (
        <div
          className="alert alert-info mb-4"
          role="status"
          aria-live="polite"
        >
          {submitting && (
            <span
              className="spinner-border spinner-border-sm me-2"
              aria-hidden="true"
            ></span>
          )}

          {statusMessage}
        </div>
      )}

      {pendingOrder && (
        <div className="alert alert-warning mb-4">
          <h5 className="fw-bold">
            Order created — payment not yet confirmed
          </h5>

          <p className="mb-2">
            Order number:{" "}
            <strong>
              {pendingOrder.order_number ||
                pendingOrder.id}
            </strong>
          </p>

          <p className="mb-0">
            Your order is being retained while we check
            payment. Do not place another order for the
            same purchase.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="row g-4">
          {/* CUSTOMER DETAILS */}

          <div className="col-lg-7">
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body p-4">
                <h4 className="fw-bold mb-4">
                  <i className="bi bi-person me-2 text-success"></i>
                  Customer Details
                </h4>

                <div className="mb-3">
                  <label
                    className="form-label fw-semibold"
                    htmlFor="customer-name"
                  >
                    Full Name
                  </label>

                  <input
                    id="customer-name"
                    type="text"
                    name="name"
                    className="form-control"
                    placeholder="Enter your full name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    disabled={!!pendingOrder || submitting}
                  />
                </div>

                <div className="mb-3">
                  <label
                    className="form-label fw-semibold"
                    htmlFor="customer-phone"
                  >
                    M-Pesa / Contact Phone Number
                  </label>

                  <input
                    id="customer-phone"
                    type="tel"
                    name="phone"
                    className="form-control"
                    placeholder="07XXXXXXXX"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                    disabled={submitting}
                  />

                  <small className="text-secondary">
                    For M-Pesa, use the phone number that
                    should receive the payment prompt.
                  </small>
                </div>

                <div className="mb-3">
                  <label
                    className="form-label fw-semibold"
                    htmlFor="customer-email"
                  >
                    Email{" "}
                    <span className="text-secondary fw-normal">
                      (optional)
                    </span>
                  </label>

                  <input
                    id="customer-email"
                    type="email"
                    name="email"
                    className="form-control"
                    placeholder="example@email.com"
                    value={formData.email}
                    onChange={handleChange}
                    disabled={!!pendingOrder || submitting}
                  />
                </div>
              </div>
            </div>

            {/* ORDER FULFILMENT */}

            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body p-4">
                <h4 className="fw-bold mb-4">
                  <i className="bi bi-truck me-2 text-success"></i>
                  Order Fulfilment
                </h4>

                <div className="row g-3">
                  <div className="col-md-6">
                    <div className="form-check checkout-option">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="orderType"
                        value="pickup"
                        id="pickup"
                        checked={
                          formData.orderType === "pickup"
                        }
                        onChange={handleChange}
                        disabled={!!pendingOrder || submitting}
                      />

                      <label
                        className="form-check-label"
                        htmlFor="pickup"
                      >
                        <strong>Pickup</strong>

                        <small className="d-block text-secondary">
                          Collect from the agrovet
                        </small>
                      </label>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-check checkout-option">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="orderType"
                        value="delivery"
                        id="delivery"
                        checked={
                          formData.orderType === "delivery"
                        }
                        onChange={handleChange}
                        disabled={!!pendingOrder || submitting}
                      />

                      <label
                        className="form-check-label"
                        htmlFor="delivery"
                      >
                        <strong>Delivery</strong>

                        <small className="d-block text-secondary">
                          Have your order delivered
                        </small>
                      </label>
                    </div>
                  </div>
                </div>

                {formData.orderType === "delivery" && (
                  <div className="mt-4">
                    <label
                      className="form-label fw-semibold"
                      htmlFor="delivery-location"
                    >
                      Delivery Location
                    </label>

                    <textarea
                      id="delivery-location"
                      name="location"
                      className="form-control"
                      rows="3"
                      placeholder="Enter your delivery location..."
                      value={formData.location}
                      onChange={handleChange}
                      required
                      disabled={!!pendingOrder || submitting}
                    ></textarea>
                  </div>
                )}
              </div>
            </div>

            {/* PAYMENT METHOD */}

            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body p-4">
                <h4 className="fw-bold mb-4">
                  <i className="bi bi-credit-card me-2 text-success"></i>
                  Payment Method
                </h4>

                <div className="form-check checkout-option mb-3">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="paymentMethod"
                    value="mpesa"
                    id="mpesa"
                    checked={
                      formData.paymentMethod === "mpesa"
                    }
                    onChange={handleChange}
                    disabled={!!pendingOrder || submitting}
                  />

                  <label
                    className="form-check-label"
                    htmlFor="mpesa"
                  >
                    <strong>M-Pesa</strong>

                    <small className="d-block text-secondary">
                      Receive a payment prompt on your phone
                    </small>
                  </label>
                </div>

                <div className="form-check checkout-option">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="paymentMethod"
                    value="cash"
                    id="cash"
                    checked={
                      formData.paymentMethod === "cash"
                    }
                    onChange={handleChange}
                    disabled={!!pendingOrder || submitting}
                  />

                  <label
                    className="form-check-label"
                    htmlFor="cash"
                  >
                    <strong>Pay on Pickup / Delivery</strong>

                    <small className="d-block text-secondary">
                      Pay when receiving your order
                    </small>
                  </label>
                </div>
              </div>
            </div>

            {/* ORDER NOTES */}

            <div className="card border-0 shadow-sm">
              <div className="card-body p-4">
                <h4 className="fw-bold mb-4">
                  <i className="bi bi-chat-left-text me-2 text-success"></i>
                  Order Notes
                </h4>

                <textarea
                  name="notes"
                  className="form-control"
                  rows="4"
                  placeholder="Any additional information about your order?"
                  value={formData.notes}
                  onChange={handleChange}
                  disabled={!!pendingOrder || submitting}
                ></textarea>
              </div>
            </div>
          </div>

          {/* ORDER SUMMARY */}

          <div className="col-lg-5">
            <div className="card border-0 shadow-sm checkout-summary">
              <div className="card-body p-4">
                <h4 className="fw-bold mb-4">
                  Order Summary
                </h4>

                {pendingOrder ? (
                  <>
                    <div className="d-flex justify-content-between mb-3">
                      <span>Order number</span>

                      <strong>
                        {pendingOrder.order_number ||
                          pendingOrder.id}
                      </strong>
                    </div>

                    <div className="d-flex justify-content-between mb-3">
                      <span>Payment status</span>

                      <span className="badge bg-warning text-dark">
                        Not confirmed
                      </span>
                    </div>
                  </>
                ) : (
                  cartItems.map((item) => (
                    <div
                      key={item.id}
                      className="d-flex justify-content-between mb-3"
                    >
                      <div>
                        <strong>{item.name}</strong>

                        <small className="d-block text-secondary">
                          {item.quantity} × KSh{" "}
                          {Number(item.price).toLocaleString()}
                        </small>
                      </div>

                      <span className="fw-semibold">
                        KSh{" "}
                        {(
                          Number(item.price) *
                          item.quantity
                        ).toLocaleString()}
                      </span>
                    </div>
                  ))
                )}

                <hr />

                <div className="d-flex justify-content-between mb-3">
                  <span className="text-secondary">
                    Subtotal
                  </span>

                  <span>
                    KSh{" "}
                    {Number(
                      pendingOrder
                        ? pendingOrder.total
                        : cartTotal
                    ).toLocaleString()}
                  </span>
                </div>

                <div className="d-flex justify-content-between mb-3">
                  <span className="text-secondary">
                    Delivery
                  </span>

                  <span className="text-secondary">
                    To be confirmed
                  </span>
                </div>

                <hr />

                <div className="d-flex justify-content-between mb-4">
                  <strong className="fs-5">
                    Total
                  </strong>

                  <strong className="fs-5 text-success">
                    KSh{" "}
                    {Number(
                      pendingOrder
                        ? pendingOrder.total
                        : cartTotal
                    ).toLocaleString()}
                  </strong>
                </div>

                <button
                  type="submit"
                  className="btn btn-success btn-lg w-100"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm me-2"
                        role="status"
                        aria-hidden="true"
                      ></span>

                      {pendingOrder
                        ? "Checking Payment..."
                        : "Processing Order..."}
                    </>
                  ) : pendingOrder ? (
                    <>
                      <i className="bi bi-arrow-repeat me-2"></i>
                      Retry Payment
                    </>
                  ) : formData.paymentMethod === "mpesa" ? (
                    <>
                      <i className="bi bi-phone me-2"></i>
                      Place Order & Pay
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check-circle me-2"></i>
                      Place Order
                    </>
                  )}
                </button>

                {pendingOrder && (
                  <button
                    type="button"
                    className="btn btn-outline-success w-100 mt-2"
                    onClick={resumePaymentCheck}
                    disabled={submitting}
                  >
                    <i className="bi bi-arrow-clockwise me-2"></i>
                    Check Payment Status
                  </button>
                )}

                {!pendingOrder && (
                  <Link
                    to="/cart"
                    className="btn btn-outline-secondary w-100 mt-2"
                  >
                    <i className="bi bi-arrow-left me-2"></i>
                    Back to Cart
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default Checkout;