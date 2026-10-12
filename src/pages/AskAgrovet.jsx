import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/api";

function AskAgrovet() {
  const [customer, setCustomer] = useState(null);
  const [messages, setMessages] = useState([]);

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
  });

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const messagesEndRef = useRef(null);
  const customerRef = useRef(null);
  const requestVersionRef = useRef(0);
  const mountedRef = useRef(false);

  // ============================================================
  // GET THE CURRENT AUTHENTICATED CUSTOMER
  // ============================================================

  const getStoredCustomer = useCallback(() => {
    const token = localStorage.getItem("customerToken");
    const storedCustomer = localStorage.getItem("customer");

    if (!token || !storedCustomer) {
      return null;
    }

    try {
      const parsedCustomer = JSON.parse(storedCustomer);

      if (!parsedCustomer?.id) {
        return null;
      }

      return parsedCustomer;
    } catch {
      return null;
    }
  }, []);

  // ============================================================
  // LOAD A CUSTOMER'S CONVERSATION
  // ============================================================

  const loadMessages = useCallback(
    async (customerId, requestVersion) => {
      try {
        const response = await api.get(
          `/messages/customer/${customerId}`
        );

        const loadedMessages = Array.isArray(response.data)
          ? response.data
          : response.data?.data;

        if (!Array.isArray(loadedMessages)) {
          throw new Error(
            "The server returned an unexpected messages format."
          );
        }

        const activeCustomer = getStoredCustomer();

        // Ignore responses from an old customer session.
        if (
          !mountedRef.current ||
          requestVersion !== requestVersionRef.current ||
          !activeCustomer ||
          String(activeCustomer.id) !== String(customerId)
        ) {
          return;
        }

        setMessages(loadedMessages);
        setError("");
      } catch (err) {
        const activeCustomer = getStoredCustomer();

        // Ignore errors from requests belonging to previous sessions.
        if (
          !mountedRef.current ||
          requestVersion !== requestVersionRef.current ||
          !activeCustomer ||
          String(activeCustomer.id) !== String(customerId)
        ) {
          return;
        }

        console.error(
          "Could not load messages:",
          err.response?.status,
          err.response?.data || err.message
        );

        setMessages([]);

        setError(
          err.response?.data?.message ||
            "Could not load your conversation. Please try again."
        );
      } finally {
        if (
          mountedRef.current &&
          requestVersion === requestVersionRef.current
        ) {
          setLoading(false);
        }
      }
    },
    [getStoredCustomer]
  );

  // ============================================================
  // SYNCHRONIZE CUSTOMER SESSION
  // ============================================================

  const syncCustomer = useCallback(() => {
    const storedCustomer = getStoredCustomer();
    const previousCustomer = customerRef.current;

    const previousId = previousCustomer?.id
      ? String(previousCustomer.id)
      : null;

    const nextId = storedCustomer?.id
      ? String(storedCustomer.id)
      : null;

    const token = localStorage.getItem("customerToken");
    const previousToken = previousCustomer
      ? previousCustomer.__sessionToken
      : null;

    // Do nothing when the same customer session is already active.
    if (
      previousId === nextId &&
      previousToken === token
    ) {
      return;
    }

    // Invalidate all outstanding requests for the old session.
    requestVersionRef.current += 1;

    const requestVersion = requestVersionRef.current;

    const nextCustomer = storedCustomer
      ? {
          ...storedCustomer,
          __sessionToken: token,
        }
      : null;

    customerRef.current = nextCustomer;

    setCustomer(nextCustomer);
    setMessages([]);
    setMessage("");
    setError("");
    setSuccess("");
    setLoading(Boolean(nextCustomer?.id));

    if (nextCustomer) {
      setFormData({
        name: nextCustomer.name || "",
        phone: nextCustomer.phone || "",
        email: nextCustomer.email || "",
      });

      loadMessages(nextCustomer.id, requestVersion);
    } else {
      setLoading(false);

      setFormData({
        name: "",
        phone: "",
        email: "",
      });
    }
  }, [getStoredCustomer, loadMessages]);

  // ============================================================
  // INITIALIZE AND LISTEN FOR ACCOUNT CHANGES
  // ============================================================

  useEffect(() => {
    mountedRef.current = true;

    syncCustomer();

    const handleStorage = () => {
      syncCustomer();
    };

    window.addEventListener("customerLogin", handleStorage);
    window.addEventListener("customerLogout", handleStorage);
    window.addEventListener("storage", handleStorage);

    // Also check periodically in case another component updates
    // localStorage without dispatching a customer event.
    const sessionInterval = setInterval(() => {
      syncCustomer();
    }, 1000);

    return () => {
      mountedRef.current = false;
      requestVersionRef.current += 1;

      window.removeEventListener("customerLogin", handleStorage);
      window.removeEventListener("customerLogout", handleStorage);
      window.removeEventListener("storage", handleStorage);

      clearInterval(sessionInterval);
    };
  }, [syncCustomer]);

  // ============================================================
  // AUTO-REFRESH THE ACTIVE CONVERSATION
  // ============================================================

  useEffect(() => {
    if (!customer?.id) {
      return;
    }

    const customerId = customer.id;

    const interval = setInterval(() => {
      const activeCustomer = getStoredCustomer();

      if (
        !activeCustomer ||
        String(activeCustomer.id) !== String(customerId)
      ) {
        syncCustomer();
        return;
      }

      loadMessages(
        customerId,
        requestVersionRef.current
      );
    }, 5000);

    return () => clearInterval(interval);
  }, [customer, getStoredCustomer, loadMessages, syncCustomer]);

  // ============================================================
  // SCROLL TO THE LATEST MESSAGE
  // ============================================================

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  // ============================================================
  // HANDLE CUSTOMER DETAILS
  // ============================================================

  const handleChange = (e) => {
    setFormData((previous) => ({
      ...previous,
      [e.target.name]: e.target.value,
    }));
  };

  // ============================================================
  // SEND MESSAGE
  // ============================================================

  const handleSend = async (e) => {
    e.preventDefault();

    const trimmedMessage = message.trim();

    if (!trimmedMessage || sending) {
      return;
    }

    setError("");
    setSuccess("");

    let currentCustomer = getStoredCustomer();

    // ==========================================================
    // LEGACY GUEST FLOW
    // ==========================================================
    // If the visitor is not logged in, retain the existing
    // guest/customer creation flow. Authenticated customers
    // always use the customer token instead.

    if (!currentCustomer) {
      if (!formData.name.trim()) {
        setError("Please enter your name.");
        return;
      }

      if (!formData.phone.trim()) {
        setError("Please enter your phone number.");
        return;
      }
    }

    setSending(true);

    try {
      if (!currentCustomer) {
        const customerResponse = await api.post(
          "/customers",
          {
            name: formData.name.trim(),
            phone: formData.phone.trim(),
            email: formData.email.trim() || null,
          }
        );

        currentCustomer = customerResponse.data.customer;

        if (!currentCustomer?.id) {
          throw new Error(
            "Could not identify the customer account."
          );
        }

        // This legacy flow is for guests only. Do not overwrite
        // the authenticated customer's session.
        localStorage.setItem(
          "agrovet_customer",
          JSON.stringify(currentCustomer)
        );

        customerRef.current = currentCustomer;

        setCustomer(currentCustomer);
        setMessages([]);
      }

      const activeCustomer = getStoredCustomer();

      // Authenticated users must still match the active session.
      if (
        activeCustomer &&
        String(activeCustomer.id) !==
          String(currentCustomer.id)
      ) {
        syncCustomer();

        setError(
          "Your account changed. Please send your message again."
        );

        return;
      }

      // If an account token exists, the backend determines
      // the sender from that token, not from the request body.
      const response = await api.post("/messages", {
        message: trimmedMessage,
      });

      const sentMessage =
        response.data?.data ||
        response.data?.message_data;

      if (!sentMessage) {
        throw new Error(
          "The server did not return the sent message."
        );
      }

      // Do not append a message to a different account.
      const latestCustomer = getStoredCustomer();

      if (
        latestCustomer &&
        String(latestCustomer.id) !==
          String(currentCustomer.id)
      ) {
        syncCustomer();
        return;
      }

      setMessages((previous) => [
        ...previous,
        sentMessage,
      ]);

      setMessage("");
      setSuccess("Message sent");

      setTimeout(() => {
        setSuccess("");
      }, 2500);
    } catch (err) {
      console.error(
        "Could not send message:",
        err.response?.status,
        err.response?.data || err.message
      );

      setError(
        err.response?.data?.message ||
          err.message ||
          "Could not send your message. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  // ============================================================
  // FORMAT TIME
  // ============================================================

  const formatTime = (date) => {
    if (!date) {
      return "";
    }

    const messageDate = new Date(date);

    if (Number.isNaN(messageDate.getTime())) {
      return "";
    }

    return messageDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ============================================================
  // FORMAT DATE
  // ============================================================

  const formatDate = (date) => {
    if (!date) {
      return "";
    }

    const messageDate = new Date(date);

    if (Number.isNaN(messageDate.getTime())) {
      return "";
    }

    return messageDate.toLocaleDateString([], {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div
      className="container py-4"
      style={{ maxWidth: "950px" }}
    >
      {/* PAGE HEADER */}

      <div className="mb-4">
        <div className="d-flex align-items-center gap-3">
          <div
            className="d-flex align-items-center justify-content-center rounded-circle"
            style={{
              width: "52px",
              height: "52px",
              backgroundColor: "#e8f5e9",
              fontSize: "25px",
            }}
          >
            🌱
          </div>

          <div>
            <h2 className="fw-bold mb-1">Ask Agrovet</h2>
            <p className="text-muted mb-0">
              Get advice from our agrovet team
            </p>
          </div>
        </div>
      </div>

      {/* CHAT CARD */}

      <div
        className="card border-0 shadow-sm overflow-hidden"
        style={{ borderRadius: "18px" }}
      >
        {/* CHAT HEADER */}

        <div
          className="p-3 border-bottom"
          style={{ backgroundColor: "#f8faf8" }}
        >
          <div className="d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-3">
              <div
                className="d-flex align-items-center justify-content-center rounded-circle"
                style={{
                  width: "45px",
                  height: "45px",
                  backgroundColor: "#198754",
                  color: "white",
                  fontSize: "20px",
                }}
              >
                🌾
              </div>

              <div>
                <div className="fw-semibold">
                  Agrovet Support
                </div>

                <div
                  className="small"
                  style={{ color: "#198754" }}
                >
                  <span
                    className="d-inline-block rounded-circle me-1"
                    style={{
                      width: "7px",
                      height: "7px",
                      backgroundColor: "#198754",
                    }}
                  ></span>
                  Available to help
                </div>
              </div>
            </div>

            {customer && (
              <div className="text-end d-none d-sm-block">
                <div className="small text-muted">
                  Chatting as
                </div>

                <div className="fw-semibold">
                  {customer.name}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CHAT AREA */}

        <div
          className="p-3 p-md-4"
          style={{
            height: "500px",
            overflowY: "auto",
            backgroundColor: "#f7f9f7",
          }}
        >
          {loading && (
            <div className="h-100 d-flex align-items-center justify-content-center">
              <div className="text-center text-muted">
                <div
                  className="spinner-border mb-3"
                  role="status"
                >
                  <span className="visually-hidden">
                    Loading...
                  </span>
                </div>

                <div>Loading your conversation...</div>
              </div>
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="h-100 d-flex align-items-center justify-content-center">
              <div
                className="text-center"
                style={{ maxWidth: "430px" }}
              >
                <div
                  style={{
                    fontSize: "50px",
                    marginBottom: "10px",
                  }}
                >
                  👋
                </div>

                <h5 className="fw-bold">
                  How can we help?
                </h5>

                <p className="text-muted mb-3">
                  Ask us anything about farming, crops,
                  livestock, pests, diseases, fertilizers,
                  animal health or our products.
                </p>

                <div className="d-flex flex-wrap justify-content-center gap-2">
                  <span className="badge bg-white text-dark border p-2">
                    🌽 Crop problems
                  </span>

                  <span className="badge bg-white text-dark border p-2">
                    🐄 Animal health
                  </span>

                  <span className="badge bg-white text-dark border p-2">
                    🐛 Pest control
                  </span>

                  <span className="badge bg-white text-dark border p-2">
                    🌱 Fertilizers
                  </span>
                </div>
              </div>
            </div>
          )}

          {!loading && messages.length > 0 && (
            <>
              <div className="text-center mb-4">
                <span className="badge bg-white text-muted border px-3 py-2">
                  Your conversation
                </span>
              </div>

              {messages.map((item, index) => {
                const isCustomer =
                  item.sender === "customer";

                const currentDate = formatDate(
                  item.created_at
                );

                const previousDate = formatDate(
                  messages[index - 1]?.created_at
                );

                const showDate =
                  index === 0 ||
                  currentDate !== previousDate;

                return (
                  <div key={item.id || index}>
                    {showDate && (
                      <div className="text-center my-3">
                        <small className="text-muted">
                          {currentDate}
                        </small>
                      </div>
                    )}

                    <div
                      className={`d-flex mb-3 ${
                        isCustomer
                          ? "justify-content-end"
                          : "justify-content-start"
                      }`}
                    >
                      <div style={{ maxWidth: "78%" }}>
                        <div
                          className="small text-muted mb-1"
                          style={{
                            marginLeft: isCustomer ? "0" : "8px",
                            marginRight: isCustomer ? "8px" : "0",
                            textAlign: isCustomer ? "right" : "left",
                          }}
                        >
                          {isCustomer ? "You" : "Agrovet Support"}
                        </div>

                        <div
                          className="px-3 py-2"
                          style={{
                            backgroundColor: isCustomer
                              ? "#198754"
                              : "#ffffff",
                            color: isCustomer
                              ? "#ffffff"
                              : "#212529",
                            borderRadius: isCustomer
                              ? "16px 16px 4px 16px"
                              : "16px 16px 16px 4px",
                            boxShadow:
                              "0 1px 3px rgba(0,0,0,0.08)",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          <div>{item.message}</div>

                          <div
                            className="mt-1"
                            style={{
                              fontSize: "11px",
                              opacity: isCustomer ? 0.8 : 0.55,
                              textAlign: "right",
                            }}
                          >
                            {formatTime(item.created_at)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div ref={messagesEndRef}></div>
            </>
          )}
        </div>

        {/* ERROR / SUCCESS */}

        {(error || success) && (
          <div className="px-3 pt-3">
            {error && (
              <div className="alert alert-danger py-2 mb-2">
                {error}
              </div>
            )}

            {success && (
              <div className="alert alert-success py-2 mb-2">
                {success}
              </div>
            )}
          </div>
        )}

        {/* FIRST-TIME CUSTOMER DETAILS */}

        {!customer && (
          <div className="p-3 border-top bg-white">
            <div className="mb-3">
              <h6 className="fw-bold mb-1">
                Before you start
              </h6>

              <small className="text-muted">
                Tell us who you are so our team can get back to you.
              </small>
            </div>

            <div className="row g-2">
              <div className="col-md-4">
                <input
                  type="text"
                  name="name"
                  className="form-control"
                  placeholder="Your name"
                  value={formData.name}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-4">
                <input
                  type="tel"
                  name="phone"
                  className="form-control"
                  placeholder="Phone number"
                  value={formData.phone}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-4">
                <input
                  type="email"
                  name="email"
                  className="form-control"
                  placeholder="Email (optional)"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>
        )}

        {/* MESSAGE COMPOSER */}

        <div className="p-3 border-top bg-white">
          <form onSubmit={handleSend}>
            <div className="d-flex align-items-end gap-2">
              <div className="flex-grow-1">
                <textarea
                  className="form-control"
                  rows="2"
                  placeholder={
                    customer
                      ? "Type your message..."
                      : "Type your question..."
                  }
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={sending || loading}
                  style={{
                    resize: "none",
                    borderRadius: "14px",
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey
                    ) {
                      e.preventDefault();

                      if (!sending && !loading) {
                        handleSend(e);
                      }
                    }
                  }}
                />

                <div className="small text-muted mt-1">
                  Press Enter to send · Shift + Enter for a new line
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-success d-flex align-items-center justify-content-center"
                disabled={
                  sending ||
                  loading ||
                  !message.trim()
                }
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "14px",
                }}
              >
                {sending ? (
                  <span
                    className="spinner-border spinner-border-sm"
                    role="status"
                  ></span>
                ) : (
                  "➤"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* DISCLAIMER */}

      <div className="text-center mt-3">
        <small className="text-muted">
          🌱 Agrovet advice is for guidance only. For serious animal
          or crop problems, consult a qualified professional.
        </small>
      </div>
    </div>
  );
}

export default AskAgrovet;
