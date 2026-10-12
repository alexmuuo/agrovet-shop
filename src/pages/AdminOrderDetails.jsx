import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/api";

function AdminOrderDetails() {
  const { id } = useParams();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/admin/orders")
      .then((response) => {
        const foundOrder = response.data.find(
          (item) => item.id === Number(id)
        );

        if (!foundOrder) {
          setError("Order not found.");
          return;
        }

        setOrder(foundOrder);
      })
      .catch((error) => {
        console.error(error);
        setError("Could not load order.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div
          className="spinner-border text-success"
          role="status"
        ></div>

        <p className="mt-3 text-secondary">
          Loading order...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger">
          {error}
        </div>

        <Link
          to="/admin"
          className="btn btn-success"
        >
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="container py-5">

      {/* BACK */}
      <Link
        to="/admin"
        className="text-decoration-none text-success"
      >
        ← Back to Dashboard
      </Link>


      {/* HEADER */}
      <div className="d-flex justify-content-between align-items-center mt-4 mb-4">

        <div>
          <span className="text-success fw-semibold">
            ORDER DETAILS
          </span>

          <h1 className="fw-bold mt-1">
            {order.order_number}
          </h1>

          <p className="text-secondary mb-0">
            Placed on{" "}
            {new Date(
              order.created_at
            ).toLocaleString()}
          </p>
        </div>

        <span className="badge bg-warning text-dark fs-6">
          {order.status}
        </span>

      </div>


      <div className="row g-4">

        {/* CUSTOMER */}
        <div className="col-lg-4">

          <div className="card border-0 shadow-sm h-100">

            <div className="card-body p-4">

              <h4 className="fw-bold mb-4">
                <i className="bi bi-person me-2 text-success"></i>
                Customer
              </h4>

              <p className="mb-2">
                <strong>Name</strong>
              </p>

              <p className="text-secondary">
                {order.customer.name}
              </p>

              <p className="mb-2">
                <strong>Phone</strong>
              </p>

              <p className="text-secondary">
                {order.customer.phone}
              </p>

              {order.customer.email && (
                <>
                  <p className="mb-2">
                    <strong>Email</strong>
                  </p>

                  <p className="text-secondary">
                    {order.customer.email}
                  </p>
                </>
              )}

            </div>

          </div>

        </div>


        {/* FULFILMENT */}
        <div className="col-lg-4">

          <div className="card border-0 shadow-sm h-100">

            <div className="card-body p-4">

              <h4 className="fw-bold mb-4">
                <i className="bi bi-truck me-2 text-success"></i>
                Fulfilment
              </h4>

              <p className="mb-2">
                <strong>Order Type</strong>
              </p>

              <p className="text-secondary text-capitalize">
                {order.order_type}
              </p>

              {order.delivery_location && (
                <>
                  <p className="mb-2">
                    <strong>Delivery Location</strong>
                  </p>

                  <p className="text-secondary">
                    {order.delivery_location}
                  </p>
                </>
              )}

              <p className="mb-2">
                <strong>Payment Method</strong>
              </p>

              <p className="text-secondary text-uppercase">
                {order.payment_method}
              </p>

            </div>

          </div>

        </div>


        {/* NOTES */}
        <div className="col-lg-4">

          <div className="card border-0 shadow-sm h-100">

            <div className="card-body p-4">

              <h4 className="fw-bold mb-4">
                <i className="bi bi-chat-left-text me-2 text-success"></i>
                Customer Notes
              </h4>

              {order.notes ? (
                <p className="text-secondary">
                  {order.notes}
                </p>
              ) : (
                <p className="text-secondary">
                  No additional notes.
                </p>
              )}

            </div>

          </div>

        </div>


        {/* ORDER ITEMS */}
        <div className="col-12">

          <div className="card border-0 shadow-sm">

            <div className="card-body p-4">

              <h4 className="fw-bold mb-4">
                <i className="bi bi-box-seam me-2 text-success"></i>
                Ordered Products
              </h4>

              <div className="table-responsive">

                <table className="table align-middle">

                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Quantity</th>
                      <th>Price</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>

                  <tbody>

                    {order.items.map((item) => (
                      <tr key={item.id}>

                        <td>
                          <strong>
                            {item.product_name}
                          </strong>
                        </td>

                        <td>
                          {item.quantity}
                        </td>

                        <td>
                          KSh{" "}
                          {Number(
                            item.price
                          ).toLocaleString()}
                        </td>

                        <td>
                          <strong>
                            KSh{" "}
                            {Number(
                              item.subtotal
                            ).toLocaleString()}
                          </strong>
                        </td>

                      </tr>
                    ))}

                  </tbody>

                </table>

              </div>


              {/* TOTAL */}
              <div className="border-top pt-4 mt-3">

                <div className="d-flex justify-content-end">

                  <div style={{ minWidth: "250px" }}>

                    <div className="d-flex justify-content-between mb-2">
                      <span className="text-secondary">
                        Items
                      </span>

                      <span>
                        {order.items.length}
                      </span>
                    </div>

                    <div className="d-flex justify-content-between">

                      <strong className="fs-5">
                        Order Total
                      </strong>

                      <strong className="fs-5 text-success">
                        KSh{" "}
                        {Number(
                          order.total
                        ).toLocaleString()}
                      </strong>

                    </div>

                  </div>

                </div>

              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}

export default AdminOrderDetails;