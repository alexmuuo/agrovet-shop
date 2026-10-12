import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/api";

function ForgotPassword() {
const [email, setEmail] = useState("");
const [message, setMessage] = useState("");
const [error, setError] = useState("");
const [loading, setLoading] = useState(false);

const handleSubmit = async (e) => {
e.preventDefault();

setMessage("");
setError("");

if (!email.trim()) {
  setError("Please enter your email address.");
  return;
}

try {
  setLoading(true);

  const response = await api.post(
    "/customers/forgot-password",
    {
      email: email.trim().toLowerCase(),
    }
  );

  setMessage(
    response.data.message ||
      "If an eligible account exists for that email, a password-reset link will be sent."
  );

  setEmail("");
} catch (err) {
  setError(
    err.response?.data?.message ||
      "We couldn't process your request. Please try again."
  );
} finally {
  setLoading(false);
}

};

return ( <div className="container py-5">
<div
className="card shadow-sm mx-auto"
style={{ maxWidth: "450px" }}
> <div className="card-body p-4"> <h2 className="text-center mb-3">
Forgot Password? </h2>

      <p className="text-muted text-center mb-4">
        Enter the email address associated with your
        Agrovet account. If eligible, you'll receive a
        link to reset your password.
      </p>

      {message && (
        <div
          className="alert alert-success"
          role="status"
        >
          {message}
        </div>
      )}

      {error && (
        <div
          className="alert alert-danger"
          role="alert"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label
            htmlFor="reset-email"
            className="form-label"
          >
            Email Address
          </label>

          <input
            id="reset-email"
            type="email"
            className="form-control"
            placeholder="Enter your registered email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <button
          type="submit"
          className="btn btn-success w-100"
          disabled={loading}
        >
          {loading
            ? "Sending..."
            : "Send Reset Link"}
        </button>
      </form>

      <div className="text-center mt-3">
        <Link to="/login">
          Back to Login
        </Link>
      </div>
    </div>
  </div>
</div>


);
}

export default ForgotPassword;
