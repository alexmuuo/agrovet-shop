import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/api";

function Login() {
const [isRegister, setIsRegister] = useState(false);

const [name, setName] = useState("");
const [phone, setPhone] = useState("");
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [confirmPassword, setConfirmPassword] = useState("");

const [showPassword, setShowPassword] = useState(false);
const [loading, setLoading] = useState(false);
const [error, setError] = useState("");
const [success, setSuccess] = useState("");

const navigate = useNavigate();

const resetMessages = () => {
setError("");
setSuccess("");
};

// =========================================================
// SAVE CUSTOMER SESSION
// =========================================================

const saveCustomerSession = (customer, token) => {
if (!customer || !customer.id || !token) {
throw new Error(
"Authentication response is missing customer details."
);
}


localStorage.removeItem("customer");
localStorage.removeItem("customerToken");

localStorage.setItem("customer", JSON.stringify(customer));
localStorage.setItem("customerToken", token);

window.dispatchEvent(new Event("customerLogin"));


};

// =========================================================
// CUSTOMER LOGIN
// =========================================================

const handleLogin = async (e) => {
e.preventDefault();


resetMessages();
setLoading(true);

try {
  const response = await api.post("/customers/login", {
    phone: phone.trim(),
    password,
  });

  const { customer, token } = response.data;

  saveCustomerSession(customer, token);

  navigate("/");
} catch (err) {
  setError(
    err.response?.data?.message ||
      err.message ||
      "Login failed. Please check your details and try again."
  );
} finally {
  setLoading(false);
}


};

// =========================================================
// CUSTOMER REGISTRATION
// =========================================================

const handleRegister = async (e) => {
e.preventDefault();


resetMessages();

if (password.length < 6) {
  setError("Password must be at least 6 characters long.");
  return;
}

if (password !== confirmPassword) {
  setError("Passwords do not match.");
  return;
}

setLoading(true);

try {
  const response = await api.post("/customers/register", {
    name: name.trim(),
    phone: phone.trim(),
    email: email.trim() || null,
    password,
  });

  if (response.data.status !== "success") {
    setError(
      response.data.message ||
        "Registration failed. Please try again."
    );
    return;
  }

  const loginResponse = await api.post("/customers/login", {
    phone: phone.trim(),
    password,
  });

  const { customer, token } = loginResponse.data;

  saveCustomerSession(customer, token);

  setName("");
  setPhone("");
  setEmail("");
  setPassword("");
  setConfirmPassword("");
  setIsRegister(false);

  navigate("/");
} catch (err) {
  console.error("Authentication error:", err);

  setError(
    err.response?.data?.message ||
      err.message ||
      "Something went wrong. Please try again."
  );
} finally {
  setLoading(false);
}

};

// =========================================================
// SWITCH BETWEEN LOGIN AND REGISTRATION
// =========================================================

const switchMode = () => {
setIsRegister(!isRegister);


setName("");
setPhone("");
setEmail("");
setPassword("");
setConfirmPassword("");

setShowPassword(false);
resetMessages();


};

// =========================================================
// PASSWORD MATCH INDICATOR
// =========================================================

const passwordsMatch =
confirmPassword.length > 0 &&
password === confirmPassword;

const passwordsDoNotMatch =
confirmPassword.length > 0 &&
password !== confirmPassword;

// =========================================================
// UI
// =========================================================

return ( <div className="container py-5"> <div className="row justify-content-center"> <div className="col-md-7 col-lg-5"> <div className="card shadow-sm border-0"> <div className="card-body p-4 p-md-5"> <h2 className="text-center mb-2">
{isRegister
? "Create Your Account"
: "Customer Login"} </h2>

          <p className="text-center text-muted mb-4">
            {isRegister
              ? "Register to start shopping with us."
              : "Welcome back! Log in to continue shopping."}
          </p>

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          {success && (
            <div className="alert alert-success" role="alert">
              {success}
            </div>
          )}

          <form
            onSubmit={
              isRegister ? handleRegister : handleLogin
            }
          >
            {/* NAME AND EMAIL */}

            {isRegister && (
              <>
                <div className="mb-3">
                  <label htmlFor="name" className="form-label">
                    Full Name
                  </label>

                  <input
                    id="name"
                    type="text"
                    className="form-control"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                </div>

                <div className="mb-3">
                  <label htmlFor="email" className="form-label">
                    Email Address{" "}
                    <span className="text-muted">
                      (Optional)
                    </span>
                  </label>

                  <input
                    id="email"
                    type="email"
                    className="form-control"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
              </>
            )}

            {/* PHONE */}

            <div className="mb-3">
              <label htmlFor="phone" className="form-label">
                Phone Number
              </label>

              <input
                id="phone"
                type="tel"
                className="form-control"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                required
              />
            </div>

            {/* PASSWORD */}

            <div className="mb-3">
              <label htmlFor="password" className="form-label">
                Password
              </label>

              <div className="input-group">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={
                    isRegister
                      ? "new-password"
                      : "current-password"
                  }
                  minLength={6}
                  required
                />

                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() =>
                    setShowPassword(!showPassword)
                  }
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              {isRegister && (
                <small className="text-muted">
                  Use at least 6 characters.
                </small>
              )}
            </div>

            {/* FORGOT PASSWORD */}

            {!isRegister && (
              <div className="text-end mb-3">
                <Link
                  to="/forgot-password"
                  className="text-success text-decoration-none"
                >
                  Forgot Password?
                </Link>
              </div>
            )}

            {/* CONFIRM PASSWORD */}

            {isRegister && (
              <div className="mb-3">
                <label
                  htmlFor="confirmPassword"
                  className="form-label"
                >
                  Confirm Password
                </label>

                <input
                  id="confirmPassword"
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
                  <div className="text-success mt-1">
                    ✓ Passwords match
                  </div>
                )}

                {passwordsDoNotMatch && (
                  <div className="text-danger mt-1">
                    ✗ Passwords do not match
                  </div>
                )}
              </div>
            )}

            {/* SUBMIT */}

            <button
              type="submit"
              className="btn btn-success w-100"
              disabled={loading}
            >
              {loading
                ? isRegister
                  ? "Creating Account..."
                  : "Logging in..."
                : isRegister
                ? "Create Account"
                : "Login"}
            </button>
          </form>

          {/* SWITCH MODE */}

          <div className="text-center mt-4">
            <span className="text-muted">
              {isRegister
                ? "Already have an account? "
                : "Don't have an account? "}
            </span>

            <button
              type="button"
              className="btn btn-link p-0 text-success text-decoration-none"
              onClick={switchMode}
              disabled={loading}
            >
              {isRegister ? "Login" : "Register"}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

);
}

export default Login;
