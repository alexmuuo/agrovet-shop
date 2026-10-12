import { Link, useLocation } from "react-router-dom";

function OrderConfirmation() {
  const location = useLocation();
  const order = location.state?.order;

  if (!order) {
    return (
      <div className="container py-5 text-center">
        <i className="bi bi-receipt display-1 text-secondary"></i>

        <h2 className="fw-bold mt-4">
          No order found
        </h2>

        <p className="text-secondary">
          We couldn't find the order details.
        </p>

        <Link to="/products" className="btn btn-success">
          Browse Products
        </Link>
      </div>
    );
  }

  const customer = order.customer || {};

  // Read the payment method.
  const paymentMethod = String(
    customer.paymentMethod ||
      order.payment_method ||
      order.paymentMethod ||
      ""
  ).toLowerCase();

  const isMpesa = paymentMethod === "mpesa";

  // Only display Paid when the backend confirms payment.
  const paymentStatus = String(
    order.payment_status ||
      order.paymentStatus ||
      order.payment?.status ||
      ""
  ).toLowerCase();

  const isPaid = paymentStatus === "paid";

  const displayedPaymentStatus = isPaid
    ? "Paid"
    : paymentStatus === "failed"
      ? "Failed"
      : paymentStatus === "pending"
        ? "Payment Pending"
        : "Unpaid";

  const paymentBadgeClass = isPaid
    ? "bg-success-subtle text-success-emphasis"
    : paymentStatus === "failed"
      ? "bg-danger-subtle text-danger-emphasis"
      : "bg-warning-subtle text-warning-emphasis";

  // Use the real order status when available.
  const orderStatus = String(
    order.status || "pending"
  );

  const normalizedOrderStatus = orderStatus.toLowerCase();

  const orderBadgeClass =
    normalizedOrderStatus === "completed" ||
    normalizedOrderStatus === "delivered"
      ? "bg-success-subtle text-success-emphasis"
      : normalizedOrderStatus === "cancelled"
        ? "bg-danger-subtle text-danger-emphasis"
        : "bg-warning-subtle text-warning-emphasis";

  const items = Array.isArray(order.items)
    ? order.items
    : [];

  const total = Number(
    order.total ?? order.total_amount ?? 0
  );

  const formatMoney = (amount) =>
    Number(amount || 0).toLocaleString("en-KE");

  const paymentMethodLabel = isMpesa
    ? "M-Pesa"
    : paymentMethod === "cash" ||
        paymentMethod === "cod" ||
        paymentMethod === "cash_on_delivery" ||
        paymentMethod === "pay_on_delivery"
      ? "Cash on Delivery"
      : paymentMethod === "pickup" ||
          paymentMethod === "pay_on_pickup"
        ? "Pay on Pickup"
        : paymentMethod
          ? paymentMethod.replace(/_/g, " ")
          : "Not specified";

  const receiptNumber =
    order.mpesa_receipt_number ||
    order.mpesaReceiptNumber ||
    order.payment?.mpesa_receipt_number ||
    order.payment?.receipt ||
    null;

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-lg-8">
          {/* Confirmation heading */}
          <div className="text-center mb-5">
            <div className="order-success-icon">
              <i className="bi bi-check-lg"></i>
            </div>

            <h1 className="fw-bold mt-4">
              Order Received!
            </h1>

            <p className="text-secondary">
              Thank you, {customer.name || "Customer"}.
              Your order has been received successfully.
            </p>
          </div>

          {/* Order summary */}
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-body p-4">
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
                <div>
                  <small className="text-secondary">
                    Order Number
                  </small>

                  <h5 className="fw-bold mb-0">
                    {order.orderNumber || order.id || "N/A"}
                  </h5>
                </div>

                <span
                  className={`badge ${orderBadgeClass} px-3 py-2 text-capitalize`}
                >
                  {orderStatus.replace(/_/g, " ")}
                </span>
              </div>

              <hr />

              <h5 className="fw-bold mb-3">
                Order Items
              </h5>

              {items.map((item, index) => {
                const itemPrice = Number(item.price) || 0;
                const itemQuantity =
                  Number(item.quantity) || 0;

                return (
                  <div
                    key={item.id ?? index}
                    className="d-flex justify-content-between align-items-start gap-3 mb-3"
                  >
                    <div>
                      <strong>{item.name}</strong>

                      <small className="d-block text-secondary">
                        {itemQuantity} × KSh{" "}
                        {formatMoney(itemPrice)}
                      </small>
                    </div>

                    <span className="fw-semibold text-nowrap">
                      KSh{" "}
                      {formatMoney(
                        itemPrice * itemQuantity
                      )}
                    </span>
                  </div>
                );
              })}

              <hr />

              <div className="d-flex justify-content-between align-items-center">
                <strong>Total</strong>

                <strong className="text-success fs-5">
                  KSh {formatMoney(total)}
                </strong>
              </div>
            </div>
          </div>

          {/* Order and payment information */}
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-body p-4">
              <h5 className="fw-bold mb-4">
                Order Information
              </h5>

              <div className="row g-4">
                <div className="col-md-6">
                  <small className="text-secondary">
                    Customer
                  </small>

                  <div className="fw-semibold">
                    {customer.name || "N/A"}
                  </div>
                </div>

                <div className="col-md-6">
                  <small className="text-secondary">
                    Phone
                  </small>

                  <div className="fw-semibold">
                    {customer.phone || "N/A"}
                  </div>
                </div>

                <div className="col-md-6">
                  <small className="text-secondary">
                    Fulfilment
                  </small>

                  <div className="fw-semibold text-capitalize">
                    {String(
                      customer.orderType ||
                        order.order_type ||
                        "N/A"
                    ).replace(/_/g, " ")}
                  </div>
                </div>

                <div className="col-md-6">
                  <small className="text-secondary">
                    Payment Method
                  </small>

                  <div className="fw-semibold">
                    {paymentMethodLabel}
                  </div>
                </div>

                <div className="col-md-6">
                  <small className="text-secondary">
                    Payment Status
                  </small>

                  <div>
                    <span
                      className={`badge ${paymentBadgeClass} px-3 py-2`}
                    >
                      {displayedPaymentStatus}
                    </span>
                  </div>
                </div>

                {receiptNumber && (
                  <div className="col-md-6">
                    <small className="text-secondary">
                      M-Pesa Receipt
                    </small>

                    <div className="fw-semibold">
                      {receiptNumber}
                    </div>
                  </div>
                )}

                {customer.location && (
                  <div className="col-12">
                    <small className="text-secondary">
                      Delivery Location
                    </small>

                    <div className="fw-semibold">
                      {customer.location}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Next steps */}
          <div className="alert alert-info">
            <i className="bi bi-info-circle me-2"></i>

            <strong>What's next?</strong>

            <p className="mb-0 mt-2">
              {isPaid
                ? "Your payment has been confirmed. Our agrovet team will review your order and contact you about fulfilment."
                : isMpesa
                  ? "Your M-Pesa payment has not yet been confirmed. Please wait for payment verification before assuming your order is paid."
                  : "Your order has been received. Payment is due when you collect your order or receive your delivery, as applicable."}
            </p>
          </div>

          {/* Navigation */}
          <div className="d-flex justify-content-center flex-wrap gap-3 mt-4">
            <Link
              to="/products"
              className="btn btn-success"
            >
              <i className="bi bi-shop me-2"></i>
              Continue Shopping
            </Link>

            <Link
              to="/"
              className="btn btn-outline-success"
            >
              Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrderConfirmation;
