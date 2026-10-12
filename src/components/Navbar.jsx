import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { STORE_NAME } from "../config/store";
import { useCart } from "../context/CartContext";
import api from "../api/api";

function Navbar() {
  const { cartCount } = useCart();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [categories, setCategories] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  // Notification dropdown positioning
  const notificationButtonRef = useRef(null);

  const [notificationDropdownPosition, setNotificationDropdownPosition] =
    useState({
      top: 80,
      left: 12,
      width: 350,
      maxHeight: 450,
    });

  const positionNotificationDropdown = () => {
    const button = notificationButtonRef.current;

    if (!button) return;

    const rect = button.getBoundingClientRect();
    const viewportPadding = 12;

    const width = Math.min(
      350,
      window.innerWidth - viewportPadding * 2
    );

    const left = Math.min(
      Math.max(viewportPadding, rect.right - width),
      window.innerWidth - width - viewportPadding
    );

    const top = rect.bottom + 6;

    const maxHeight = Math.max(
      120,
      Math.min(
        450,
        window.innerHeight - top - viewportPadding
      )
    );

    setNotificationDropdownPosition({
      top,
      left,
      width,
      maxHeight,
    });
  };

  // LOAD LOGGED-IN CUSTOMER
  useEffect(() => {
    const loadCustomer = () => {
      const token = localStorage.getItem("customerToken");
      const savedCustomer = localStorage.getItem("customer");

      if (!token || !savedCustomer) {
        setCustomer(null);
        setNotifications([]);
        setUnreadCount(0);
        setUnreadMessageCount(0);
        return;
      }

      try {
        const parsedCustomer = JSON.parse(savedCustomer);

        if (!parsedCustomer?.id) {
          setCustomer(null);
          setNotifications([]);
          setUnreadCount(0);
          setUnreadMessageCount(0);
          return;
        }

        setCustomer(parsedCustomer);
      } catch (error) {
        console.error("Invalid customer data:", error);

        localStorage.removeItem("customer");
        localStorage.removeItem("customerToken");

        setCustomer(null);
        setNotifications([]);
        setUnreadCount(0);
        setUnreadMessageCount(0);
      }
    };

    loadCustomer();

    window.addEventListener("customerLogin", loadCustomer);
    window.addEventListener("customerLogout", loadCustomer);
    window.addEventListener("storage", loadCustomer);

    return () => {
      window.removeEventListener("customerLogin", loadCustomer);
      window.removeEventListener("customerLogout", loadCustomer);
      window.removeEventListener("storage", loadCustomer);
    };
  }, []);

  // LOAD CATEGORIES
  useEffect(() => {
    let cancelled = false;

    const loadCategories = async () => {
      try {
        const response = await api.get("/products");

        if (cancelled || !Array.isArray(response.data)) {
          return;
        }

        const categoryNames = response.data
          .map((product) =>
            typeof product.category === "string"
              ? product.category.trim()
              : ""
          )
          .filter((category) => category.length > 0);

        const uniqueCategories = [
          ...new Set(categoryNames),
        ].sort((a, b) => a.localeCompare(b));

        setCategories(uniqueCategories);
      } catch (error) {
        if (!cancelled) {
          console.error(
            "Could not load categories:",
            error.response?.data || error.message
          );
        }
      }
    };

    loadCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  // LOAD CUSTOMER NOTIFICATIONS
  useEffect(() => {
    let cancelled = false;

    if (!customer?.id) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    setNotifications([]);
    setUnreadCount(0);

    const hasActiveSession = () => {
      try {
        const token = localStorage.getItem("customerToken");

        const savedCustomer = JSON.parse(
          localStorage.getItem("customer") || "null"
        );

        return (
          Boolean(token) &&
          String(savedCustomer?.id) === String(customer.id)
        );
      } catch {
        return false;
      }
    };

    const loadNotifications = async () => {
      try {
        const response = await api.get(
          `/notifications/customer/${customer.id}`
        );

        if (cancelled || !hasActiveSession()) {
          return;
        }

        setNotifications(
          Array.isArray(response.data?.data)
            ? response.data.data
            : []
        );
      } catch (error) {
        if (!cancelled) {
          console.error(
            "Could not load notifications:",
            error.response?.data || error.message
          );
        }
      }
    };

    const loadUnreadCount = async () => {
      try {
        const response = await api.get(
          `/notifications/customer/${customer.id}/unread-count`
        );

        if (cancelled || !hasActiveSession()) {
          return;
        }

        setUnreadCount(
          Number(response.data?.unread_count) || 0
        );
      } catch (error) {
        if (!cancelled) {
          console.error(
            "Could not load unread notification count:",
            error.response?.data || error.message
          );
        }
      }
    };

    const refreshNotifications = () => {
      loadNotifications();
      loadUnreadCount();
    };

    refreshNotifications();

    const interval = setInterval(
      refreshNotifications,
      5000
    );

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [customer?.id]);

  // LOAD UNREAD CUSTOMER MESSAGES
  useEffect(() => {
    let cancelled = false;

    if (!customer?.id) {
      setUnreadMessageCount(0);
      return;
    }

    setUnreadMessageCount(0);

    const loadUnreadMessages = async () => {
      try {
        const response = await api.get(
          "/messages/unread-count"
        );

        if (cancelled) {
          return;
        }

        const token = localStorage.getItem("customerToken");

        const savedCustomer = JSON.parse(
          localStorage.getItem("customer") || "null"
        );

        const hasActiveSession =
          Boolean(token) &&
          String(savedCustomer?.id) === String(customer.id);

        if (!hasActiveSession) {
          setUnreadMessageCount(0);
          return;
        }

        setUnreadMessageCount(
          Number(response.data?.unread_count) || 0
        );
      } catch (error) {
        if (!cancelled) {
          console.error(
            "Could not load unread message count:",
            error.response?.data || error.message
          );
        }
      }
    };

    loadUnreadMessages();

    const interval = setInterval(
      loadUnreadMessages,
      5000
    );

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [customer?.id]);

  // CUSTOMER LOGOUT
  const handleLogout = () => {
    localStorage.removeItem("customer");
    localStorage.removeItem("customerToken");

    setCustomer(null);
    setNotifications([]);
    setUnreadCount(0);
    setUnreadMessageCount(0);

    window.dispatchEvent(new Event("customerLogout"));

    navigate("/");
  };

  // MARK ONE NOTIFICATION AS READ
  const handleNotificationClick = async (notification) => {
    if (!customer?.id || notification.is_read) {
      return;
    }

    try {
      await api.put(
        `/notifications/${notification.id}/read`
      );

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, is_read: true }
            : item
        )
      );

      setUnreadCount((count) =>
        Math.max(count - 1, 0)
      );
    } catch (error) {
      console.error(
        "Could not mark notification as read:",
        error.response?.data || error.message
      );
    }
  };

  // MARK ALL NOTIFICATIONS AS READ
  const markAllAsRead = async () => {
    if (!customer?.id || unreadCount === 0) {
      return;
    }

    try {
      await api.put(
        `/notifications/customer/${customer.id}/read-all`
      );

      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          is_read: true,
        }))
      );

      setUnreadCount(0);
    } catch (error) {
      console.error(
        "Could not mark notifications as read:",
        error.response?.data || error.message
      );
    }
  };

  // NAVBAR UI
  return (
    <nav className="navbar navbar-expand-lg bg-white border-bottom sticky-top">
      <div className="container">
        {/* BRAND */}
        <Link
          className="navbar-brand fw-bold text-success"
          to="/"
        >
          <i className="bi bi-flower1 me-2"></i>
          {STORE_NAME}
        </Link>

        {/* MOBILE TOGGLE */}
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#mainNavbar"
          aria-controls="mainNavbar"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        {/* NAVIGATION */}
        <div
          className="collapse navbar-collapse"
          id="mainNavbar"
        >
          <ul className="navbar-nav mx-auto mb-2 mb-lg-0">
            <li className="nav-item">
              <Link className="nav-link" to="/">
                Home
              </Link>
            </li>

            <li className="nav-item">
              <Link className="nav-link" to="/products">
                Products
              </Link>
            </li>

            {/* CATEGORIES DROPDOWN */}
            <li className="nav-item dropdown">
              <button
                className="nav-link dropdown-toggle border-0 bg-transparent"
                type="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
                Categories
              </button>

              <ul className="dropdown-menu">
                <li>
                  <Link
                    className="dropdown-item"
                    to="/categories"
                  >
                    All Categories
                  </Link>
                </li>

                <li>
                  <hr className="dropdown-divider" />
                </li>

                {categories.length > 0 ? (
                  categories.map((category) => (
                    <li key={category}>
                      <Link
                        className="dropdown-item"
                        to={`/products?category=${encodeURIComponent(
                          category
                        )}`}
                      >
                        {category}
                      </Link>
                    </li>
                  ))
                ) : (
                  <li>
                    <span className="dropdown-item-text text-muted">
                      No categories available
                    </span>
                  </li>
                )}
              </ul>
            </li>

            {/* ASK AGROVET */}
            <li className="nav-item">
              <Link
                className="nav-link position-relative"
                to="/ask-agrovet"
                aria-label={
                  customer && unreadMessageCount > 0
                    ? `Ask Agrovet, ${unreadMessageCount} unread messages`
                    : "Ask Agrovet"
                }
                style={{ paddingRight: "12px" }}
              >
                Ask Agrovet

                {customer && unreadMessageCount > 0 && (
                  <span
                    className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
                    style={{
                      fontSize: "0.65rem",
                      minWidth: "18px",
                      zIndex: 1,
                      marginTop: "5px",
                    }}
                  >
                    {unreadMessageCount > 99
                      ? "99+"
                      : unreadMessageCount}
                  </span>
                )}
              </Link>
            </li>
          </ul>

          {/* RIGHT SIDE */}
          <div className="d-flex align-items-center gap-2 navbar-actions">
            {/* NOTIFICATIONS */}
            {customer && (
              <div className="dropdown notification-wrapper">
                <button
                  ref={notificationButtonRef}
                  className="btn btn-outline-success position-relative"
                  type="button"
                  data-bs-toggle="dropdown"
                  data-bs-display="static"
                  onClick={positionNotificationDropdown}
                  aria-expanded="false"
                  title="Notifications"
                  aria-label={
                    unreadCount > 0
                      ? `Notifications, ${unreadCount} unread`
                      : "Notifications"
                  }
                >
                  <i className="bi bi-bell"></i>

                  {unreadCount > 0 && (
                    <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
                      {unreadCount > 99
                        ? "99+"
                        : unreadCount}
                    </span>
                  )}
                </button>

                <div
                  className="dropdown-menu shadow notification-dropdown"
                  style={{
                    top: `${notificationDropdownPosition.top}px`,
                    left: `${notificationDropdownPosition.left}px`,
                    width: `${notificationDropdownPosition.width}px`,
                    maxHeight: `${notificationDropdownPosition.maxHeight}px`,
                  }}
                >
                  <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom notification-heading">
                    <strong>Notifications</strong>

                    {unreadCount > 0 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-success text-decoration-none"
                        onClick={markAllAsRead}
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  {notifications.length === 0 ? (
                    <div className="text-center text-secondary py-4">
                      <i className="bi bi-bell-slash fs-3 d-block mb-2"></i>
                      No notifications yet.
                    </div>
                  ) : (
                    notifications.slice(0, 10).map(
                      (notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          className={`dropdown-item text-wrap py-3 ${
                            !notification.is_read
                              ? "bg-light"
                              : ""
                          }`}
                          onClick={() =>
                            handleNotificationClick(notification)
                          }
                        >
                          <div className="d-flex notification-content">
                            <div className="me-3">
                              <i
                                className={`bi ${
                                  notification.type === "order"
                                    ? "bi-box-seam"
                                    : notification.type === "message"
                                    ? "bi-chat-dots"
                                    : "bi-bell"
                                } text-success fs-5`}
                              ></i>
                            </div>

                            <div className="flex-grow-1 notification-text">
                              <div className="fw-semibold">
                                {notification.title}
                              </div>

                              <div className="small text-secondary">
                                {notification.message}
                              </div>

                              {!notification.is_read && (
                                <span className="badge bg-success mt-1">
                                  New
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    )
                  )}
                </div>
              </div>
            )}

            {/* CART */}
            <Link
              to="/cart"
              className="btn btn-outline-success position-relative"
            >
              <i className="bi bi-cart3"></i>

              <span className="ms-1 d-none d-sm-inline">
                Cart
              </span>

              <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
                {cartCount}
              </span>
            </Link>

            {/* ACCOUNT */}
            {customer ? (
              <div className="dropdown">
                <button
                  className="btn btn-success dropdown-toggle"
                  type="button"
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                >
                  <i className="bi bi-person-circle me-1"></i>
                  {customer.name}
                </button>

                <ul className="dropdown-menu dropdown-menu-end">
                  <li>
                    <span className="dropdown-item-text">
                      <strong>{customer.name}</strong>
                      <br />
                      <small className="text-secondary">
                        {customer.phone}
                      </small>
                    </span>
                  </li>

                  <li>
                    <hr className="dropdown-divider" />
                  </li>

                  <li>
                    <button
                      type="button"
                      className="dropdown-item text-danger"
                      onClick={handleLogout}
                    >
                      <i className="bi bi-box-arrow-right me-2"></i>
                      Logout
                    </button>
                  </li>
                </ul>
              </div>
            ) : (
              <Link to="/login" className="btn btn-success">
                <i className="bi bi-person me-1"></i>
                Login
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;