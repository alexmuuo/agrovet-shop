import { useCallback, useEffect, useState } from "react";
import api from "../../api/api";

function Reports() {
  const [overview, setOverview] = useState(null);
  const [sales, setSales] = useState(null);
  const [products, setProducts] = useState(null);
  const [deliveries, setDeliveries] = useState(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeReport, setActiveReport] = useState("overview");

  // =========================================================
  // HELPERS
  // =========================================================

  const formatMoney = (amount) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0);

  const formatNumber = (number) =>
    new Intl.NumberFormat("en-KE").format(Number(number) || 0);

  const formatDate = (date) => {
    if (!date) return "—";

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return date;
    }

    return parsedDate.toLocaleDateString("en-KE", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const extractData = (response) => {
    const data = response.data;

    if (data?.status === "error") {
      throw new Error(data.message || "Could not load report.");
    }

    return data;
  };

  // =========================================================
  // LOAD REPORTS
  // =========================================================

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");

    const params = {};

    if (startDate) {
      params.start_date = startDate;
    }

    if (endDate) {
      params.end_date = endDate;
    }

    try {
      const [
        overviewResponse,
        salesResponse,
        productsResponse,
        deliveriesResponse,
      ] = await Promise.all([
        api.get("/admin/reports/overview", { params }),
        api.get("/admin/reports/sales", { params }),
        api.get("/admin/reports/products", { params }),
        api.get("/admin/reports/deliveries", { params }),
      ]);

      setOverview(extractData(overviewResponse));
      setSales(extractData(salesResponse));
      setProducts(extractData(productsResponse));
      setDeliveries(extractData(deliveriesResponse));
    } catch (err) {
      console.error(
        "Could not load reports:",
        err.response?.data || err.message
      );

      setError(
        err.response?.data?.message ||
          "Unable to load reports. Please try again later."
      );
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // =========================================================
  // REPORT DATA HELPERS
  // =========================================================

  const getValue = (object, ...keys) => {
    for (const key of keys) {
      if (object?.[key] !== undefined && object?.[key] !== null) {
        return object[key];
      }
    }

    return 0;
  };

  const getArray = (object, ...keys) => {
    for (const key of keys) {
      if (Array.isArray(object?.[key])) {
        return object[key];
      }
    }

    return [];
  };

  const overviewData = overview?.overview || overview?.data || overview || {};
  const salesData = sales?.sales || sales?.data || sales || {};
  const productsData =
    products?.products || products?.data || products || {};
  const deliveriesData =
    deliveries?.deliveries || deliveries?.data || deliveries || {};

  const productList = Array.isArray(productsData)
    ? productsData
    : getArray(
        productsData,
        "top_products",
        "best_selling_products",
        "products",
        "items"
      );

  const salesList = Array.isArray(salesData)
    ? salesData
    : getArray(
        salesData,
        "daily_sales",
        "sales_by_date",
        "sales",
        "items"
      );

  const deliveryList = Array.isArray(deliveriesData)
    ? deliveriesData
    : getArray(
        deliveriesData,
        "delivery_statuses",
        "status_breakdown",
        "deliveries",
        "items"
      );

  // =========================================================
  // REPORT CARD
  // =========================================================

  const StatCard = ({ title, value, icon, color, subtitle }) => (
    <div className="col-12 col-sm-6 col-xl-3">
      <div className="card border-0 shadow-sm h-100">
        <div className="card-body p-4">
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <p className="text-muted small mb-2">{title}</p>
              <h3 className="fw-bold mb-2">{value}</h3>
              {subtitle && (
                <small className="text-muted">{subtitle}</small>
              )}
            </div>

            <div
              className={`rounded-3 bg-${color}-subtle text-${color} p-3`}
            >
              <i className={`bi ${icon} fs-4`}></i>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // =========================================================
  // LOADING STATE
  // =========================================================

  if (loading && !overview && !sales && !products && !deliveries) {
    return (
      <div className="container-fluid p-4">
        <div className="d-flex flex-column align-items-center justify-content-center py-5">
          <div
            className="spinner-border text-success mb-3"
            role="status"
          >
            <span className="visually-hidden">Loading...</span>
          </div>

          <h5>Loading Reports & Analytics...</h5>
          <p className="text-muted">
            Please wait while we prepare your reports.
          </p>
        </div>
      </div>
    );
  }

  // =========================================================
  // MAIN DASHBOARD
  // =========================================================

  return (
    <div className="container-fluid p-3 p-md-4 bg-light min-vh-100">
      {/* HEADER */}

      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-4">
        <div>
          <h2 className="fw-bold mb-1">
            <i className="bi bi-graph-up-arrow text-success me-2"></i>
            Reports & Analytics
          </h2>

          <p className="text-muted mb-0">
            Monitor sales, products, orders, and deliveries.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-success"
          onClick={loadReports}
          disabled={loading}
        >
          <i
            className={`bi ${
              loading ? "bi-arrow-repeat" : "bi-arrow-clockwise"
            } me-2`}
          ></i>
          {loading ? "Refreshing..." : "Refresh Reports"}
        </button>
      </div>

      {/* DATE FILTERS */}

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-12 col-md-4">
              <label
                htmlFor="startDate"
                className="form-label fw-semibold"
              >
                Start date
              </label>

              <input
                id="startDate"
                type="date"
                className="form-control"
                value={startDate}
                max={endDate || undefined}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>

            <div className="col-12 col-md-4">
              <label
                htmlFor="endDate"
                className="form-label fw-semibold"
              >
                End date
              </label>

              <input
                id="endDate"
                type="date"
                className="form-control"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>

            <div className="col-12 col-md-4 d-flex gap-2">
              <button
                type="button"
                className="btn btn-success flex-grow-1"
                onClick={loadReports}
                disabled={loading}
              >
                <i className="bi bi-funnel me-1"></i>
                Apply Filters
              </button>

              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                title="Clear date filters"
                aria-label="Clear date filters"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ERROR MESSAGE */}

      {error && (
        <div
          className="alert alert-danger d-flex align-items-start gap-2"
          role="alert"
        >
          <i className="bi bi-exclamation-triangle-fill fs-5"></i>

          <div>
            <strong>Unable to load all reports.</strong>
            <div>{error}</div>

            <button
              type="button"
              className="btn btn-sm btn-outline-danger mt-2"
              onClick={loadReports}
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* REPORT NAVIGATION */}

      <div className="d-flex gap-2 flex-wrap mb-4">
        {[
          { id: "overview", label: "Overview", icon: "bi-speedometer2" },
          { id: "sales", label: "Sales", icon: "bi-currency-exchange" },
          { id: "products", label: "Products", icon: "bi-box-seam" },
          { id: "deliveries", label: "Deliveries", icon: "bi-truck" },
           { id: "profit", label: "Profit", icon: "bi-graph-up-arrow" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`btn ${
              activeReport === tab.id
                ? "btn-success"
                : "btn-outline-success"
            }`}
            onClick={() => setActiveReport(tab.id)}
          >
            <i className={`bi ${tab.icon} me-2`}></i>
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="alert alert-info py-2">
          <span
            className="spinner-border spinner-border-sm me-2"
            role="status"
          ></span>
          Updating report data...
        </div>
      )}

      {/* OVERVIEW */}

      {activeReport === "overview" && (
        <>
          <div className="row g-3 mb-4">
            <StatCard
              title="Total Orders"
              value={formatNumber(
                getValue(overviewData, "total_orders", "orders_count")
              )}
              icon="bi-receipt"
              color="primary"
              subtitle="Orders in the selected period"
            />

            <StatCard
              title="Total Sales"
              value={formatMoney(
                getValue(
                  overviewData,
                  "total_sales",
                  "total_revenue",
                  "sales_total"
                )
              )}
              icon="bi-currency-exchange"
              color="success"
              subtitle="Order value, not verified payments"
            />

            <StatCard
              title="Customers"
              value={formatNumber(
                getValue(
                  overviewData,
                  "total_customers",
                  "customers_count"
                )
              )}
              icon="bi-people"
              color="info"
              subtitle="Registered customers"
            />

            <StatCard
              title="Products"
              value={formatNumber(
                getValue(
                  overviewData,
                  "total_products",
                  "products_count"
                )
              )}
              icon="bi-box-seam"
              color="warning"
              subtitle="Products in the catalogue"
            />
          </div>

          <div className="row g-3 mb-4">
            <div className="col-12 col-lg-6">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-header bg-white py-3">
                  <h5 className="fw-bold mb-0">
                    <i className="bi bi-bar-chart-line text-success me-2"></i>
                    Sales Summary
                  </h5>
                </div>

                <div className="card-body">
                  <div className="d-flex justify-content-between border-bottom py-3">
                    <span className="text-muted">Total sales</span>
                    <strong>
                      {formatMoney(
                        getValue(
                          salesData,
                          "total_sales",
                          "total_revenue",
                          "sales_total"
                        )
                      )}
                    </strong>
                  </div>

                  <div className="d-flex justify-content-between border-bottom py-3">
                    <span className="text-muted">Completed order value</span>
                    <strong>
                      {formatMoney(
                        getValue(
                          overviewData,
                          "completed_sales",
                          "completed_order_value",
                          "completed_revenue"
                        )
                      )}
                    </strong>
                  </div>

                  <div className="d-flex justify-content-between py-3">
                    <span className="text-muted">Average order value</span>
                    <strong>
                      {formatMoney(
                        getValue(
                          overviewData,
                          "average_order_value",
                          "average_order"
                        )
                      )}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-12 col-lg-6">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-header bg-white py-3">
                  <h5 className="fw-bold mb-0">
                    <i className="bi bi-truck text-success me-2"></i>
                    Delivery Summary
                  </h5>
                </div>

                <div className="card-body">
                  <div className="d-flex justify-content-between border-bottom py-3">
                    <span className="text-muted">Total deliveries</span>
                    <strong>
                      {formatNumber(
                        getValue(
                          deliveriesData,
                          "total_deliveries",
                          "total",
                          "count"
                        )
                      )}
                    </strong>
                  </div>

                  <div className="d-flex justify-content-between border-bottom py-3">
                    <span className="text-muted">Completed deliveries</span>
                    <strong className="text-success">
                      {formatNumber(
                        getValue(
                          deliveriesData,
                          "completed_deliveries",
                          "completed"
                        )
                      )}
                    </strong>
                  </div>

                  <div className="d-flex justify-content-between py-3">
                    <span className="text-muted">Pending deliveries</span>
                    <strong className="text-warning">
                      {formatNumber(
                        getValue(
                          deliveriesData,
                          "pending_deliveries",
                          "pending"
                        )
                      )}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* SALES REPORT */}

      {activeReport === "sales" && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white py-3">
            <h5 className="fw-bold mb-0">Sales Report</h5>
          </div>

          <div className="card-body">
            <div className="row g-3 mb-4">
              <div className="col-12 col-md-6">
                <div className="rounded-3 bg-success-subtle p-4">
                  <p className="text-muted mb-1">Total Sales</p>
                  <h3 className="fw-bold text-success mb-0">
                    {formatMoney(
                      getValue(
                        salesData,
                        "total_sales",
                        "total_revenue",
                        "sales_total"
                      )
                    )}
                  </h3>
                </div>
              </div>

              <div className="col-12 col-md-6">
                <div className="rounded-3 bg-primary-subtle p-4">
                  <p className="text-muted mb-1">Total Orders</p>
                  <h3 className="fw-bold text-primary mb-0">
                    {formatNumber(
                      getValue(
                        salesData,
                        "total_orders",
                        "orders_count"
                      )
                    )}
                  </h3>
                </div>
              </div>
            </div>

            <h6 className="fw-bold mb-3">Sales Breakdown</h6>

            {salesList.length > 0 ? (
              <div className="table-responsive">
                <table className="table table-hover align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>Date</th>
                      <th>Orders</th>
                      <th className="text-end">Sales (KES)</th>
                    </tr>
                  </thead>

                  <tbody>
                    {salesList.map((item, index) => (
                      <tr key={item.id ?? item.date ?? index}>
                        <td>
                          {formatDate(
                            item.date ??
                              item.day ??
                              item.created_at
                          )}
                        </td>

                        <td>
                          {formatNumber(
                            getValue(
                              item,
                              "total_orders",
                              "orders_count",
                              "orders",
                              "count"
                            )
                          )}
                        </td>

                        <td className="text-end fw-semibold">
                          {formatMoney(
                            getValue(
                              item,
                              "total_sales",
                              "total_revenue",
                              "sales",
                              "revenue",
                              "total"
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center text-muted py-5">
                <i className="bi bi-bar-chart fs-1 d-block mb-3"></i>
                No sales breakdown is available for this period.
              </div>
            )}
          </div>
        </div>
      )}

      {/* PRODUCT REPORT */}

      {activeReport === "products" && (
        <>
          <div className="row g-3 mb-4">
            <StatCard
              title="Products Listed"
              value={formatNumber(
                getValue(
                  productsData,
                  "total_products",
                  "products_count"
                )
              )}
              icon="bi-box-seam"
              color="primary"
            />

            <StatCard
              title="Units Sold"
              value={formatNumber(
                getValue(
                  productsData,
                  "total_quantity_sold",
                  "units_sold",
                  "total_units"
                )
              )}
              icon="bi-cart-check"
              color="success"
            />

            <StatCard
              title="Stock Remaining"
              value={formatNumber(
                getValue(
                  productsData,
                  "total_stock",
                  "stock_remaining"
                )
              )}
              icon="bi-boxes"
              color="info"
            />

            <StatCard
              title="Product Value Sold"
              value={formatMoney(
                getValue(
                  productsData,
                  "total_sales",
                  "total_value",
                  "total_revenue"
                )
              )}
              icon="bi-cash-stack"
              color="warning"
            />
          </div>

          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white py-3">
              <h5 className="fw-bold mb-0">
                <i className="bi bi-trophy text-warning me-2"></i>
                Best-Selling Products
              </h5>
            </div>

            <div className="card-body">
              {productList.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-hover align-middle">
                    <thead className="table-light">
                      <tr>
                        <th>#</th>
                        <th>Product</th>
                        <th>Units Sold</th>
                        <th className="text-end">Sales Value</th>
                      </tr>
                    </thead>

                    <tbody>
                      {productList.map((product, index) => (
                        <tr
                          key={
                            product.product_id ??
                            product.id ??
                            index
                          }
                        >
                          <td>{index + 1}</td>

                          <td className="fw-semibold">
                            {product.product_name ??
                              product.name ??
                              "Unknown product"}
                          </td>

                          <td>
                            {formatNumber(
                              getValue(
                                product,
                                "quantity_sold",
                                "total_quantity",
                                "units_sold",
                                "quantity"
                              )
                            )}
                          </td>

                          <td className="text-end">
                            {formatMoney(
                              getValue(
                                product,
                                "total_sales",
                                "total_value",
                                "revenue",
                                "subtotal"
                              )
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center text-muted py-5">
                  <i className="bi bi-box fs-1 d-block mb-3"></i>
                  No product sales are available for this period.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* DELIVERY REPORT */}

      {activeReport === "deliveries" && (
        <>
          <div className="row g-3 mb-4">
            <StatCard
              title="Total Deliveries"
              value={formatNumber(
                getValue(
                  deliveriesData,
                  "total_deliveries",
                  "total",
                  "count"
                )
              )}
              icon="bi-truck"
              color="primary"
            />

            <StatCard
              title="Completed"
              value={formatNumber(
                getValue(
                  deliveriesData,
                  "completed_deliveries",
                  "completed"
                )
              )}
              icon="bi-check-circle"
              color="success"
            />

            <StatCard
              title="Pending"
              value={formatNumber(
                getValue(
                  deliveriesData,
                  "pending_deliveries",
                  "pending"
                )
              )}
              icon="bi-clock-history"
              color="warning"
            />

            <StatCard
              title="Cancelled"
              value={formatNumber(
                getValue(
                  deliveriesData,
                  "cancelled_deliveries",
                  "cancelled"
                )
              )}
              icon="bi-x-circle"
              color="danger"
            />
          </div>

          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white py-3">
              <h5 className="fw-bold mb-0">
                <i className="bi bi-truck text-success me-2"></i>
                Delivery Status Breakdown
              </h5>
            </div>

            <div className="card-body">
              {deliveryList.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-hover align-middle">
                    <thead className="table-light">
                      <tr>
                        <th>Delivery Status</th>
                        <th className="text-end">Number of Deliveries</th>
                      </tr>
                    </thead>

                    <tbody>
                      {deliveryList.map((delivery, index) => (
                        <tr
                          key={
                            delivery.status ??
                            delivery.delivery_status ??
                            index
                          }
                        >
                          <td className="text-capitalize">
                            {(
                              delivery.status ??
                              delivery.delivery_status ??
                              "Unknown"
                            ).replaceAll("_", " ")}
                          </td>

                          <td className="text-end fw-semibold">
                            {formatNumber(
                              getValue(
                                delivery,
                                "count",
                                "total",
                                "total_deliveries",
                                "quantity"
                              )
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center text-muted py-5">
                  <i className="bi bi-truck fs-1 d-block mb-3"></i>
                  No delivery breakdown is available for this period.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* FOOTER NOTE */}

      <div className="alert alert-light border mt-4 mb-0">
        <i className="bi bi-info-circle text-success me-2"></i>
        <strong>Reporting note:</strong> Sales figures represent order values
        recorded by the system. They should not be treated as confirmed
        payments until payment verification is implemented.
      </div>
    </div>
  );
}

export default Reports;
