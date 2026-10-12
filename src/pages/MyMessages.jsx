import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/api";

function MyMessages() {
  const [customer, setCustomer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // =========================================================
  // GET THE CURRENTLY LOGGED-IN CUSTOMER
  // =========================================================

  const getStoredCustomer = () => {
    const token = localStorage.getItem("customerToken");
    const storedCustomer = localStorage.getItem("customer");

    if (!token || !storedCustomer) {
      return null;
    }

    try {
      const parsedCustomer = JSON.parse(storedCustomer);

      return parsedCustomer?.id ? parsedCustomer : null;
    } catch {
      return null;
    }
  };

  // =========================================================
  // LOAD THE CURRENT CUSTOMER'S CONVERSATION
  // =========================================================

  const loadMessages = useCallback(async (customerId) => {
    setLoading(true);
    setError("");
    setMessages([]);

    try {
      const response = await api.get(
        `/messages/customer/${customerId}`
      );

      // Support either a direct array or { data: [...] }.
      const loadedMessages = Array.isArray(response.data)
        ? response.data
        : response.data?.data;

      if (!Array.isArray(loadedMessages)) {
        console.error(
          "Unexpected messages response:",
          response.data
        );

        throw new Error(
          "The server returned an unexpected messages format."
        );
      }

      // Make sure the same customer is still logged in.
      const activeCustomer = getStoredCustomer();

      if (
        !activeCustomer ||
        String(activeCustomer.id) !== String(customerId)
      ) {
        return;
      }

      setMessages(loadedMessages);
      setError("");
    } catch (err) {
      console.error(
        "Could not load conversation:",
        err.response?.data || err
      );

      const activeCustomer = getStoredCustomer();

      if (
        activeCustomer &&
        String(activeCustomer.id) === String(customerId)
      ) {
        setMessages([]);

        setError(
          err.response?.data?.message ||
            err.message ||
            "Could not load your conversation. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // =========================================================
  // SYNCHRONIZE CUSTOMER LOGIN AND LOGOUT
  // =========================================================

  useEffect(() => {
    let cancelled = false;

    const syncCustomer = async () => {
      const storedCustomer = getStoredCustomer();

      setCustomer(storedCustomer);
      setMessages([]);
      setMessage("");
      setError("");

      if (storedCustomer?.id) {
        setLoading(true);

        try {
          const response = await api.get(
            `/messages/customer/${storedCustomer.id}`
          );

          const loadedMessages = Array.isArray(response.data)
            ? response.data
            : response.data?.data;

          if (!Array.isArray(loadedMessages)) {
            throw new Error(
              "The server returned an unexpected messages format."
            );
          }

          if (cancelled) return;

          const activeCustomer = getStoredCustomer();

          if (
            activeCustomer &&
            String(activeCustomer.id) ===
              String(storedCustomer.id)
          ) {
            setMessages(loadedMessages);
            setError("");
          }
        } catch (err) {
          console.error(
            "Could not load conversation:",
            err.response?.data || err
          );

          if (cancelled) return;

          const activeCustomer = getStoredCustomer();

          if (
            activeCustomer &&
            String(activeCustomer.id) ===
              String(storedCustomer.id)
          ) {
            setMessages([]);

            setError(
              err.response?.data?.message ||
                err.message ||
                "Could not load your conversation. Please try again."
            );
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      } else {
        setLoading(false);
      }
    };

    syncCustomer();

    window.addEventListener("customerLogin", syncCustomer);
    window.addEventListener("customerLogout", syncCustomer);
    window.addEventListener("storage", syncCustomer);

    return () => {
      cancelled = true;

      window.removeEventListener("customerLogin", syncCustomer);
      window.removeEventListener("customerLogout", syncCustomer);
      window.removeEventListener("storage", syncCustomer);
    };
  }, []);

  // =========================================================
  // SEND A MESSAGE
  // =========================================================

  const sendMessage = async (e) => {
    e.preventDefault();

    if (!message.trim() || !customer || sending) {
      return;
    }

    const activeCustomer = getStoredCustomer();

    if (
      !activeCustomer ||
      String(activeCustomer.id) !== String(customer.id)
    ) {
      setCustomer(null);
      setMessages([]);
      setError("Your session has changed. Please log in again.");
      return;
    }

    setSending(true);
    setError("");

    try {
      // The backend identifies the customer from their token.
      const response = await api.post("/messages", {
        message: message.trim(),
      });

      const sentMessage = response.data?.data;

      if (!sentMessage) {
        throw new Error(
          "The server did not return the sent message."
        );
      }

      // Check that the same customer is still active.
      const currentCustomer = getStoredCustomer();

      if (
        currentCustomer &&
        String(currentCustomer.id) === String(customer.id)
      ) {
        setMessages((previous) => [
          ...previous,
          sentMessage,
        ]);

        setMessage("");
      }
    } catch (err) {
      console.error(
        "Could not send message:",
        err.response?.data || err
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

  // =========================================================
  // LOGGED-OUT VIEW
  // =========================================================

  if (!customer) {
    return (
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-md-7 col-lg-6">
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center p-5">
                <i className="bi bi-chat-dots text-success fs-1"></i>

                <h2 className="fw-bold mt-3">
                  My Agrovet Messages
                </h2>

                <p className="text-secondary mb-4">
                  Please log in to view your conversations
                  and contact our team.
                </p>

                <Link to="/login" className="btn btn-success">
                  Log In
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================
  // CUSTOMER MESSAGES VIEW
  // =========================================================

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-lg-8">

          <div className="text-center mb-5">
            <div className="text-success fs-1 mb-3">
              <i className="bi bi-chat-dots"></i>
            </div>

            <h1 className="fw-bold">
              My Agrovet Messages
            </h1>

            <p className="text-secondary">
              Chat with our team about your orders and products.
            </p>
          </div>

          {error && (
            <div className="alert alert-danger" role="alert">
              <i className="bi bi-exclamation-circle me-2"></i>
              {error}
            </div>
          )}

          <div className="card border-0 shadow-sm">

            <div className="card-header bg-success text-white p-3">
              <strong>
                <i className="bi bi-person-circle me-2"></i>
                {customer.name}
              </strong>

              <div className="small">
                {customer.phone}
              </div>
            </div>

            <div
              className="card-body"
              style={{
                maxHeight: "450px",
                overflowY: "auto",
              }}
            >
              {loading ? (
                <div className="text-center py-4">
                  <div
                    className="spinner-border text-success"
                    role="status"
                  >
                    <span className="visually-hidden">
                      Loading...
                    </span>
                  </div>

                  <p className="text-secondary mt-2">
                    Loading your conversation...
                  </p>
                </div>
              ) : messages.length === 0 ? (
                <p className="text-secondary text-center py-4">
                  No messages yet. Send us a message to start
                  a conversation!
                </p>
              ) : (
                messages.map((item) => (
                  <div
                    key={item.id}
                    className={`d-flex mb-3 ${
                      item.sender === "customer"
                        ? "justify-content-end"
                        : "justify-content-start"
                    }`}
                  >
                    <div
                      className={`p-3 rounded-3 ${
                        item.sender === "customer"
                          ? "bg-success text-white"
                          : "bg-light border"
                      }`}
                      style={{ maxWidth: "75%" }}
                    >
                      <div className="small fw-semibold mb-1">
                        {item.sender === "customer"
                          ? "You"
                          : "Agrovet"}
                      </div>

                      <div>{item.message}</div>

                      <div
                        className={`small mt-2 ${
                          item.sender === "customer"
                            ? "text-white-50"
                            : "text-secondary"
                        }`}
                      >
                        {item.created_at
                          ? new Date(
                              item.created_at
                            ).toLocaleString()
                          : ""}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="card-footer bg-white p-3">
              <form onSubmit={sendMessage}>
                <div className="input-group">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Type your message..."
                    value={message}
                    onChange={(e) =>
                      setMessage(e.target.value)
                    }
                    disabled={loading || sending}
                    required
                  />

                  <button
                    type="submit"
                    className="btn btn-success"
                    disabled={
                      loading ||
                      sending ||
                      !message.trim()
                    }
                  >
                    {sending ? (
                      <span className="spinner-border spinner-border-sm"></span>
                    ) : (
                      <i className="bi bi-send"></i>
                    )}
                  </button>
                </div>
              </form>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default MyMessages;
