import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";

function CashierPOS() {
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [receipt, setReceipt] = useState(null);

  const pollingRef = useRef(false);
  const pollingOrderRef = useRef(null);
  const mountedRef = useRef(true);

  const cashier = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("cashier") || "null");
    } catch {
      return null;
    }
  }, []);

  // ============================================================
  // CLEANUP
  // ============================================================

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      pollingRef.current = false;
    };
  }, []);

  // ============================================================
  // LOAD PRODUCTS
  // ============================================================

  const fetchProducts = useCallback(async () => {
    const response = await api.get("/products");
    const data = response.data;

    const productList = Array.isArray(data)
      ? data
      : Array.isArray(data?.products)
      ? data.products
      : Array.isArray(data?.items)
      ? data.items
      : null;

    if (!productList) {
      throw new Error("The products API returned an unexpected response.");
    }

    if (mountedRef.current) {
      setProducts(productList);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadProducts() {
      try {
        setLoading(true);
        setError("");

        const response = await api.get("/products");
        const data = response.data;

        const productList = Array.isArray(data)
          ? data
          : Array.isArray(data?.products)
          ? data.products
          : Array.isArray(data?.items)
          ? data.items
          : null;

        if (!productList) {
          throw new Error("The products API returned an unexpected response.");
        }

        if (active) {
          setProducts(productList);
        }
      } catch (err) {
        if (active) {
          setError(
            err.response?.data?.message ||
              err.response?.data?.error ||
              err.message ||
              "Unable to load products."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      active = false;
    };
  }, []);

  // ============================================================
  // SEARCH PRODUCTS
  // ============================================================

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return products;

    return products.filter((product) => {
      const name = String(product.name || "").toLowerCase();
      const category = String(product.category || "").toLowerCase();
      const description = String(product.description || "").toLowerCase();

      return (
        name.includes(term) ||
        category.includes(term) ||
        description.includes(term)
      );
    });
  }, [products, search]);

  // ============================================================
  // PRODUCT PRICE
  // ============================================================

  const getPrice = (product) => {
    const price = Number(product.price);
    return Number.isFinite(price) && price >= 0 ? price : 0;
  };

  // ============================================================
  // AVAILABLE STOCK
  // ============================================================

  const getStock = (product) => {
    const stockValue =
      product.stock_quantity ??
      product.quantity_in_stock ??
      product.stock ??
      product.quantity;

    if (
      stockValue === undefined ||
      stockValue === null ||
      stockValue === ""
    ) {
      return null;
    }

    const stock = Number(stockValue);

    return Number.isFinite(stock) && stock >= 0 ? stock : null;
  };

  // ============================================================
  // ADD PRODUCT TO CART
  // ============================================================

  const addToCart = (product) => {
    setMessage("");
    setError("");

    const stock = getStock(product);

    if (stock === 0) {
      setError(`${product.name} is out of stock.`);
      return;
    }

    setCart((currentCart) => {
      const existing = currentCart.find((item) => item.id === product.id);

      if (existing) {
        if (stock !== null && existing.quantity >= stock) {
          setError(`Only ${stock} units of ${product.name} are available.`);
          return currentCart;
        }

        return currentCart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...currentCart, { ...product, quantity: 1 }];
    });
  };

  // ============================================================
  // REMOVE PRODUCT
  // ============================================================

  const removeFromCart = (productId) => {
    setCart((currentCart) =>
      currentCart.filter((item) => item.id !== productId)
    );
  };

  // ============================================================
  // UPDATE QUANTITY
  // ============================================================

  const updateQuantity = (productId, quantity) => {
    setError("");
    setMessage("");

    const product = products.find((item) => item.id === productId);

    if (!product) return;

    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    const stock = getStock(product);

    if (stock !== null && quantity > stock) {
      setError(`Only ${stock} units of ${product.name} are available.`);
      return;
    }

    setCart((currentCart) =>
      currentCart.map((item) =>
        item.id === productId ? { ...item, quantity } : item
      )
    );
  };

  // ============================================================
  // CLEAR CART
  // ============================================================

  const clearCart = () => {
    setCart([]);
    setError("");
    setMessage("");
  };

  // ============================================================
  // TOTALS
  // ============================================================

  const totalItems = cart.reduce((total, item) => total + item.quantity, 0);

  const totalAmount = cart.reduce(
    (total, item) => total + getPrice(item) * item.quantity,
    0
  );

  // ============================================================
  // CURRENCY FORMATTER
  // ============================================================

  const formatCurrency = (value) =>
    Number(value || 0).toLocaleString("en-KE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // ============================================================
  // AUTOMATIC M-PESA PAYMENT STATUS POLLING
  // ============================================================

  const pollPaymentStatus = useCallback(async (orderId) => {
    if (!orderId || pollingRef.current) return;

    pollingRef.current = true;
    pollingOrderRef.current = orderId;

    const startedAt = Date.now();
    const timeoutMs = 180000;
    const intervalMs = 3000;

    try {
      while (
        mountedRef.current &&
        pollingRef.current &&
        Date.now() - startedAt < timeoutMs
      ) {
        try {
          const response = await api.get(
            `/cashier/sales/${orderId}/payment-status`
          );

          if (!mountedRef.current || !pollingRef.current) return;

          const data = response.data || {};
          const transactionStatus = String(
            data.transaction_status || ""
          ).toLowerCase();

          const orderStatus = String(data.order_status || "").toLowerCase();
          const paymentStatus = String(data.payment_status || "").toLowerCase();

          const isPaid =
            paymentStatus === "paid" ||
            transactionStatus === "paid" ||
            transactionStatus === "success" ||
            transactionStatus === "successful";

          const isFailed =
            transactionStatus === "failed" ||
            transactionStatus === "cancelled" ||
            transactionStatus === "canceled" ||
            orderStatus === "cancelled" ||
            orderStatus === "canceled" ||
            paymentStatus === "failed";

          if (isPaid) {
            setReceipt((current) => {
              if (!current || Number(current.id) !== Number(orderId)) {
                return current;
              }

              return {
                ...current,
                payment_status: "paid",
                order_status: data.order_status || "completed",
                mpesa_receipt_number:
                  data.mpesa_receipt_number || current.mpesa_receipt_number,
                checkout_request_id:
                  data.checkout_request_id || current.checkout_request_id,
              };
            });

            setMessage(
              data.mpesa_receipt_number
                ? `M-Pesa payment confirmed. Receipt: ${data.mpesa_receipt_number}`
                : "M-Pesa payment confirmed successfully."
            );

            try {
              await fetchProducts();
            } catch {
              // Payment is confirmed even if refreshing inventory fails.
            }

            return;
          }

          if (isFailed) {
            setReceipt((current) => {
              if (!current || Number(current.id) !== Number(orderId)) {
                return current;
              }

              return {
                ...current,
                payment_status: "failed",
                order_status: data.order_status || "cancelled",
                payment_message:
                  data.message || "The M-Pesa payment was not completed.",
              };
            });

            setError(
              data.message ||
                "M-Pesa payment failed or was cancelled. Check Sales History before taking further action."
            );

            try {
              await fetchProducts();
            } catch {
              // Preserve the payment status even if inventory refresh fails.
            }

            return;
          }
        } catch (err) {
          // A temporary network error should not mark a payment as failed.
          console.error("Unable to check M-Pesa payment status:", err);
        }

        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }

      if (mountedRef.current && pollingOrderRef.current === orderId) {
        setMessage(
          "Payment is still awaiting confirmation. Keep this order number and check Sales History before retrying."
        );
      }
    } finally {
      if (pollingOrderRef.current === orderId) {
        pollingRef.current = false;
        pollingOrderRef.current = null;
      }
    }
  }, [fetchProducts]);

  // ============================================================
  // COMPLETE SALE
  // ============================================================

  const handleCheckout = async () => {
    if (cart.length === 0) {
      setError("Add products to the cart before checkout.");
      return;
    }

    if (checkoutLoading) return;

    setError("");
    setMessage("");

    let normalizedPhone = "";

    if (paymentMethod === "mpesa") {
      normalizedPhone = mpesaPhone.trim().replace(/[\s-]/g, "");

      const validPhone = /^(?:\+254|254|0)?(?:7|1)\d{8}$/.test(
        normalizedPhone
      );

      if (!validPhone) {
        setError("Enter a valid Kenyan phone number, e.g. 0712345678.");
        return;
      }

      if (pollingRef.current) {
        setError("A payment is already being checked. Please wait.");
        return;
      }
    }

    setCheckoutLoading(true);

    let orderCreated = false;

    try {
      // STEP 1: CREATE SALE

      const payload = {
        payment_method: paymentMethod,
        items: cart.map((item) => ({
          product_id: item.id,
          quantity: item.quantity,
        })),
      };

      const response = await api.post("/cashier/sales", payload);
      const order = response.data?.order;

      if (!order || !order.id || !order.order_number) {
        throw new Error(
          "The sale response was incomplete. Check Sales History before retrying."
        );
      }

      orderCreated = true;

      // STEP 2: CASH PAYMENT

      if (paymentMethod === "cash") {
        setReceipt({
          ...order,
          payment_method: "cash",
          payment_status: "paid",
        });

        setCart([]);
        setSearch("");
        setMessage("Cash sale recorded successfully!");

        try {
          await fetchProducts();
        } catch {
          setMessage(
            "Cash sale recorded successfully. Refresh the page to update inventory."
          );
        }

        return;
      }

      // STEP 3: INITIATE M-PESA STK PUSH

      const stkResponse = await api.post("/payments/stk-push", {
        order_id: order.id,
        phone: normalizedPhone,
      });

      const paymentData = stkResponse.data || {};

      // STEP 4: SHOW PENDING RECEIPT

      setReceipt({
        ...order,
        payment_method: "mpesa",
        payment_status: paymentData.payment_status || "pending",
        checkout_request_id: paymentData.checkout_request_id || null,
        mpesa_phone: normalizedPhone,
        mpesa_receipt_number: null,
      });

      setCart([]);
      setSearch("");
      setMessage(
        "M-Pesa prompt initiated. Ask the customer to check their phone and enter their PIN. Payment confirmation will be checked automatically."
      );

      try {
        await fetchProducts();
      } catch {
        // Do not interrupt payment confirmation if stock refresh fails.
      }

      // STEP 5: CHECK PAYMENT STATUS AUTOMATICALLY

      void pollPaymentStatus(order.id);
    } catch (err) {
      const serverMessage =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Checkout failed.";

      if (orderCreated) {
        setError(
          `${serverMessage} An order has already been created. Check Sales History and payment status before retrying.`
        );

        setMessage(
          "The sale order exists, but payment initiation was not confirmed. Do not create the same sale again."
        );

        try {
          await fetchProducts();
        } catch {
          // Preserve the original checkout error.
        }
      } else {
        setError(serverMessage);
      }
    } finally {
      if (mountedRef.current) {
        setCheckoutLoading(false);
      }
    }
  };

  // ============================================================
  // LOG OUT
  // ============================================================

  const handleLogout = () => {
    pollingRef.current = false;

    localStorage.removeItem("cashierToken");
    localStorage.removeItem("cashier");

    navigate("/cashier-login", { replace: true });
  };

  // ============================================================
  // RECEIPT
  // ============================================================

  const receiptView = receipt && (
    <div className="pos-receipt-overlay">
      <div className="pos-receipt">
        <div className="pos-receipt-header">
          <h2>Agrovet Sales Receipt</h2>

          <p>
            {receipt.payment_method === "mpesa" &&
            receipt.payment_status !== "paid"
              ? receipt.payment_status === "failed"
                ? "Payment failed"
                : "Payment pending"
              : "Sale recorded"}
          </p>

          <p>
            <strong>Receipt:</strong> {receipt.order_number}
          </p>

          <p>
            <strong>Date:</strong>{" "}
            {receipt.created_at
              ? new Date(receipt.created_at).toLocaleString()
              : new Date().toLocaleString()}
          </p>

          <p>
            <strong>Cashier:</strong>{" "}
            {cashier?.full_name || cashier?.username || "Cashier"}
          </p>
        </div>

        <hr />

        {(receipt.items || []).map((item, index) => (
          <div
            key={item.id || `${item.product_id}-${index}`}
            className="pos-receipt-item"
          >
            <div>
              <strong>{item.product_name || "Product"}</strong>

              <div className="pos-receipt-muted">
                {item.quantity} × KSh {formatCurrency(item.price)}
              </div>
            </div>

            <strong>KSh {formatCurrency(item.subtotal)}</strong>
          </div>
        ))}

        <div className="pos-receipt-total">
          <strong>Total</strong>
          <strong>KSh {formatCurrency(receipt.total)}</strong>
        </div>

        <p>
          <strong>Payment method:</strong>{" "}
          {String(receipt.payment_method || "").toUpperCase()}
        </p>

        <p>
          <strong>Payment status:</strong>{" "}
          {String(receipt.payment_status || "unknown").toUpperCase()}
        </p>

        {receipt.payment_method === "mpesa" && (
          <>
            <p>
              <strong>Phone:</strong>{" "}
              {receipt.mpesa_phone || receipt.phone_number || "Not available"}
            </p>

            {receipt.mpesa_receipt_number && (
              <p>
                <strong>M-Pesa receipt number:</strong>{" "}
                {receipt.mpesa_receipt_number}
              </p>
            )}

            {receipt.checkout_request_id && (
              <p>
                <strong>Transaction reference:</strong>
                <br />
                <small>{receipt.checkout_request_id}</small>
              </p>
            )}
          </>
        )}

        {receipt.payment_method === "mpesa" &&
          receipt.payment_status !== "paid" &&
          receipt.payment_status !== "failed" && (
            <div className="pos-receipt-warning">
              <strong>Payment not yet confirmed.</strong>
              <p>
                The POS checks payment status automatically. Do not treat this
                transaction as paid until the backend confirms success.
              </p>
            </div>
          )}

        {receipt.payment_method === "mpesa" &&
          receipt.payment_status === "failed" && (
            <div className="pos-receipt-warning">
              <strong>Payment failed or was cancelled.</strong>
              <p>
                {receipt.payment_message ||
                  "Check the transaction and Sales History before retrying."}
              </p>
            </div>
          )}

        {receipt.payment_method === "mpesa" &&
          receipt.payment_status === "paid" && (
            <p className="pos-receipt-paid">M-Pesa payment confirmed.</p>
          )}

        <p className="pos-receipt-thanks">Thank you for shopping with us!</p>

        <div className="pos-receipt-actions">
          <button
            type="button"
            onClick={() => window.print()}
            className="pos-print-button"
          >
            Print Receipt
          </button>

          <button
            type="button"
            onClick={() => {
              setReceipt(null);
              setError("");
              setMessage("");
            }}
            className="pos-new-sale-button"
          >
            New Sale
          </button>
        </div>
      </div>
    </div>
  );

  // ============================================================
  // POS SCREEN
  // ============================================================

  return (
    <>
      {receiptView}

      <div className="pos-page" style={styles.page}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.heading}>Agrovet POS</h1>
            <p style={styles.subheading}>Point of Sale · Counter Sales</p>
          </div>

          <div style={styles.headerRight}>
            <div style={styles.cashierInfo}>
              <span style={styles.cashierLabel}>Signed in as</span>
              <strong>
                {cashier?.full_name || cashier?.username || "Cashier"}
              </strong>
            </div>

            <button
              type="button"
              onClick={() => navigate("/cashier/sales-history")}
              style={styles.salesHistoryButton}
            >
              Sales History
            </button>

            <button
              type="button"
              onClick={handleLogout}
              style={styles.logoutButton}
            >
              Log out
            </button>
          </div>
        </header>

        {error && (
          <div style={styles.error} role="alert">
            {error}
          </div>
        )}

        {message && (
          <div style={styles.success} role="status">
            {message}
          </div>
        )}

        <main style={styles.layout}>
          {/* PRODUCTS */}

          <section style={styles.productPanel}>
            <div style={styles.panelHeading}>
              <h2 style={styles.sectionTitle}>Products</h2>
              <span style={styles.countBadge}>
                {filteredProducts.length} found
              </span>
            </div>

            <input
              type="search"
              placeholder="Search products by name or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={styles.search}
            />

            {loading ? (
              <div style={styles.emptyState}>Loading products...</div>
            ) : filteredProducts.length === 0 ? (
              <div style={styles.emptyState}>
                <h3>No products found</h3>
                <p>
                  Try another search or add products through the admin
                  dashboard.
                </p>
              </div>
            ) : (
              <div style={styles.productGrid}>
                {filteredProducts.map((product) => {
                  const stock = getStock(product);

                  const inCart = cart.find(
                    (item) => item.id === product.id
                  );

                  const unavailable =
                    stock === 0 ||
                    (stock !== null &&
                      Boolean(inCart) &&
                      inCart.quantity >= stock);

                  return (
                    <article key={product.id} style={styles.productCard}>
                      <div style={styles.productIcon}>🌱</div>

                      <h3 style={styles.productName}>
                        {product.name || "Unnamed product"}
                      </h3>

                      <p style={styles.category}>
                        {product.category || "General"}
                      </p>

                      <p style={styles.price}>
                        KSh {formatCurrency(getPrice(product))}
                      </p>

                      <p style={styles.stock}>
                        {stock === null ? "Stock not provided" : `${stock} in stock`}
                      </p>

                      <button
                        type="button"
                        onClick={() => addToCart(product)}
                        disabled={unavailable || checkoutLoading}
                        style={{
                          ...styles.addButton,
                          ...(unavailable || checkoutLoading
                            ? styles.disabledButton
                            : {}),
                        }}
                      >
                        {stock === 0
                          ? "Out of stock"
                          : unavailable
                          ? "Stock limit reached"
                          : inCart
                          ? "Add another"
                          : "Add to cart"}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* CART */}

          <aside style={styles.cartPanel}>
            <div style={styles.panelHeading}>
              <h2 style={styles.sectionTitle}>Current Sale</h2>
              <span style={styles.countBadge}>{totalItems} items</span>
            </div>

            {cart.length === 0 ? (
              <div style={styles.emptyCart}>
                <div style={styles.cartIcon}>🛒</div>
                <h3>Your cart is empty</h3>
                <p>Select products to start a sale.</p>
              </div>
            ) : (
              <div style={styles.cartItems}>
                {cart.map((item) => (
                  <div key={item.id} style={styles.cartItem}>
                    <div style={styles.cartItemInfo}>
                      <strong style={styles.cartItemName}>{item.name}</strong>

                      <span style={styles.cartItemPrice}>
                        KSh {formatCurrency(getPrice(item) * item.quantity)}
                      </span>

                      <div style={styles.quantityControls}>
                        <button
                          type="button"
                          disabled={checkoutLoading}
                          onClick={() =>
                            updateQuantity(item.id, item.quantity - 1)
                          }
                          style={styles.quantityButton}
                          aria-label={`Decrease ${item.name} quantity`}
                        >
                          −
                        </button>

                        <span style={styles.quantity}>{item.quantity}</span>

                        <button
                          type="button"
                          disabled={checkoutLoading}
                          onClick={() =>
                            updateQuantity(item.id, item.quantity + 1)
                          }
                          style={styles.quantityButton}
                          aria-label={`Increase ${item.name} quantity`}
                        >
                          +
                        </button>

                        <button
                          type="button"
                          disabled={checkoutLoading}
                          onClick={() => removeFromCart(item.id)}
                          style={styles.removeButton}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={styles.summary}>
              <label htmlFor="paymentMethod" style={styles.paymentLabel}>
                Payment Method
              </label>

              <select
                id="paymentMethod"
                value={paymentMethod}
                onChange={(e) => {
                  setPaymentMethod(e.target.value);
                  setError("");
                  setMessage("");
                }}
                disabled={checkoutLoading}
                style={styles.paymentSelect}
              >
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa</option>
              </select>

              {paymentMethod === "mpesa" && (
                <div style={styles.phoneSection}>
                  <label htmlFor="mpesaPhone" style={styles.paymentLabel}>
                    Customer M-Pesa Phone Number
                  </label>

                  <input
                    id="mpesaPhone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="e.g. 0712345678"
                    value={mpesaPhone}
                    onChange={(e) => setMpesaPhone(e.target.value)}
                    disabled={checkoutLoading}
                    style={styles.phoneInput}
                  />

                  <p style={styles.phoneHint}>
                    The customer must be able to access this phone to enter
                    their M-Pesa PIN.
                  </p>
                </div>
              )}

              <div style={styles.summaryRow}>
                <span>Total units</span>
                <strong>{totalItems}</strong>
              </div>

              <div style={styles.totalRow}>
                <span>Total</span>
                <strong>KSh {formatCurrency(totalAmount)}</strong>
              </div>

              <button
                type="button"
                disabled={cart.length === 0 || checkoutLoading}
                onClick={handleCheckout}
                style={{
                  ...styles.checkoutButton,
                  ...(cart.length === 0 || checkoutLoading
                    ? styles.disabledButton
                    : {}),
                }}
              >
                {checkoutLoading
                  ? paymentMethod === "mpesa"
                    ? "Initiating Payment..."
                    : "Processing Sale..."
                  : paymentMethod === "mpesa"
                  ? "Initiate M-Pesa Payment"
                  : "Complete Cash Sale"}
              </button>

              <button
                type="button"
                onClick={clearCart}
                disabled={cart.length === 0 || checkoutLoading}
                style={{
                  ...styles.clearButton,
                  ...(cart.length === 0 || checkoutLoading
                    ? styles.disabledClearButton
                    : {}),
                }}
              >
                Clear Cart
              </button>

              <p style={styles.notice}>
                {paymentMethod === "mpesa"
                  ? "M-Pesa sales remain pending until Safaricom confirms payment. Do not create the same sale again if payment initiation is uncertain."
                  : "Cash sales are recorded by the backend during checkout."}
              </p>
            </div>
          </aside>
        </main>
      </div>
    </>
  );
}

// ============================================================
// RECEIPT STYLES
// ============================================================

const receiptStyles = `
.pos-receipt-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow-y: auto;
}
.pos-receipt {
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  background: #fff;
  border-radius: 14px;
  padding: 28px;
  box-sizing: border-box;
  color: #1f2937;
}
.pos-receipt-header { text-align: center; }
.pos-receipt-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #eee;
}
.pos-receipt-muted {
  color: #64748b;
  font-size: 13px;
  margin-top: 4px;
}
.pos-receipt-total {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 20px 0;
  font-size: 19px;
}
.pos-receipt-warning {
  padding: 12px;
  background: #fef3c7;
  color: #92400e;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
}
.pos-receipt-paid {
  padding: 10px;
  background: #dcfce7;
  color: #166534;
  border-radius: 6px;
  font-weight: 600;
  text-align: center;
}
.pos-receipt-thanks {
  text-align: center;
  margin-top: 24px;
}
.pos-receipt-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}
.pos-print-button,
.pos-new-sale-button {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}
.pos-print-button { background: #166534; color: white; }
.pos-new-sale-button { background: #e2e8f0; color: #1f2937; }

@media print {
  body * { visibility: hidden !important; }
  .pos-receipt-overlay,
  .pos-receipt-overlay * { visibility: visible !important; }
  .pos-receipt-overlay {
    position: absolute !important;
    inset: 0 !important;
    display: block !important;
    padding: 0 !important;
    background: white !important;
    overflow: visible !important;
  }
  .pos-receipt {
    width: 100% !important;
    max-width: none !important;
    max-height: none !important;
    overflow: visible !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    padding: 10px !important;
  }
  .pos-receipt-actions { display: none !important; }
}
`;

if (
  typeof document !== "undefined" &&
  !document.getElementById("pos-receipt-styles")
) {
  const styleElement = document.createElement("style");
  styleElement.id = "pos-receipt-styles";
  styleElement.textContent = receiptStyles;
  document.head.appendChild(styleElement);
}

// ============================================================
// POS STYLES
// ============================================================

const styles = {
  page: {
    minHeight: "100vh",
    padding: "24px",
    background: "#f4f7f5",
    color: "#1f2937",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
    flexWrap: "wrap",
    marginBottom: "28px",
    paddingBottom: "20px",
    borderBottom: "1px solid #dce5df",
  },
  heading: { margin: 0, color: "#166534", fontSize: "30px" },
  subheading: { margin: "6px 0 0", color: "#64748b" },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  cashierInfo: { display: "flex", flexDirection: "column", gap: "4px" },
  cashierLabel: { color: "#64748b", fontSize: "12px" },
  salesHistoryButton: {
    padding: "10px 16px",
    background: "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },
  logoutButton: {
    padding: "10px 16px",
    background: "#fff",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "600",
  },
  error: {
    padding: "14px",
    marginBottom: "18px",
    borderRadius: "8px",
    background: "#fee2e2",
    color: "#991b1b",
  },
  success: {
    padding: "14px",
    marginBottom: "18px",
    borderRadius: "8px",
    background: "#dcfce7",
    color: "#166534",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
    gap: "24px",
    alignItems: "start",
  },
  productPanel: {
    minWidth: 0,
    padding: "22px",
    background: "#fff",
    borderRadius: "14px",
    boxShadow: "0 3px 14px rgba(0,0,0,0.04)",
  },
  cartPanel: {
    minWidth: 0,
    padding: "22px",
    background: "#fff",
    borderRadius: "14px",
    boxShadow: "0 3px 14px rgba(0,0,0,0.04)",
  },
  panelHeading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "18px",
  },
  sectionTitle: { margin: 0, fontSize: "21px" },
  countBadge: {
    padding: "5px 10px",
    background: "#dcfce7",
    color: "#166534",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },
  search: {
    width: "100%",
    padding: "13px",
    marginBottom: "22px",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    boxSizing: "border-box",
    fontSize: "14px",
  },
  productGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 190px), 1fr))",
    gap: "16px",
  },
  productCard: {
    padding: "17px",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
  },
  productIcon: {
    display: "grid",
    placeItems: "center",
    width: "42px",
    height: "42px",
    background: "#f0fdf4",
    borderRadius: "10px",
    fontSize: "23px",
  },
  productName: {
    margin: "13px 0 5px",
    fontSize: "16px",
    overflowWrap: "anywhere",
  },
  category: { margin: 0, color: "#64748b", fontSize: "13px" },
  price: {
    margin: "13px 0 5px",
    color: "#166534",
    fontSize: "18px",
    fontWeight: "700",
  },
  stock: { margin: "0 0 14px", color: "#64748b", fontSize: "12px" },
  addButton: {
    width: "100%",
    marginTop: "auto",
    padding: "10px",
    border: "none",
    borderRadius: "7px",
    background: "#166534",
    color: "#fff",
    fontWeight: "600",
    cursor: "pointer",
  },
  disabledButton: {
    background: "#cbd5e1",
    color: "#64748b",
    cursor: "not-allowed",
  },
  emptyState: { padding: "40px 15px", textAlign: "center", color: "#64748b" },
  emptyCart: { padding: "38px 12px", textAlign: "center", color: "#64748b" },
  cartIcon: { fontSize: "38px" },
  cartItems: { maxHeight: "440px", overflowY: "auto" },
  cartItem: {
    display: "flex",
    justifyContent: "space-between",
    padding: "16px 0",
    borderBottom: "1px solid #e2e8f0",
  },
  cartItemInfo: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  cartItemName: { overflowWrap: "anywhere" },
  cartItemPrice: { color: "#166534", fontWeight: "600" },
  quantityControls: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  quantityButton: {
    width: "30px",
    height: "30px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#fff",
    cursor: "pointer",
    fontSize: "18px",
  },
  quantity: { minWidth: "18px", textAlign: "center", fontWeight: "600" },
  removeButton: {
    marginLeft: "auto",
    border: "none",
    background: "transparent",
    color: "#dc2626",
    cursor: "pointer",
  },
  summary: {
    marginTop: "24px",
    paddingTop: "18px",
    borderTop: "1px solid #e2e8f0",
  },
  paymentLabel: { display: "block", marginBottom: "8px", fontWeight: "600" },
  paymentSelect: {
    width: "100%",
    padding: "12px",
    marginBottom: "20px",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    background: "#fff",
    fontSize: "14px",
    boxSizing: "border-box",
  },
  phoneSection: { marginBottom: "20px" },
  phoneInput: {
    width: "100%",
    padding: "12px",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    fontSize: "15px",
    boxSizing: "border-box",
  },
  phoneHint: {
    color: "#64748b",
    fontSize: "12px",
    lineHeight: 1.5,
    marginBottom: 0,
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "16px",
    color: "#64748b",
  },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "22px",
    fontSize: "19px",
  },
  checkoutButton: {
    width: "100%",
    padding: "14px",
    border: "none",
    borderRadius: "8px",
    background: "#166534",
    color: "#fff",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer",
  },
  clearButton: {
    width: "100%",
    marginTop: "10px",
    padding: "11px",
    border: "1px solid #fecaca",
    borderRadius: "8px",
    background: "#fff",
    color: "#b91c1c",
    cursor: "pointer",
  },
  disabledClearButton: { opacity: 0.5, cursor: "not-allowed" },
  notice: {
    marginTop: "14px",
    color: "#64748b",
    fontSize: "12px",
    lineHeight: 1.5,
    textAlign: "center",
  },
};

export default CashierPOS;
