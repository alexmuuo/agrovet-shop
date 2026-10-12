import { useState } from "react";
import api from "../../api/api";

function Cashiers() {
  const [formData, setFormData] = useState({
    username: "",
    full_name: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [createdCashier, setCreatedCashier] = useState(null);

  // ============================================================
  // HANDLE FORM INPUTS
  // ============================================================

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previousData) => ({
      ...previousData,
      [name]: value,
    }));

    setError("");
    setSuccess("");
  };

  // ============================================================
  // CREATE CASHIER ACCOUNT
  // ============================================================

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");
    setCreatedCashier(null);

    const username = formData.username.trim();
    const full_name = formData.full_name.trim();
    const password = formData.password;

    // Frontend validation
    if (!username || !full_name || !password) {
      setError("Please fill in all the fields.");
      return;
    }

    if (username.length > 80) {
      setError("Username cannot exceed 80 characters.");
      return;
    }

    if (full_name.length > 150) {
      setError("Full name cannot exceed 150 characters.");
      return;
    }

    if (password.length < 12) {
      setError("Password must contain at least 12 characters.");
      return;
    }

    // An admin token is required to create a cashier.
    const adminToken = localStorage.getItem("adminToken");

    if (!adminToken) {
      setError(
        "Admin authentication is missing. Please log in as an admin again."
      );
      return;
    }

    try {
      setLoading(true);

      const response = await api.post("/cashier/create", {
        username,
        full_name,
        password,
      });

      setCreatedCashier(response.data.cashier);

      setSuccess(
        response.data.message ||
          "Cashier account created successfully."
      );

      // Clear the form after successful creation.
      setFormData({
        username: "",
        full_name: "",
        password: "",
      });
    } catch (err) {
      const status = err.response?.status;

      if (status === 401) {
        setError(
          "Your admin session is invalid or has expired. Please log in again."
        );
      } else if (status === 403) {
        setError(
          "You do not have permission to create cashier accounts."
        );
      } else if (status === 409) {
        setError(
          "That username already exists. Please choose another username."
        );
      } else {
        setError(
          err.response?.data?.message ||
            "Unable to create the cashier account. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // PAGE STYLES
  // ============================================================

  const styles = {
    page: {
      minHeight: "100vh",
      background: "#f4f7fb",
      padding: "32px 20px",
      boxSizing: "border-box",
    },

    container: {
      maxWidth: "950px",
      margin: "0 auto",
    },

    heading: {
      marginBottom: "8px",
      color: "#183153",
      fontSize: "30px",
      fontWeight: "700",
    },

    subtitle: {
      color: "#64748b",
      marginTop: "0",
      marginBottom: "28px",
      lineHeight: "1.6",
    },

    card: {
      background: "#ffffff",
      padding: "30px",
      borderRadius: "14px",
      boxShadow: "0 5px 24px rgba(15, 23, 42, 0.07)",
      marginBottom: "24px",
    },

    sectionTitle: {
      marginTop: "0",
      marginBottom: "8px",
      color: "#183153",
      fontSize: "21px",
    },

    sectionDescription: {
      color: "#64748b",
      fontSize: "14px",
      lineHeight: "1.6",
      marginBottom: "24px",
    },

    label: {
      display: "block",
      marginBottom: "8px",
      color: "#334155",
      fontSize: "14px",
      fontWeight: "600",
    },

    input: {
      width: "100%",
      padding: "12px 14px",
      border: "1px solid #cbd5e1",
      borderRadius: "8px",
      fontSize: "15px",
      outline: "none",
      boxSizing: "border-box",
      background: "#ffffff",
    },

    field: {
      marginBottom: "20px",
    },

    button: {
      width: "100%",
      padding: "14px",
      border: "none",
      borderRadius: "8px",
      background: loading ? "#94a3b8" : "#15803d",
      color: "#ffffff",
      fontSize: "15px",
      fontWeight: "700",
      cursor: loading ? "not-allowed" : "pointer",
    },

    alert: {
      padding: "13px 15px",
      borderRadius: "8px",
      marginBottom: "20px",
      fontSize: "14px",
      lineHeight: "1.6",
    },

    error: {
      background: "#fef2f2",
      color: "#b91c1c",
      border: "1px solid #fecaca",
    },

    success: {
      background: "#f0fdf4",
      color: "#166534",
      border: "1px solid #bbf7d0",
    },

    detailRow: {
      display: "flex",
      justifyContent: "space-between",
      gap: "20px",
      padding: "12px 0",
      borderBottom: "1px solid #e2e8f0",
    },

    detailLabel: {
      color: "#64748b",
      fontSize: "14px",
    },

    detailValue: {
      color: "#183153",
      fontWeight: "600",
      textAlign: "right",
      overflowWrap: "anywhere",
    },
  };

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        {/* PAGE HEADING */}

        <h1 style={styles.heading}>Cashier Management</h1>

        <p style={styles.subtitle}>
          Create cashier accounts for staff who will handle
          in-store sales and point-of-sale transactions.
        </p>

        {/* CREATE CASHIER FORM */}

        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>
            Create a Cashier Account
          </h2>

          <p style={styles.sectionDescription}>
            Each cashier needs a unique username and a secure
            password. Cashier accounts are separate from admin
            and customer accounts.
          </p>

          {error && (
            <div
              role="alert"
              style={{
                ...styles.alert,
                ...styles.error,
              }}
            >
              {error}
            </div>
          )}

          {success && (
            <div
              role="status"
              style={{
                ...styles.alert,
                ...styles.success,
              }}
            >
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* FULL NAME */}

            <div style={styles.field}>
              <label
                htmlFor="full_name"
                style={styles.label}
              >
                Cashier's Full Name
              </label>

              <input
                id="full_name"
                name="full_name"
                type="text"
                autoComplete="name"
                placeholder="Enter the cashier's full name"
                value={formData.full_name}
                onChange={handleChange}
                maxLength={150}
                required
                style={styles.input}
              />
            </div>

            {/* USERNAME */}

            <div style={styles.field}>
              <label
                htmlFor="username"
                style={styles.label}
              >
                Username
              </label>

              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                placeholder="Choose a unique username"
                value={formData.username}
                onChange={handleChange}
                maxLength={80}
                required
                style={styles.input}
              />
            </div>

            {/* PASSWORD */}

            <div style={styles.field}>
              <label
                htmlFor="password"
                style={styles.label}
              >
                Initial Password
              </label>

              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="Enter at least 12 characters"
                value={formData.password}
                onChange={handleChange}
                minLength={12}
                required
                style={styles.input}
              />

              <small
                style={{
                  display: "block",
                  marginTop: "7px",
                  color: "#64748b",
                  lineHeight: "1.5",
                }}
              >
                Use a strong password and share it securely
                with the intended cashier.
              </small>
            </div>

            {/* SUBMIT */}

            <button
              type="submit"
              disabled={loading}
              style={styles.button}
            >
              {loading
                ? "Creating Account..."
                : "Create Cashier Account"}
            </button>
          </form>
        </section>

        {/* SUCCESSFUL ACCOUNT DETAILS */}

        {createdCashier && (
          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>
              Cashier Account Created
            </h2>

            <p
              style={{
                color: "#64748b",
                lineHeight: "1.6",
              }}
            >
              The account has been saved successfully.
              The cashier can use these account details to
              sign in once we finish the cashier login page.
            </p>

            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>
                Cashier ID
              </span>

              <span style={styles.detailValue}>
                {createdCashier.id}
              </span>
            </div>

            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>
                Full Name
              </span>

              <span style={styles.detailValue}>
                {createdCashier.full_name}
              </span>
            </div>

            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>
                Username
              </span>

              <span style={styles.detailValue}>
                {createdCashier.username}
              </span>
            </div>

            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>
                Account Status
              </span>

              <span style={styles.detailValue}>
                {createdCashier.is_active
                  ? "Active"
                  : "Inactive"}
              </span>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default Cashiers;