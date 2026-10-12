import { useEffect, useState } from "react";
import api from "../../api/api";

const DELIVERY_STATUSES = [
  "pending",
  "assigned",
  "dispatched",
  "in_transit",
  "delivered",
  "failed",
];

function formatStatus(status) {
  return (status || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStatusClass(status) {
  const classes = {
    pending: "bg-secondary",
    assigned: "bg-info text-dark",
    dispatched: "bg-primary",
    in_transit: "bg-warning text-dark",
    delivered: "bg-success",
    failed: "bg-danger",
  };

  return classes[status] || "bg-secondary";
}

function getPaymentStatusClass(status) {
  const classes = {
    paid: "bg-success",
    unpaid: "bg-warning text-dark",
    pending: "bg-warning text-dark",
    failed: "bg-danger",
    cancelled: "bg-secondary",
    refunded: "bg-info text-dark",
  };

  return classes[(status || "unpaid").toLowerCase()] || "bg-secondary";
}

function Deliveries() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [assignments, setAssignments] = useState({});
  const [deliveryNotes, setDeliveryNotes] = useState({});

  // Load all delivery orders.
  const loadDeliveries = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get("/admin/deliveries");

      const deliveryOrders = Array.isArray(response.data)
        ? response.data
        : response.data?.deliveries || [];

      setOrders(deliveryOrders);

      const assignmentValues = {};
      const noteValues = {};

      deliveryOrders.forEach((order) => {
        assignmentValues[order.id] = {
          delivery_person: order.delivery_person || "",
          delivery_phone: order.delivery_phone || "",
        };

        noteValues[order.id] = order.delivery_notes || "";
      });

      setAssignments(assignmentValues);
      setDeliveryNotes(noteValues);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          "Failed to load deliveries. Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeliveries();
  }, []);

  // Update rider input fields.
  const updateAssignmentField = (orderId, field, value) => {
    setAssignments((previous) => ({
      ...previous,
      [orderId]: {
        ...previous[orderId],
        [field]: value,
      },
    }));
  };

  // Update an order after a successful backend request.
  const updateOrderInList = (updatedOrder) => {
    if (!updatedOrder || !updatedOrder.id) {
      loadDeliveries();
      return;
    }

    setOrders((previous) =>
      previous.map((order) =>
        order.id === updatedOrder.id ? updatedOrder : order
      )
    );

    setAssignments((previous) => ({
      ...previous,
      [updatedOrder.id]: {
        delivery_person: updatedOrder.delivery_person || "",
        delivery_phone: updatedOrder.delivery_phone || "",
      },
    }));

    setDeliveryNotes((previous) => ({
      ...previous,
      [updatedOrder.id]: updatedOrder.delivery_notes || "",
    }));
  };

  // Assign or update a delivery rider.
  const saveAssignment = async (order) => {
    const assignment = assignments[order.id] || {};

    const deliveryPerson = assignment.delivery_person?.trim();
    const deliveryPhone = assignment.delivery_phone?.trim();

    if (!deliveryPerson || !deliveryPhone) {
      setError(
        "Enter both the delivery person's name and phone number."
      );
      setSuccess("");
      return;
    }

    setSavingId(order.id);
    setError("");
    setSuccess("");

    try {
      const response = await api.put(
        `/admin/orders/${order.id}/delivery/assign`,
        {
          delivery_person: deliveryPerson,
          delivery_phone: deliveryPhone,
        }
      );

      if (response.data.order) {
        updateOrderInList(response.data.order);
      } else {
        await loadDeliveries();
      }

      setSuccess(
        `Delivery rider saved for order ${
          order.order_number || order.id
        }.`
      );
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          "Failed to save the delivery rider."
      );
    } finally {
      setSavingId(null);
    }
  };

  // Record a cash payment through the existing backend endpoint.
  const markCashPaymentAsPaid = async (order) => {
    const paymentMethod = (order.payment_method || "")
      .trim()
      .toLowerCase();

    const paymentStatus = (order.payment_status || "unpaid")
      .trim()
      .toLowerCase();

    if (paymentMethod !== "cash") {
      setError(
        "Only cash payments can be recorded using this action."
      );
      setSuccess("");
      return;
    }

    if (paymentStatus === "paid") {
      setError("This order has already been marked as paid.");
      setSuccess("");
      return;
    }

    const amount = Number(order.total);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("The order has an invalid payment amount.");
      setSuccess("");
      return;
    }

    const confirmed = window.confirm(
      `Confirm that you have received KES ${amount.toLocaleString(
        "en-KE",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }
      )} in cash for order ${order.order_number || order.id}?`
    );

    if (!confirmed) {
      return;
    }

    setSavingId(order.id);
    setError("");
    setSuccess("");

    try {
      const response = await api.post(
        `/admin/orders/${order.id}/cash-payment`,
        {
          notes: "Cash payment received and confirmed by admin.",
        }
      );

      if (
        response.data?.payment_status !== "paid" &&
        response.data?.status !== "paid"
      ) {
        await loadDeliveries();
        setError(
          "The server did not confirm the payment as paid. Please verify the order before retrying."
        );
        return;
      }

      setOrders((previous) =>
        previous.map((existingOrder) =>
          existingOrder.id === order.id
            ? {
                ...existingOrder,
                payment_status: "paid",
              }
            : existingOrder
        )
      );

      setSuccess(
        `Cash payment recorded successfully for order ${
          order.order_number || order.id
        }.`
      );
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          "Failed to record the cash payment. Refresh the deliveries and verify its payment status before retrying."
      );
    } finally {
      setSavingId(null);
    }
  };

  // Update delivery progress without changing payment status.
  const updateDeliveryStatus = async (order, newStatus) => {
    if (
      ["dispatched", "in_transit", "delivered"].includes(newStatus) &&
      !order.delivery_person?.trim()
    ) {
      setError(
        "Assign a delivery person before progressing this delivery."
      );
      setSuccess("");
      return;
    }

    setSavingId(order.id);
    setError("");
    setSuccess("");

    try {
      const response = await api.put(
        `/admin/orders/${order.id}/delivery/status`,
        {
          delivery_status: newStatus,
        }
      );

      if (response.data.order) {
        updateOrderInList(response.data.order);
      } else {
        await loadDeliveries();
      }

      setSuccess(
        `Delivery status updated to "${formatStatus(newStatus)}" for order ${
          order.order_number || order.id
        }.`
      );
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          "Failed to update the delivery status."
      );
    } finally {
      setSavingId(null);
    }
  };

  // Save delivery notes.
  const saveDeliveryNotes = async (order) => {
    setSavingId(order.id);
    setError("");
    setSuccess("");

    try {
      const response = await api.put(
        `/admin/orders/${order.id}/delivery/notes`,
        {
          delivery_notes: deliveryNotes[order.id] || "",
        }
      );

      if (response.data.order) {
        updateOrderInList(response.data.order);
      } else {
        await loadDeliveries();
      }

      setSuccess(
        `Delivery notes saved for order ${
          order.order_number || order.id
        }.`
      );
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          "Failed to save delivery notes."
      );
    } finally {
      setSavingId(null);
    }
  };

  // Get customer details.
  const getCustomerName = (order) => {
    const customer = order.customer || {};

    return (
      customer.name ||
      customer.full_name ||
      customer.username ||
      "Unknown customer"
    );
  };

  const getCustomerPhone = (order) => {
    const customer = order.customer || {};

    return customer.phone || customer.phone_number || "Not provided";
  };

  // Search and filter delivery orders.
  const filteredOrders = orders.filter((order) => {
    const query = search.trim().toLowerCase();

    const matchesSearch =
      !query ||
      String(order.order_number || "")
        .toLowerCase()
        .includes(query) ||
      String(order.id || "").includes(query) ||
      getCustomerName(order).toLowerCase().includes(query) ||
      getCustomerPhone(order).toLowerCase().includes(query) ||
      String(order.delivery_location || "")
        .toLowerCase()
        .includes(query) ||
      String(order.delivery_person || "")
        .toLowerCase()
        .includes(query);

    const matchesStatus =
      statusFilter === "all" ||
      (order.delivery_status || "pending") === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Count orders by delivery status.
  const countStatus = (status) =>
    orders.filter(
      (order) => (order.delivery_status || "pending") === status
    ).length;

  // Format Kenyan shilling amounts.
  const formatMoney = (amount) =>
    Number(amount || 0).toLocaleString("en-KE", {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 2,
    });

  return (
    <div className="container-fluid py-4 px-3 px-md-4">
      {/* Page heading */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
        <div>
          <h2 className="fw-bold mb-1">Delivery Management</h2>
          <p className="text-muted mb-0">
            Assign riders, track deliveries, manage payment status, and save delivery notes.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-outline-primary"
          onClick={loadDeliveries}
          disabled={loading || savingId !== null}
        >
          {loading ? "Refreshing..." : "↻ Refresh Deliveries"}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="alert alert-danger alert-dismissible" role="alert">
          {error}

          <button
            type="button"
            className="btn-close"
            aria-label="Close"
            onClick={() => setError("")}
          />
        </div>
      )}

      {/* Success message */}
      {success && (
        <div className="alert alert-success alert-dismissible" role="alert">
          {success}

          <button
            type="button"
            className="btn-close"
            aria-label="Close"
            onClick={() => setSuccess("")}
          />
        </div>
      )}

      {/* Delivery overview cards */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <p className="text-muted mb-1">Total Deliveries</p>
              <h3 className="fw-bold mb-0">{orders.length}</h3>
            </div>
          </div>
        </div>

        <div className="col-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <p className="text-muted mb-1">Pending</p>
              <h3 className="fw-bold text-secondary mb-0">
                {countStatus("pending")}
              </h3>
            </div>
          </div>
        </div>

        <div className="col-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <p className="text-muted mb-1">In Progress</p>
              <h3 className="fw-bold text-primary mb-0">
                {countStatus("assigned") +
                  countStatus("dispatched") +
                  countStatus("in_transit")}
              </h3>
            </div>
          </div>
        </div>

        <div className="col-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <p className="text-muted mb-1">Delivered</p>
              <h3 className="fw-bold text-success mb-0">
                {countStatus("delivered")}
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* Search and status filters */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-8">
              <label
                htmlFor="delivery-search"
                className="form-label fw-semibold"
              >
                Search deliveries
              </label>

              <input
                id="delivery-search"
                type="search"
                className="form-control"
                placeholder="Search order number, customer, phone, location, or rider..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="col-md-4">
              <label
                htmlFor="delivery-status-filter"
                className="form-label fw-semibold"
              >
                Filter by delivery status
              </label>

              <select
                id="delivery-status-filter"
                className="form-select"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>

                {DELIVERY_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Loading indicator */}
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>

          <p className="text-muted mt-2 mb-0">Loading deliveries...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center py-5">
            <h5 className="fw-bold">No deliveries found</h5>

            <p className="text-muted mb-0">
              {orders.length === 0
                ? "Delivery orders will appear here when customers place them."
                : "Try changing your search or status filter."}
            </p>
          </div>
        </div>
      ) : (
        <div className="row g-4">
          {filteredOrders.map((order) => {
            const currentStatus = order.delivery_status || "pending";

            const assignment = assignments[order.id] || {
              delivery_person: "",
              delivery_phone: "",
            };

            const riderAssigned = Boolean(
              order.delivery_person?.trim()
            );

            const paymentStatus = (
              order.payment_status || "unpaid"
            ).toLowerCase();

            const paymentMethod = (
              order.payment_method || "unknown"
            ).trim().toLowerCase();

            const isCashOrder = paymentMethod === "cash";
            const isPaid = paymentStatus === "paid";

            return (
              <div className="col-12" key={order.id}>
                <div className="card border-0 shadow-sm">
                  {/* Order header */}
                  <div className="card-header bg-white py-3">
                    <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2">
                      <div>
                        <h5 className="fw-bold mb-1">
                          Order #{order.order_number || order.id}
                        </h5>

                        <span className="text-muted small">
                          Customer: {getCustomerName(order)} ·{" "}
                          {getCustomerPhone(order)}
                        </span>
                      </div>

                      <span
                        className={`badge ${getStatusClass(
                          currentStatus
                        )} fs-6 align-self-start align-self-md-center`}
                      >
                        {formatStatus(currentStatus)}
                      </span>
                    </div>
                  </div>

                  <div className="card-body">
                    {/* Order, payment, and delivery details */}
                    <div className="row g-3 mb-4">
                      <div className="col-md-6">
                        <div className="border rounded p-3 h-100">
                          <p className="text-muted small mb-1">
                            Delivery location
                          </p>

                          <p className="mb-0 fw-semibold">
                            {order.delivery_location ||
                              "No location provided"}
                          </p>
                        </div>
                      </div>

                      <div className="col-md-3">
                        <div className="border rounded p-3 h-100">
                          <p className="text-muted small mb-1">
                            Order total
                          </p>

                          <h5 className="fw-bold mb-0">
                            {formatMoney(order.total)}
                          </h5>
                        </div>
                      </div>

                      <div className="col-md-3">
                        <div className="border rounded p-3 h-100">
                          <p className="text-muted small mb-1">
                            Order status
                          </p>

                          <span className="fw-semibold">
                            {formatStatus(order.status || "pending")}
                          </span>
                        </div>
                      </div>

                      {/* Payment status and cash-payment action */}
                      <div className="col-md-4">
                        <div className="border rounded p-3 h-100">
                          <p className="text-muted small mb-2">
                            Payment status
                          </p>

                          <div className="mb-3">
                            <span
                              className={`badge ${getPaymentStatusClass(
                                paymentStatus
                              )}`}
                            >
                              {formatStatus(paymentStatus)}
                            </span>
                          </div>

                          {isCashOrder && !isPaid && (
                            <button
                              type="button"
                              className="btn btn-success btn-sm w-100"
                              onClick={() =>
                                markCashPaymentAsPaid(order)
                              }
                              disabled={savingId === order.id}
                            >
                              {savingId === order.id
                                ? "Recording Payment..."
                                : "✓ Mark as Paid"}
                            </button>
                          )}

                          {isCashOrder && isPaid && (
                            <span className="text-success small">
                              ✓ Cash payment recorded
                            </span>
                          )}

                          {!isCashOrder && (
                            <p className="text-muted small mb-0">
                              {paymentMethod === "mpesa"
                                ? "M-Pesa payments must be confirmed by the payment system."
                                : "Payment confirmation is handled separately."}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Payment method */}
                      <div className="col-md-4">
                        <div className="border rounded p-3 h-100">
                          <p className="text-muted small mb-1">
                            Payment method
                          </p>

                          <p className="fw-semibold mb-0">
                            {formatStatus(paymentMethod)}
                          </p>
                        </div>
                      </div>

                      {/* Delivery status */}
                      <div className="col-md-4">
                        <div className="border rounded p-3 h-100">
                          <p className="text-muted small mb-1">
                            Delivery status
                          </p>

                          <span
                            className={`badge ${getStatusClass(
                              currentStatus
                            )}`}
                          >
                            {formatStatus(currentStatus)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Assign delivery rider */}
                    <div className="border rounded p-3 mb-4">
                      <h6 className="fw-bold mb-3">
                        Assign delivery person
                      </h6>

                      <div className="row g-3 align-items-end">
                        <div className="col-md-5">
                          <label
                            htmlFor={`rider-${order.id}`}
                            className="form-label"
                          >
                            Rider's name
                          </label>

                          <input
                            id={`rider-${order.id}`}
                            type="text"
                            className="form-control"
                            placeholder="Enter rider's name"
                            value={assignment.delivery_person}
                            onChange={(event) =>
                              updateAssignmentField(
                                order.id,
                                "delivery_person",
                                event.target.value
                              )
                            }
                          />
                        </div>

                        <div className="col-md-4">
                          <label
                            htmlFor={`phone-${order.id}`}
                            className="form-label"
                          >
                            Rider's phone
                          </label>

                          <input
                            id={`phone-${order.id}`}
                            type="tel"
                            className="form-control"
                            placeholder="Enter phone number"
                            value={assignment.delivery_phone}
                            onChange={(event) =>
                              updateAssignmentField(
                                order.id,
                                "delivery_phone",
                                event.target.value
                              )
                            }
                          />
                        </div>

                        <div className="col-md-3">
                          <button
                            type="button"
                            className="btn btn-primary w-100"
                            onClick={() => saveAssignment(order)}
                            disabled={savingId === order.id}
                          >
                            {savingId === order.id
                              ? "Saving..."
                              : "Save Rider"}
                          </button>
                        </div>
                      </div>

                      {riderAssigned && (
                        <p className="text-success small mt-2 mb-0">
                          Current rider: {order.delivery_person} ·{" "}
                          {order.delivery_phone}
                        </p>
                      )}
                    </div>

                    {/* Update delivery status */}
                    <div className="border rounded p-3 mb-4">
                      <h6 className="fw-bold mb-3">
                        Update delivery status
                      </h6>

                      <div className="row g-3 align-items-end">
                        <div className="col-md-8">
                          <label
                            htmlFor={`status-${order.id}`}
                            className="form-label"
                          >
                            Delivery progress
                          </label>

                          <select
                            id={`status-${order.id}`}
                            className="form-select"
                            value={currentStatus}
                            onChange={(event) =>
                              updateDeliveryStatus(
                                order,
                                event.target.value
                              )
                            }
                            disabled={savingId === order.id}
                          >
                            {DELIVERY_STATUSES.map((status) => {
                              const requiresRider = [
                                "dispatched",
                                "in_transit",
                                "delivered",
                              ].includes(status);

                              return (
                                <option
                                  key={status}
                                  value={status}
                                  disabled={
                                    requiresRider && !riderAssigned
                                  }
                                >
                                  {formatStatus(status)}
                                  {requiresRider && !riderAssigned
                                    ? " (assign a rider first)"
                                    : ""}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <div className="col-md-4">
                          <span
                            className={`badge ${getStatusClass(
                              currentStatus
                            )} fs-6`}
                          >
                            {formatStatus(currentStatus)}
                          </span>
                        </div>
                      </div>

                      {!riderAssigned && (
                        <p className="text-muted small mt-2 mb-0">
                          Assign a rider before marking the delivery as
                          dispatched, in transit, or delivered.
                        </p>
                      )}
                    </div>

                    {/* Delivery notes */}
                    <div className="border rounded p-3">
                      <h6 className="fw-bold mb-3">Delivery notes</h6>

                      <label
                        htmlFor={`notes-${order.id}`}
                        className="form-label"
                      >
                        Instructions or delivery updates
                      </label>

                      <textarea
                        id={`notes-${order.id}`}
                        className="form-control mb-3"
                        rows="2"
                        placeholder="Add delivery instructions, delays, or other notes..."
                        value={deliveryNotes[order.id] ?? ""}
                        onChange={(event) =>
                          setDeliveryNotes((previous) => ({
                            ...previous,
                            [order.id]: event.target.value,
                          }))
                        }
                      />

                      <button
                        type="button"
                        className="btn btn-outline-primary"
                        onClick={() => saveDeliveryNotes(order)}
                        disabled={savingId === order.id}
                      >
                        {savingId === order.id
                          ? "Saving..."
                          : "Save Delivery Notes"}
                      </button>
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

export default Deliveries;