import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";

function CashierLogin() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await api.post("/cashier/login", {
        username: username.trim(),
        password,
      });

      const { token, cashier } = response.data;

      if (!token || !cashier) {
        throw new Error("The server returned an invalid login response.");
      }

      // Store the cashier's separate authentication details.
      localStorage.setItem("cashierToken", token);
      localStorage.setItem("cashier", JSON.stringify(cashier));

      navigate("/cashier/pos");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          "Login failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.icon}>🛒</div>

        <h1 style={styles.title}>Cashier Login</h1>

        <p style={styles.subtitle}>
          Sign in to access the point-of-sale system.
        </p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleLogin}>
          <label style={styles.label}>Username</label>

          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            autoComplete="username"
            required
            style={styles.input}
          />

          <label style={styles.label}>Password</label>

          <div style={styles.passwordContainer}>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
              style={styles.passwordInput}
            />

            <button
              type="button"
              onClick={() =>
                setShowPassword((previous) => !previous)
              }
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              style={styles.toggleButton}
            >
              {showPassword ? "🙈 Hide" : "Show"}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p style={styles.footer}>
          Authorized cashiers only.
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "85vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    background: "#f3f6f4",
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    padding: "32px",
    background: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
  },
  icon: {
    fontSize: "42px",
    textAlign: "center",
    marginBottom: "12px",
  },
  title: {
    textAlign: "center",
    color: "#166534",
    fontSize: "28px",
    marginBottom: "8px",
  },
  subtitle: {
    textAlign: "center",
    color: "#64748b",
    marginBottom: "24px",
    lineHeight: 1.5,
  },
  error: {
    padding: "12px",
    marginBottom: "16px",
    color: "#991b1b",
    background: "#fee2e2",
    borderRadius: "8px",
    fontSize: "14px",
  },
  label: {
    display: "block",
    marginBottom: "8px",
    marginTop: "16px",
    fontWeight: "600",
    color: "#334155",
  },
  input: {
    width: "100%",
    padding: "12px",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    fontSize: "15px",
    boxSizing: "border-box",
  },
  passwordContainer: {
    display: "flex",
    width: "100%",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    overflow: "hidden",
    boxSizing: "border-box",
    background: "#ffffff",
  },
  passwordInput: {
    flex: 1,
    minWidth: 0,
    padding: "12px",
    border: "none",
    outline: "none",
    fontSize: "15px",
    boxSizing: "border-box",
  },
  toggleButton: {
    padding: "0 12px",
    border: "none",
    borderLeft: "1px solid #cbd5e1",
    background: "#f8fafc",
    color: "#334155",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  button: {
    width: "100%",
    marginTop: "24px",
    padding: "13px",
    background: "#166534",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
  },
  footer: {
    textAlign: "center",
    marginTop: "20px",
    color: "#64748b",
    fontSize: "13px",
  },
};

export default CashierLogin;

