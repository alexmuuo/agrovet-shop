import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/api";

function ResetPassword() {
const [searchParams] = useSearchParams();
const navigate = useNavigate();

const token = searchParams.get("token");

const [password, setPassword] = useState("");
const [confirmPassword, setConfirmPassword] = useState("");
const [showPassword, setShowPassword] = useState(false);
const [loading, setLoading] = useState(false);
const [error, setError] = useState("");
const [success, setSuccess] = useState("");

const passwordsMatch =
confirmPassword.length > 0 &&
password === confirmPassword;

const passwordsDoNotMatch =
confirmPassword.length > 0 &&
password !== confirmPassword;

const handleSubmit = async (e) => {
e.preventDefault();


setError("");
setSuccess("");

if (!token) {
  setError(
    "Your password-reset link is missing its token. Please request a new link."
  );
  return;
}

if (password.length < 6) {
  setError("Your password must contain at least 6 characters.");
  return;
}

if (password !== confirmPassword) {
  setError("Your passwords do not match.");
  return;
}

setLoading(true);

try {
  const response = await api.post(
    "/customers/reset-password",
    {
      token,
      password,
      confirm_password: confirmPassword,
    }
  );

  if (response.data.status !== "success") {
    setError(
      response.data.message ||
        "We couldn't reset your password. Please try again."
    );
    return;
  }

  setSuccess(
    "Your password has been reset successfully. Redirecting to login..."
  );

  setPassword("");
  setConfirmPassword("");

  // Allow the customer to read the success message.
  setTimeout(() => {
    navigate("/login", { replace: true });
  }, 2000);
} catch (err) {
  setError(
    err.response?.data?.message ||
      "The reset link may have expired or become invalid. Please request a new one."
  );
} finally {
  setLoading(false);
}

};

return ( <div className="container py-5"> <div className="row justify-content-center"> <div className="col-md-7 col-lg-5"> <div className="card shadow-sm border-0"> <div className="card-body p-4 p-md-5"> <h2 className="text-center mb-2">
Reset Your Password </h2>

          <p className="text-center text-muted mb-4">
            Choose a new password for your Agrovet account.
          </p>

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          {success && (
            <div className="alert alert-success" role="status">
              {success}
            </div>
          )}

          {!token ? (
            <div className="text-center">
              <p className="text-muted">
                This link is missing its reset token.
                Request a new password-reset link to continue.
              </p>

              <Link
                to="/forgot-password"
                className="btn btn-success w-100"
              >
                Request New Reset Link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label
                  htmlFor="new-password"
                  className="form-label"
                >
                  New Password
                </label>

                <input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />

                <small className="text-muted">
                  Use at least 6 characters.
                </small>
              </div>

              <div className="mb-3">
                <label
                  htmlFor="confirm-password"
                  className="form-label"
                >
                  Confirm New Password
                </label>

                <input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  className={`form-control ${
                    passwordsMatch
                      ? "is-valid"
                      : passwordsDoNotMatch
                      ? "is-invalid"
                      : ""
                  }`}
                  value={confirmPassword}
                  onChange={(e) =>
                    setConfirmPassword(e.target.value)
                  }
                  autoComplete="new-password"
                  minLength={6}
                  required
                />

                {passwordsMatch && (
                  <div className="valid-feedback">
                    Passwords match.
                  </div>
                )}

                {passwordsDoNotMatch && (
                  <div className="invalid-feedback">
                    Passwords do not match.
                  </div>
                )}
              </div>

              <div className="form-check mb-3">
                <input
                  id="show-password"
                  type="checkbox"
                  className="form-check-input"
                  checked={showPassword}
                  onChange={(e) =>
                    setShowPassword(e.target.checked)
                  }
                />

                <label
                  htmlFor="show-password"
                  className="form-check-label"
                >
                  Show passwords
                </label>
              </div>

              <button
                type="submit"
                className="btn btn-success w-100"
                disabled={loading || Boolean(success)}
              >
                {loading
                  ? "Resetting Password..."
                  : "Reset Password"}
              </button>
            </form>
          )}

          <div className="text-center mt-4">
            <Link to="/login">
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

);
}

export default ResetPassword;
